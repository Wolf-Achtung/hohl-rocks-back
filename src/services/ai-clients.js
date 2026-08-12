// ===================================================================
// AI CLIENT INITIALIZATION
// ===================================================================

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { MODEL, OPENAI_MODEL, PERPLEXITY_MODEL, GEMINI_MODEL, PERPLEXITY_API_KEY, GEMINI_API_KEY, API_TIMEOUT } from "../config/env.js";
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

// Extract the text block from a Claude response. Models like claude-sonnet-5
// run adaptive thinking by default when no `thinking` param is set, so the
// first content block can be a thinking block - content[0].text would then be
// undefined. Refusals arrive as HTTP 200 with an empty content array.
function extractClaudeText(message) {
  if (message.stop_reason === "refusal") {
    throw new Error("Claude refused the request");
  }
  const text = message.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new Error(`Empty Claude response (stop_reason: ${message.stop_reason})`);
  }
  return text;
}

// These are short-form content tasks that don't benefit from extended
// thinking; disabling it keeps latency/cost down and leaves the full
// max_tokens budget for the visible answer. Note: models that force
// thinking on (e.g. claude-fable-5) reject an explicit "disabled" -
// remove this if CLAUDE_MODEL is ever pointed at such a model.
const THINKING_DISABLED = { type: "disabled" };

// Call Claude helper
export async function callClaude(systemPrompt, userPrompt, maxTokens = 1024) {
  if (!anthropic) throw new Error("Anthropic API key not configured");

  const message = await withTimeout(
    anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      thinking: THINKING_DISABLED,
      messages: [{ role: "user", content: userPrompt }]
    }),
    API_TIMEOUT,
    "Claude"
  );

  return extractClaudeText(message);
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
      thinking: THINKING_DISABLED,
      messages: [{ role: "user", content: cleanPrompt }]
    }),
    API_TIMEOUT,
    "Claude"
  );

  return extractClaudeText(message);
}

async function callGPTForBattle(cleanPrompt) {
  if (!openai) throw new Error("OpenAI API key not configured");

  const completion = await withTimeout(
    openai.chat.completions.create({
      model: OPENAI_MODEL,
      // GPT-5-family (and o-series) models reject `max_tokens` with a 400;
      // `max_completion_tokens` is the accepted parameter. It covers the
      // invisible reasoning tokens too - at 1024 the reasoning could eat the
      // whole budget and the call returned HTTP 200 with content: "" and
      // finish_reason "length". The extra headroom is only spent if the model
      // actually reasons that long.
      max_completion_tokens: 4096,
      messages: [{ role: "user", content: cleanPrompt }]
    }),
    API_TIMEOUT,
    "GPT"
  );

  const choice = completion.choices?.[0];
  const text = choice?.message?.content;
  if (!text) {
    throw new Error(`Empty GPT response (finish_reason: ${choice?.finish_reason})`);
  }
  return text;
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
        model: PERPLEXITY_MODEL,
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
      // Key goes in a header, not the URL - query strings end up in proxy
      // logs and error messages.
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: cleanPrompt }] }],
          generationConfig: {
            // Gemini counts its internal thinking against this budget, so 1024
            // truncated answers mid-sentence (visible in the UI as a dangling
            // "**" from an unclosed bold marker).
            maxOutputTokens: 4096,
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
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join("");
    if (!text) {
      throw new Error(`Empty Gemini response (finishReason: ${candidate?.finishReason})`);
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Model registry with metadata
const BATTLE_MODELS = [
  { id: "claude", name: "Claude Sonnet 5", callFn: callClaudeForBattle },
  { id: "gpt", name: "GPT-5 Mini", callFn: callGPTForBattle },
  { id: "perplexity", name: "Perplexity Sonar Pro", callFn: callPerplexityForBattle },
  { id: "gemini", name: "Gemini 3.5 Flash", callFn: callGeminiForBattle },
];

// Turn a provider error into a short German line the visitor can act on.
// The SDK clients carry error.status; the fetch-based ones (Perplexity,
// Gemini) put the status into the message, so both are checked.
export function describeBattleError(error) {
  const message = error.message || "";
  const status = error.status ?? Number(message.match(/API error: (\d{3})/)?.[1]);

  if (error.name === "AbortError" || /timeout|Zeitüberschreitung/i.test(message)) {
    return "Zeitüberschreitung";
  }
  if (/not configured/i.test(message)) return "API-Key nicht hinterlegt";
  if (status === 401 || status === 403) return "API-Key ungültig";
  if (status === 404) return "Modell nicht verfügbar";
  if (status === 429) return "Anfrage-Limit erreicht";
  if (status === 400) return "Anfrage abgelehnt";
  if (status >= 500) return "Anbieter-Störung";
  if (/^Empty |refused/i.test(message)) return "Keine Antwort erzeugt";
  return "Service vorübergehend nicht verfügbar";
}

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
        // warn, not debug: debug is silenced in production, which is exactly
        // where we need to see why a model dropped out.
        log.warn(`Model Battle - ${model.name} failed: ${error.message}`);

        return {
          model: model.id,
          name: model.name,
          response: null,
          error: describeBattleError(error),
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
      thinking: THINKING_DISABLED,
      messages: userMessages
    }),
    API_TIMEOUT,
    "Claude Chat"
  );

  return extractClaudeText(response);
}
