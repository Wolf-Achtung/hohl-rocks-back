// ===================================================================
// STRUCTURED LOGGING
// ===================================================================

const NODE_ENV = process.env.NODE_ENV || "development";

function formatMessage(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const extra = args.length > 0 ? ` ${args.join(' ')}` : '';

  if (NODE_ENV === "production") {
    // JSON structured logging for production
    return JSON.stringify({
      timestamp,
      level,
      message: `${message}${extra}`,
    });
  }

  // Human-readable for development
  const icons = { info: 'ℹ️', warn: '⚠️', error: '❌', debug: '🔍' };
  return `[${timestamp}] ${icons[level] || ''} ${message}${extra}`;
}

export const log = {
  info(message, ...args) {
    console.log(formatMessage('info', message, ...args));
  },
  warn(message, ...args) {
    console.warn(formatMessage('warn', message, ...args));
  },
  error(message, ...args) {
    console.error(formatMessage('error', message, ...args));
  },
  debug(message, ...args) {
    if (NODE_ENV === "development") {
      console.log(formatMessage('debug', message, ...args));
    }
  }
};
