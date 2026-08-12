// ===================================================================
// CONTENT MODERATION
// ===================================================================
// Vorher stand hier eine Teilwortliste ('waffe', 'angriff', ...). Die hat
// ausgerechnet das Kerngeschaeft dieser Seite blockiert: "Wie schuetzen wir
// uns vor Angriffen auf unsere KI?" enthaelt "angriff" und flog raus.
//
// Jetzt zaehlt die Absicht, nicht das Vokabular: geprueft wird, ob eine
// Anleitung zu etwas Schaedlichem verlangt wird - also ein auffordernder
// Ausdruck in der Naehe eines schaedlichen Gegenstands. Ueber Waffen,
// Angriffe oder Schadsoftware zu SPRECHEN bleibt erlaubt; eine BAUANLEITUNG
// dafuer nicht. Das ist die Grenze, die fuer eine Beratungsseite passt.

// Auffordernde Ausdruecke - "wie baue ich", "gib mir eine Anleitung", ...
const HOWTO = "(wie\\s+(?:baue?|bastel\\w*|mache?|stelle?|erstelle?|programmiere?|synthetisiere?|koche?)\\w*|" +
  // Deutscher Nebensatz stellt das Verb ans Ende: "wie ich eine Bombe baue"
  "wie\\s+(?:ich|man|wir|du)\\b|" +
  "how\\s+(?:to|do\\s+i)\\s+(?:make|build|create|synthes\\w*|cook)|" +
  "anleitung|schritt\\s*f(?:ue|ü)r\\s*schritt|bauplan|rezept|tutorial|" +
  "step\\s*by\\s*step|instructions\\s+(?:for|to)|" +
  "(?:schreib|erstell|programmier|entwickle|bau)\\w*\\s+(?:mir\\s+)?(?:einen?|eine)?)";

// Schutzkontext schlaegt Verdacht. "Wie erkenne ich Ransomware", "wie wir uns
// vor X schuetzen" - das ist die Sprache der Abwehr, nicht des Angriffs, und
// auf einer Beratungsseite der Normalfall. Lieber einen Angreifer durchlassen
// (die Anbieter lehnen ohnehin ab) als einen Kunden vor den Kopf stossen.
const PROTECTIVE = new RegExp([
  "sch(?:ue|ü)tz\\w*", "schutz", "abwehr\\w*", "absicher\\w*",
  "erkenn\\w*", "entdeck\\w*", "verhinder\\w*", "vorbeug\\w*",
  "reagier\\w*", "sofortma(?:ss|ß)nahm\\w*", "was\\s+tun",
  "protect\\w*", "defen[sd]\\w*", "detect\\w*", "prevent\\w*", "mitigat\\w*"
].join("|"), "i");

// Zwischen Aufforderung und Gegenstand duerfen ein paar Woerter stehen,
// aber kein Satzende - sonst treffen zwei unabhaengige Saetze aufeinander.
const NEAR = "[^.!?\\n]{0,60}";

const RULES = [
  {
    category: "weapons",
    label: "Anleitung zu Waffen oder Sprengstoff",
    objects: "(bombe|sprengsatz|sprengstoff|rohrbombe|schusswaffe|molotow|" +
      "bomb|explosive|pipe\\s*bomb|firearm|silencer|schalld(?:ae|ä)mpfer)"
  },
  {
    category: "malware",
    label: "Schadsoftware oder Angriffswerkzeuge",
    objects: "(malware|ransomware|trojaner|computervirus|keylogger|botnet|botnetz|" +
      "spyware|rootkit|exploit\\s*kit|ddos[\\s-]*(?:tool|angriff|attack))"
  },
  {
    category: "credentials",
    label: "Fremde Zugangsdaten oder Konten übernehmen",
    objects: "(fremde[sn]?\\s+(?:konto|account|passwort)|" +
      "(?:passw(?:o|ö)rter|passwords?|zugangsdaten|credentials)\\s+" +
      "(?:von|of)\\s+\\w+|kreditkartendaten|credit\\s*card\\s*(?:data|numbers))"
  },
  {
    category: "drugs",
    label: "Herstellung von Drogen",
    objects: "(crystal\\s*meth|methamphetamin|kokain|cocaine|heroin|fentanyl|" +
      "lsd|mdma|amphetamin)"
  }
];

