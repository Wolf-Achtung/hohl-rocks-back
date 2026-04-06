// ===================================================================
// AI CLIENT INITIALIZATION
// ===================================================================

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { MODEL, PERPLEXITY_API_KEY, GEMINI_API_KEY, API_TIMEOUT } from "../config/env.js";
import { log } from "../utils/logger.js";
import { withTimeout } from "../utils/helpers.js";

// Anthropic (Claude) - required
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// OpenAI (GPT) - optional
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Call Claude helper
export async function callClaude(systemPrompt, userPrompt, maxTokens = 1024) {
  if (!anthropic) throw new Error("Anthropic API key not configured");

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  return message.content[0].text;
}

// Validate API keys at startup
export function validateApiKeys() {
  const missing = [];
  const optional = [];

  if (!process.env.ANTHROPIC_API_KEY) {
    missing.push("ANTHROPIC_API_KEY (REQUIRED)");
  }
  if (!process.env.OPENAI_API_KEY) {
    optional.push("OPENAI_API_KEY (GPT unavailable in Model Battle)");
  }
  if (!PERPLEXITY_API_KEY) {
    optional.push("PERPLEXITY_API_KEY (Perplexity unavailable in Model Battle)");
  }
  if (!GEMINI_API_KEY) {
    optional.push("GEMINI_API_KEY (Gemini unavailable in Model Battle)");
  }

  if (missing.length > 0) {
    log.error('REQUIRED API KEYS MISSING:', missing.join(', '));
  }
  if (optional.length > 0) {
    log.warn('Optional API keys missing (graceful degradation):', optional.join(', '));
  }
  if (missing.length === 0 && optional.length === 0) {
    log.info('All API keys validated (4/4 configured)');
  }

  return missing.length === 0;
}

// ===================================================================
// MODEL BATTLE - Parallel AI calls with graceful degradation
// ===================================================================

async function callClaudeForBattle(cleanPrompt) {
  if (!anthropic) throw new Error("Anthropic API key not configured");

  const message = await withTimeout(
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: cleanPrompt }]
    }),
    API_TIMEOUT,
    "Claude"
  );

  return message.content[0].text;
}

async function callGPTForBattle(cleanPrompt) {
  if (!openai) throw new Error("OpenAI API key not configured");

  const completion = await withTimeout(
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [{ role: "user", content: cleanPrompt }]
    }),
    API_TIMEOUT,
    "GPT"
  );

  return completion.choices[0].message.content;
}

async function callPerplexityForBattle(cleanPrompt) {
  if (!PERPLEXITY_API_KEY) throw new Error("Perplexity API key not configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        model: "sonar-pro",
        max_tokens: 1024,
        messages: [{ role: "user", content: cleanPrompt }]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Perplexity API error: ${response.status} ${errorBody.slice(0, 100)}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGeminiForBattle(cleanPrompt) {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key not configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: cleanPrompt }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7
          }
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Gemini API error: ${response.status} ${errorBody.slice(0, 100)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty Gemini response");
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Model registry with metadata
const BATTLE_MODELS = [
  { id: "claude", name: "Claude Sonnet 4", callFn: callClaudeForBattle },
  { id: "gpt", name: "GPT-4o Mini", callFn: callGPTForBattle },
  { id: "perplexity", name: "Perplexity Sonar Pro", callFn: callPerplexityForBattle },
  { id: "gemini", name: "Gemini 2.0 Flash", callFn: callGeminiForBattle },
];

export async function runModelBattle(cleanPrompt) {
  const results = await Promise.allSettled(
    BATTLE_MODELS.map(async (model) => {
      const startTime = Date.now();
      try {
        const response = await model.callFn(cleanPrompt);
        return {
          model: model.id,
          name: model.name,
          response,
          responseTime: Date.now() - startTime,
          success: true
        };
      } catch (error) {
        log.debug(`${model.name} error: ${error.message}`);

        let errorMessage = "Service vorübergehend nicht verfügbar";
        if (error.message.includes('timeout') || error.name === 'AbortError') {
          errorMessage = "Zeitüberschreitung";
        } else if (error.message.includes('not configured')) {
          errorMessage = "API Key nicht konfiguriert";
        }

        return {
          model: model.id,
          name: model.name,
          response: null,
          error: errorMessage,
          responseTime: Date.now() - startTime,
          success: false
        };
      }
    })
  );

  return results.map(result =>
    result.status === 'fulfilled' ? result.value : {
      model: "unknown",
      name: "Unknown Model",
      response: null,
      error: "Unerwarteter Fehler",
      responseTime: 0,
      success: false
    }
  );
}

// Chat with Claude (for /api/chat endpoint)
export async function chatWithClaude({ systemMessage, userMessages, maxTokens = 1024 }) {
  if (!anthropic) throw new Error("Anthropic API key not configured");

  const response = await withTimeout(
    anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemMessage || undefined,
      messages: userMessages
    }),
    API_TIMEOUT,
    "Claude Chat"
  );

  return response.content[0].text;
}
