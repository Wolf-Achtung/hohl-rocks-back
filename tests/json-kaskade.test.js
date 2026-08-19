import { describe, it, expect } from "vitest";
import { parseJsonFromModel } from "../src/utils/helpers.js";

// Die Kaskade hatte drei Anlaeufe, aber nur einen try/catch: Anlauf zwei und
// drei standen ungesichert im catch des ersten. Warf Anlauf zwei, war Anlauf
// drei nicht mehr erreichbar.
describe("parseJsonFromModel", () => {
  it("nimmt rohes JSON", () => {
    expect(parseJsonFromModel('{"theme":"Analyse"}')).toEqual({ theme: "Analyse" });
  });

  it("holt JSON aus einem ```json-Block", () => {
    const antwort = 'Gerne!\n```json\n{"score": 8}\n```\nViel Erfolg.';
    expect(parseJsonFromModel(antwort)).toEqual({ score: 8 });
  });

  it("holt JSON aus Fliesstext ohne Codeblock", () => {
    expect(parseJsonFromModel('Hier: {"badge":"gold"} - fertig.')).toEqual({ badge: "gold" });
  });

  // Der eigentliche Regressionstest: der Codeblock ist da, sein Inhalt aber
  // kaputt. Vorher warf JSON.parse in Anlauf zwei, und der dritte Anlauf -
  // genau fuer diesen Fall gebaut - kam nie zum Zug.
  it("faellt auf den dritten Anlauf durch, wenn der Codeblock kein JSON enthaelt", () => {
    // Anlauf 2 trifft den Codeblock und bekommt Prosa - JSON.parse wirft.
    // Vorher endete die Kaskade hier; Anlauf 3, der das Objekt daneben
    // gefunden haette, kam nicht mehr dran.
    const antwort = '```json\nEntschuldigung, gleich richtig:\n```\n{"score": 9}';
    expect(parseJsonFromModel(antwort)).toEqual({ score: 9 });
  });

  // Anlauf 3 greift greedy vom ersten { bis zum letzten }. Bei zwei Objekten
  // im Text spannt er ueber beide und kann nicht parsen - eine Grenze der
  // Kaskade, die hier festgehalten ist, damit sie niemand fuer einen Regress
  // haelt.
  it("scheitert nachvollziehbar, wenn zwei getrennte Objekte im Text stehen", () => {
    const antwort = '```json\n{"score": 8,,,}\n```\nNachtrag: {"score": 9}';
    expect(() => parseJsonFromModel(antwort)).toThrow(/Kein JSON-Objekt/);
  });

  it("nennt den Kontext, wenn alle drei Anlaeufe scheitern", () => {
    expect(() => parseJsonFromModel("Ich kann das leider nicht.", "Daily-Challenge"))
      .toThrow(/Kein JSON-Objekt in Daily-Challenge/);
  });

  // Ein abgeschnittenes JSON ist gueltiger Text, aber kein gueltiges JSON.
  // Wichtig ist, dass daraus eine benannte Ursache wird statt eines nackten
  // SyntaxError, den der Aufrufer als "Ein Fehler ist aufgetreten" weiterreicht.
  it("meldet abgeschnittenes JSON als Kontextfehler, nicht als SyntaxError", () => {
    const abgeschnitten = '{"theme":"Analyse","challenges":{"beginner":{"title":"Anf';
    expect(() => parseJsonFromModel(abgeschnitten, "Daily-Challenge"))
      .toThrow(/Kein JSON-Objekt in Daily-Challenge/);
  });

  // "42" und '"text"' sind gueltiges JSON, aber kein Objekt. Ohne diese
  // Pruefung faellt das erst beim Zugriff auf ein Feld auf.
  it("laesst einen nackten Skalar nicht als Ergebnis durchgehen", () => {
    expect(() => parseJsonFromModel("42")).toThrow(/Kein JSON-Objekt/);
  });
});
