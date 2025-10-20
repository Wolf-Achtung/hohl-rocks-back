// server/cors.js
function getCorsConfig() {
  // Get allowed origins from environment variables
  const allowlistString = process.env.CORS_ALLOWLIST || 
                          process.env.ALLOWED_ORIGINS || 
                          'http://localhost:3000,http://localhost:8080';
  
  const allowlist = allowlistString
    .split(',')
    .map(url => url.trim())
    .filter(url => url.length > 0);
  
  console.log('[CORS] Configured allowed origins:', allowlist);
  
  return {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, Postman, or same-origin)
      if (!origin) {
        callback(null, true);
        return;
      }
      
      // Check if origin is in allowlist
      if (allowlist.includes(origin)) {
        callback(null, true);
        return;
      }
      
      // Check for wildcard domains (e.g., *.netlify.app)
      const wildcardMatch = allowlist.some(allowed => {
        if (allowed.includes('*')) {
          // Convert wildcard to regex pattern
          const pattern = allowed
            .replace(/\./g, '\\.')  // Escape dots
            .replace(/\*/g, '.*');  // Replace * with .*
          const regex = new RegExp(`^${pattern}$`);
          return regex.test(origin);
        }
        return false;
      });
      
      if (wildcardMatch) {
        callback(null, true);
        return;
      }
      
      // Origin not allowed
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
    },
    
    credentials: true,
    
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-API-Key'
    ],
    
    exposedHeaders: [
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'X-Total-Count'
    ],
    
    maxAge: 86400, // Cache preflight for 24 hours
    
    optionsSuccessStatus: 204 // Some legacy browsers choke on 204
  };
}

// Helper function to check if an origin is allowed
function isOriginAllowed(origin) {
  const config = getCorsConfig();
  let allowed = false;
  
  config.origin(origin, (err, result) => {
    allowed = !err && result;
  });
  
  return allowed;
}

// Middleware for manual CORS headers (fallback)
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, X-API-Key');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, X-Total-Count');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
  } else {
    next();
  }
}

module.exports = { 
  getCorsConfig, 
  isOriginAllowed,
  corsMiddleware 
};