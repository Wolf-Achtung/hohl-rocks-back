// api/server/share.llm.js - OPTIMIERT v2.0
const https = require('https');

// ===== PROVIDER CONFIGURATIONS =====

const providers = {
  anthropic: {
    host: 'api.anthropic.com',
    path: '/v1/messages',
    model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY,
    enabled: false
  },
  openai: {
    host: 'api.openai.com',
    path: '/v1/chat/completions',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    enabled: false
  },
  perplexity: {
    host: 'api.perplexity.ai',
    path: '/chat/completions',
    model: process.env.PERPLEXITY_MODEL || 'sonar-pro',
    apiKey: process.env.PERPLEXITY_API_KEY,
    enabled: false
  },
  openrouter: {
    host: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku:beta',
    apiKey: process.env.OPENROUTER_API_KEY,
    enabled: false
  }
};

// Initialize: Check which providers are enabled
function initProviders() {
  for (const [name, config] of Object.entries(providers)) {
    const hasKey = config.apiKey && 
                   config.apiKey !== 'xxx' && 
                   config.apiKey !== '__SET_ME__';
    config.enabled = hasKey;
    console.log(`[LLM] Provider ${name}:`, config.enabled ? '✅ Enabled' : '❌ Disabled');
  }
}

initProviders();

// ===== REQUEST BUILDER =====

function buildRequest(provider, messages, options = {}) {
  const config = providers[provider];
  
  if (!config || !config.enabled) {
    throw new Error(`Provider ${provider} not available`);
  }

  let requestBody;
  let headers;

  if (provider === 'anthropic') {
    // Anthropic API format
    requestBody = JSON.stringify({
      model: config.model,
      max_tokens: options.max_tokens || 1500,
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
      max_tokens: options.max_tokens || 1500,
      temperature: options.temperature || 0.7,
      stream: false
    });
    
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Length': Buffer.byteLength(requestBody)
    };
  }

  return { requestBody, headers, config };
}

// ===== API REQUEST =====

async function makeRequest(provider, messages, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeout || 30000; // 30 seconds default
    
    try {
      const { requestBody, headers, config } = buildRequest(provider, messages, options);
      
      const req = https.request({
        hostname: config.host,
        port: 443,
        path: config.path,
        method: 'POST',
        headers: headers,
        timeout: timeoutMs
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => data += chunk);
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            
            if (res.statusCode >= 400) {
              const errorMsg = parsed.error?.message || parsed.message || data;
              reject(new Error(`${provider} API error (${res.statusCode}): ${errorMsg}`));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error(`Failed to parse ${provider} response: ${e.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`${provider} request failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`${provider} request timed out after ${timeoutMs}ms`));
      });

      req.write(requestBody);
      req.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

// ===== RESPONSE PARSER =====

function parseResponse(provider, response) {
  try {
    let text, usage;
    
    if (provider === 'anthropic') {
      text = response.content?.[0]?.text || '';
      usage = response.usage;
    } else {
      // OpenAI-compatible format
      text = response.choices?.[0]?.message?.content || '';
      usage = response.usage;
    }
    
    return { text, usage };
  } catch (error) {
    throw new Error(`Failed to parse ${provider} response: ${error.message}`);
  }
}

// ===== MAIN GENERATION FUNCTION =====

async function generate({ prompt, model, messages, eu = false, max_tokens, temperature }) {
  try {
    // Build messages array if not provided
    if (!messages) {
      messages = [
        { role: 'user', content: prompt }
      ];
    }

    // Determine provider priority order
    let providerOrder = eu 
      ? ['anthropic', 'openai'] // EU-preferred: Claude is EU-based
      : ['anthropic', 'openai', 'perplexity', 'openrouter'];

    // Filter to only enabled providers
    providerOrder = providerOrder.filter(p => providers[p]?.enabled);

    if (providerOrder.length === 0) {
      console.warn('[LLM] No providers enabled');
      return {
        text: 'KI-Generierung ist momentan nicht verfügbar. Bitte API-Keys konfigurieren.',
        model: 'none',
        provider: 'none',
        error: 'No providers available'
      };
    }

    console.log('[LLM] Provider order:', providerOrder.join(' -> '));

    // Try providers in order
    for (let i = 0; i < providerOrder.length; i++) {
      const provider = providerOrder[i];
      const isLastProvider = i === providerOrder.length - 1;
      
      try {
        console.log(`[LLM] Trying ${provider}...`);
        
        const response = await makeRequest(provider, messages, {
          max_tokens,
          temperature,
          timeout: 30000
        });
        
        const { text, usage } = parseResponse(provider, response);
        
        if (!text || text.length === 0) {
          throw new Error('Empty response from API');
        }
        
        console.log(`[LLM] Success with ${provider} (${text.length} chars)`);
        
        return {
          text,
          model: providers[provider].model,
          provider,
          usage,
          success: true
        };
        
      } catch (error) {
        console.error(`[LLM] ${provider} failed:`, error.message);
        
        // If this is the last provider, throw the error
        if (isLastProvider) {
          throw error;
        }
        
        // Otherwise, continue to next provider
        console.log(`[LLM] Falling back to next provider...`);
      }
    }

    // This should never be reached, but just in case
    throw new Error('All providers failed');
    
  } catch (error) {
    console.error('[LLM] Generation error:', error.message);
    
    return {
      text: 'Entschuldigung, die KI-Generierung ist momentan nicht verfügbar.',
      model: 'none',
      provider: 'none',
      error: error.message,
      success: false
    };
  }
}

// ===== STREAMING GENERATION =====

function streamGenerate({ prompt, model, onToken, onComplete, onError, eu = false }) {
  // Simplified streaming implementation
  // For production, implement proper SSE streaming
  
  generate({ prompt, model, eu })
    .then(result => {
      if (!result.success) {
        onError(new Error(result.error));
        return;
      }
      
      const text = result.text;
      const words = text.split(' ');
      let index = 0;
      
      const interval = setInterval(() => {
        if (index < words.length) {
          onToken(words[index] + ' ');
          index++;
        } else {
          clearInterval(interval);
          onComplete(result);
        }
      }, 50);
    })
    .catch(onError);
}

// ===== PROVIDER STATUS =====

function getProviderStatus() {
  const status = {};
  
  for (const [name, config] of Object.entries(providers)) {
    status[name] = {
      enabled: config.enabled,
      model: config.model,
      host: config.host
    };
  }
  
  return status;
}

// ===== EXPORTS =====

module.exports = { 
  generate, 
  streamGenerate,
  getProviderStatus,
  providers 
};