// Diese beiden greifen ohne Aufforderungswort - hier zaehlt schon das Thema.
const CSAM = /(kinderporn\w*|child\s*(?:porn|sexual\s+abuse)|minderj(?:ae|ä)hrige[nr]?\s+\w{0,12}\s*(?:sex|nackt))/i;

// Selbstverletzung wird nicht "abgewehrt", sondern beantwortet - siehe unten.
const SELFHARM = new RegExp([
  "bringe?\\s+mich\\s+um", "mich\\s+umbring\\w*", "umbringen",
  "nehme?\\s+mir\\s+das\\s+leben",
  "suizid", "selbstmord", "suicide",
  "kill\\s+myself",
  "selbst\\s*t(?:oe|ö)tung",
  "ritzen"
].join("|"), "i");

// Rollenwechsel-Versuche. Eigene Kategorie, weil der Leitplanken-Test
// genau davon lebt - dort wird sie bewusst uebersprungen.
const JAILBREAK = new RegExp([
  "ignorier\\w*\\s+(?:alle|deine|vorherige)",
  "ignore\\s+(?:all|previous|prior)\\s+(?:instructions|rules)",
  "vergiss\\s+(?:alle|deine)\\s+(?:anweisungen|regeln)",
  "du\\s+bist\\s+jetzt\\s+(?:im\\s+)?(?:entwicklermodus|dan\\b|uneingeschr(?:ae|ä)nkt)",
  "developer\\s*mode",
  "pretend\\s+you\\s+(?:are|have)\\s+no\\s+(?:rules|restrictions)",
  "act\\s+as\\s+(?:if|though)\\s+you\\s+(?:are|were)\\s+(?:un)?restricted",
  "system\\s*prompt\\s+(?:ausgeben|zeigen|verraten|reveal|print)",
  "(?:zeig|gib|verrate|nenn|druck|schreib|print|reveal|show|output)\\w*\\s+(?:mir\\s+)?(?:deine[nr]?|your|den|die|das)?\\s*system\\s*prompt"
].join("|"), "i");

const compiled = RULES.map((rule) => ({
  ...rule,
  // Aufforderung vor Gegenstand ODER Gegenstand vor Aufforderung
  regex: new RegExp(`(?:${HOWTO}${NEAR}${rule.objects}|${rule.objects}${NEAR}${HOWTO})`, "i")
}));

/**
 * Prueft eine Nutzereingabe.
 * @param {string} text
 * @param {{allowJailbreak?: boolean}} options - im Leitplanken-Test sind
 *   Rollenwechsel-Versuche das Testmaterial und werden nicht geblockt.
 * @returns {{flagged: boolean, category?: string, label?: string, care?: boolean}}
 */
export function moderateContent(text, options = {}) {
  if (!text || typeof text !== "string") return { flagged: false };

  if (CSAM.test(text)) {
    return { flagged: true, category: "csam", label: "Sexualisierte Gewalt gegen Kinder" };
  }

  // care: kein Abwehrfall, sondern ein Mensch, der Hilfe braucht
  if (SELFHARM.test(text)) {
    return { flagged: true, category: "selfharm", label: "Selbstverletzung", care: true };
  }

  const defensive = PROTECTIVE.test(text);
  for (const rule of compiled) {
    if (!defensive && rule.regex.test(text)) {
      return { flagged: true, category: rule.category, label: rule.label };
    }
  }

  if (!options.allowJailbreak && JAILBREAK.test(text)) {
    return { flagged: true, category: "jailbreak", label: "Versuch, die Regeln zu überschreiben" };
  }

  return { flagged: false };
}
