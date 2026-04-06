// ===================================================================
// CONTENT MODERATION
// ===================================================================

const BLOCKED_KEYWORDS = [
  'bomb', 'weapon', 'waffe', 'angriff', 'terroris',
  'self-harm', 'suizid', 'suicide',
  'kinderporn', 'child abuse',
  'hack password', 'credit card steal',
  'drug manufacturing', 'drogen herstellung',
  'malware erstellen', 'create virus'
];

const BLOCKED_PATTERNS = [
  /how\s+to\s+(make|build|create)\s+(a\s+)?(bomb|weapon|explosive)/i,
  /wie\s+(baut|macht|erstellt)\s+man\s+(eine?\s+)?(bombe|waffe|sprengstoff)/i,
  /jailbreak|ignore\s+(previous|all)\s+(instructions|rules)/i,
  /pretend\s+you\s+(are|have)\s+no\s+(rules|restrictions)/i,
  /act\s+as\s+(if|though)\s+you\s+(are|were)\s+(?:un)?restricted/i
];

export function moderateContent(text) {
  if (!text || typeof text !== 'string') {
    return { flagged: false };
  }

  const lowerText = text.toLowerCase().trim();

  // Check blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return {
        flagged: true,
        reason: `blocked_keyword:${keyword}`
      };
    }
  }

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        flagged: true,
        reason: `blocked_pattern:${pattern.source.slice(0, 30)}`
      };
    }
  }

  return { flagged: false };
}
