// server/prompts.js
const PROMPTS = [
  {
    id: 'briefing',
    title: 'Briefing-Assistent',
    prompt: 'Erstelle ein Executive Briefing in 6 Bulletpoints. Struktur: Kontext · Zahlen · Risiko · Optionen A/B · Empfehlung · Nächste Schritte.',
    category: 'business',
    tags: ['business', 'executive', 'decision']
  },
  {
    id: 'agenda',
    title: 'Meeting-Agenda (30′)',
    prompt: 'Plane eine effiziente 30-Minuten-Agenda mit klaren Zeitblöcken und erwarteten Ergebnissen.',
    category: 'business',
    tags: ['meeting', 'planning', 'efficiency']
  },
  {
    id: 'pitch',
    title: '60s Pitch',
    prompt: 'Erzeuge einen 60-Sekunden-Pitch mit Hook, Problem, Lösung, Nutzen und Call-to-Action.',
    category: 'business',
    tags: ['pitch', 'presentation', 'sales']
  },
  {
    id: 'risks',
    title: 'Risiko-Analyse',
    prompt: 'Analysiere die 3 größten Risiken, gib Eintrittswahrscheinlichkeit (Low/Med/High) und Gegenmaßnahme.',
    category: 'analysis',
    tags: ['risk', 'analysis', 'planning']
  },
  {
    id: 'excel',
    title: 'Excel/Sheets Formelhilfe',
    prompt: 'Welche Excel/Google-Sheets-Formel löst dieses Problem? Gib die Formel mit Erklärung und Beispiel.',
    category: 'technical',
    tags: ['excel', 'sheets', 'formulas']
  },
  {
    id: 'daily',
    title: 'Täglicher Fokus',
    prompt: 'Gib mir die 3 wichtigsten Aufgaben für heute und je die ersten 2 Schritte.',
    category: 'productivity',
    tags: ['productivity', 'planning', 'daily']
  },
  {
    id: 'creative',
    title: 'Creative Writing',
    prompt: 'Schreibe eine kreative Geschichte über...',
    category: 'creative',
    tags: ['writing', 'creative', 'storytelling']
  },
  {
    id: 'technical',
    title: 'Technical Documentation',
    prompt: 'Erkläre die technischen Details von... strukturiert und verständlich.',
    category: 'technical',
    tags: ['documentation', 'technical', 'explanation']
  },
  {
    id: 'analysis',
    title: 'Data Analysis',
    prompt: 'Analysiere die folgenden Daten und gib mir die wichtigsten Erkenntnisse...',
    category: 'analysis',
    tags: ['data', 'analysis', 'insights']
  },
  {
    id: 'summary',
    title: 'Executive Summary',
    prompt: 'Fasse den folgenden Text als Executive Summary in max. 5 Bulletpoints zusammen.',
    category: 'business',
    tags: ['summary', 'executive', 'brief']
  },
  {
    id: 'translation',
    title: 'Professional Translation',
    prompt: 'Übersetze den folgenden Text professionell und kontextgerecht nach [SPRACHE].',
    category: 'language',
    tags: ['translation', 'language', 'professional']
  },
  {
    id: 'debug',
    title: 'Code Debugging',
    prompt: 'Analysiere diesen Code, finde Fehler und schlage Verbesserungen vor.',
    category: 'technical',
    tags: ['code', 'debugging', 'programming']
  },
  {
    id: 'email',
    title: 'Professional Email',
    prompt: 'Schreibe eine professionelle E-Mail für folgenden Kontext:',
    category: 'communication',
    tags: ['email', 'communication', 'professional']
  },
  {
    id: 'strategy',
    title: 'Strategic Analysis',
    prompt: 'Erstelle eine SWOT-Analyse für folgendes Vorhaben:',
    category: 'strategy',
    tags: ['strategy', 'swot', 'analysis']
  },
  {
    id: 'learning',
    title: '30-Minute Learning Sprint',
    prompt: 'Erstelle einen 30-Minuten-Lernplan für [THEMA] mit Zeitblöcken und 5 Quizfragen.',
    category: 'learning',
    tags: ['learning', 'education', 'sprint']
  }
];

function getTipsList() {
  return PROMPTS.map(p => ({
    id: p.id,
    title: p.title,
    preview: p.prompt.substring(0, 100) + '...',
    category: p.category,
    tags: p.tags
  }));
}

function getPromptById(id) {
  return PROMPTS.find(p => p.id === id);
}

function getPromptsByCategory(category) {
  return PROMPTS.filter(p => p.category === category);
}

function getPromptsByTag(tag) {
  return PROMPTS.filter(p => p.tags && p.tags.includes(tag));
}

function getAllCategories() {
  return [...new Set(PROMPTS.map(p => p.category))];
}

function getAllTags() {
  const allTags = PROMPTS.flatMap(p => p.tags || []);
  return [...new Set(allTags)];
}

module.exports = { 
  PROMPTS, 
  getTipsList,
  getPromptById,
  getPromptsByCategory,
  getPromptsByTag,
  getAllCategories,
  getAllTags
};