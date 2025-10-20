'use strict';

function parseAllowlist(str) {
  if (!str) return [];
  return String(str).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

function makeCorsOptions(allowCsv) {
  const allow = new Set(parseAllowlist(allowCsv));
  return {
    origin(origin, cb) {
      // Healthchecks / server-to-server etc. ohne Origin erlauben
      if (!origin) return cb(null, true);
      if (allow.has(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed: ' + origin), false);
    },
    methods: ['GET','POST','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
    credentials: false,
    maxAge: 86400
  };
}

module.exports = { parseAllowlist, makeCorsOptions };
