// server/share.llm.js
const https = require('https');

// LLM Provider configurations
const providers = {
  openai: {
    host: 'api.openai.com',
    path: '/v1/chat/completions',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
  },
  anthropic: {
    host: 'api.anthropic.com',
    path: '/v1/messages',
    model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  perplexity: {
    host: 'api.perplexity.ai',
    path: '/chat/completions',
    model: process.env.PERPLEXITY_MODEL || 'sonar-pro',
    apiKey: process.env.PERPLEXITY_API_KEY
  },
  openrouter: {
    host: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku:beta',
    apiKey: process.env.OPENROUTER_API_KEY
  }
};

// Make API request to LLM provider
async function makeRequest(provider, messages, options = {}) {
  return new Promise((resolve, reject) => {
    const config = providers[provider];
    if (!config || !config.apiKey) {
      reject(new Error(`Provider ${provider} not configured`));
      return;
    }

    let requestBody;
    let headers;

    if (provider === 'anthropic') {
      // Anthropic API format
      requestBody = JSON.stringify({
        model: config.model,
        max_tokens: options.max_tokens || 1000,
        messages: messages,
        temperature: options.temperature || 0.7
      });
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      };
    } else {
      // OpenAI-compatible format (OpenAI, Perplexity, OpenRouter)
      requestBody = JSON.stringify({
        model: config.model,
        messages: messages,
        max_tokens: options.max_tokens || 1000,
        temperature: options.temperature || 0.7,
        stream: false
      });
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      };
    }

    const req = https.request({
      hostname: config.host,
      port: 443,
      path: config.path,
      method: 'POST',
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`${provider} API error: ${parsed.error?.message || data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse ${provider} response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

// Main generation function
async function generate({ prompt, model, messages, eu = false }) {
  try {
    // Build messages array if not provided
    if (!messages) {
      messages = [
        { role: 'user', content: prompt }
      ];
    }

    // Determine provider based on model or availability
    let provider = 'anthropic'; // Default
    
    if (model) {
      if (model.includes('gpt')) provider = 'openai';
      else if (model.includes('claude')) provider = 'anthropic';
      else if (model.includes('sonar')) provider = 'perplexity';
    }

    // Try providers in order of preference
    const providerOrder = eu 
      ? ['anthropic', 'openai'] // EU-preferred order
      : ['anthropic', 'openai', 'perplexity', 'openrouter'];

    for (const p of providerOrder) {
      if (providers[p]?.apiKey) {
        try {
          console.log(`[LLM] Trying ${p}...`);
          const response = await makeRequest(p, messages);
          
          // Extract text based on provider response format
          let text;
          if (p === 'anthropic') {
            text = response.content?.[0]?.text || '';
          } else {
            text = response.choices?.[0]?.message?.content || '';
          }

          return {
            text,
            model: providers[p].model,
            provider: p,
            usage: response.usage
          };
        } catch (error) {
          console.error(`[LLM] ${p} failed:`, error.message);
          // Continue to next provider
        }
      }
    }

    // All providers failed
    throw new Error('No LLM provider available');
    
  } catch (error) {
    console.error('[LLM] Generation error:', error);
    return {
      text: 'Entschuldigung, die KI-Generierung ist momentan nicht verfügbar.',
      model: 'none',
      provider: 'none',
      error: error.message
    };
  }
}

// Stream generation (for SSE endpoints)
function streamGenerate({ prompt, model, onToken, onComplete, onError }) {
  // This would implement streaming responses
  // For now, we'll use the regular generate and simulate streaming
  generate({ prompt, model })
    .then(result => {
      const text = result.text;
      const words = text.split(' ');
      let index = 0;
      
      const interval = setInterval(() => {
        if (index < words.length) {
          onToken(words[index] + ' ');
          index++;
        } else {
          clearInterval(interval);
          onComplete();
        }
      }, 50); // Simulate streaming
    })
    .catch(onError);
}

// Image generation via Replicate
async function generateImage(prompt) {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('Image generation not configured');
  }

  // Placeholder for Replicate integration
  return {
    url: 'https://via.placeholder.com/512x512',
    prompt,
    provider: 'replicate'
  };
}

module.exports = { 
  generate, 
  streamGenerate, 
  generateImage,
  providers 
};