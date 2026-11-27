import { describe, expect, it } from "vitest";
import { OUTILS, normaliserRaccourci } from "@parcours/sandbox-planche-model";
import { COMMANDES_DEUX_TEMPS, REGISTRE_COMMANDES, commandeDuClavier, commandeDuSecondTemps, estEntreeDeuxTemps, routeeParLeRegistre } from "./registre-commandes";
import { secondTemps } from "@parcours/sandbox-planche-model";
import { pictoOutil, raccourciOutil, type Cle } from "./outils-planche";
import { clePictogramme, type Pictogramme as DescriptionPictogramme } from "@parcours/sandbox-planche-model";

/** Clé comparable d'un pictogramme (lot 3 : objets, plus des caractères). */
const k = (p: DescriptionPictogramme): string => clePictogramme(p);

/** Événement clavier d'un raccourci canonique ; `mac` : Option change le caractère (seule la touche physique dit la lettre). */
function evenement(r: string, mac = false): Cle {
  const morceaux = r.split("+");
  const touche = morceaux[morceaux.length - 1]!;
  const shiftKey = morceaux.includes("Maj");
  const altKey = morceaux.includes("Alt");
  const ctrlKey = morceaux.includes("Ctrl");
  const lettre = /^[A-Z]$/.test(touche);
  let key = touche === "Échap" ? "Escape" : touche === "Origine" ? "Home" : lettre ? (shiftKey ? touche : touche.toLowerCase()) : touche;
  if (mac && altKey && lettre) key = "∏";
  // Chiffre sous Maj (cas 2, lot 4 : Ctrl + Maj + chiffre) : la touche donne un signe (« ! » en QWERTY, « + » en QWERTZ).
  const chiffre = /^[0-9]$/.test(touche);
  if (chiffre && shiftKey) key = "!";
  return { key, code: lettre ? `Key${touche}` : chiffre ? `Digit${touche}` : undefined, ctrlKey, shiftKey, altKey };
}

describe("Registre unique des commandes (lot 9, EX-CMD-01)", () => {
  it("identifiants, icônes et raccourcis uniques ; aucun raccourci d'outil repris", () => {
    const ids = REGISTRE_COMMANDES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(REGISTRE_COMMANDES.map((c) => k(c.picto))).size).toBe(ids.length);
    const r = REGISTRE_COMMANDES.map((c) => normaliserRaccourci(c.raccourci));
    expect(new Set(r).size).toBe(r.length);
    const outils = new Set(OUTILS.map((o) => raccourciOutil(o)).filter((x): x is string => x !== null).map(normaliserRaccourci));
    for (const x of r) expect(outils.has(x), `raccourci ${x} pris par un outil`).toBe(false);
  });

  it("règle d'or (revue de #128) : aucune icône de commande ne reprend celle d'un outil", () => {
    const pictos = new Map(OUTILS.map((o) => [k(pictoOutil(o.id)), o.id] as const));
    for (const c of REGISTRE_COMMANDES) expect(pictos.get(k(c.picto)), `icône ${k(c.picto)} de « ${c.id} » prise par un outil`).toBeUndefined();
  });

  it("chaque commande routée par le registre se retrouve depuis son événement clavier, y compris sous macOS (Option)", () => {
    for (const c of REGISTRE_COMMANDES.filter((x) => routeeParLeRegistre(x) && secondTemps(x.raccourci) === null)) {
      expect(commandeDuClavier(evenement(c.raccourci))?.id, c.raccourci).toBe(c.id);
      if (c.raccourci.includes("Alt")) expect(commandeDuClavier(evenement(c.raccourci, true))?.id, `${c.raccourci} (macOS)`).toBe(c.id);
    }
    // Les commandes à touche nue ou à Échap / Origine gardent leur garde dans la Planche.
    expect(REGISTRE_COMMANDES.filter((c) => !routeeParLeRegistre(c)).map((c) => c.id).sort()).toEqual(["composant", "fermer", "fermer-tout"]);
  });

  it("raccourcis en deux temps : Ctrl+Maj+Espace est l'entrée, la seconde touche (avec ou sans Maj) résout la commande", () => {
    expect(estEntreeDeuxTemps({ key: " ", ctrlKey: true, shiftKey: true, altKey: false })).toBe(true);
    expect(estEntreeDeuxTemps({ key: " ", ctrlKey: true, shiftKey: false, altKey: false })).toBe(false);
    expect(COMMANDES_DEUX_TEMPS.map((c) => c.id)).toEqual([
      "versions", "poser-jalon", "consultation", "comparer", "brouillon", "fiche-projet", "appliquer-brouillon", "garder-brouillon", "abandonner-brouillon",
      "extrusion-hauteur", "creer-couches", "prolonger-arete", "murs-en-couches", "composants-agence", "ajuster-baie", "remplacer-occurrences", "importer-composant",
      "soustraire-garder", "caler-deux-points", "selection-altitudes", "selection-boite", "miroir-lisible", "ecreter-enveloppe", "vue-ortho", "eclater-axonometrie", "echelle-graphique", "aire-projetee",
    ]);
    // Lot 8 : un chiffre est lu sur la touche physique (AZERTY : « & » sans Maj, « 1 » avec ; QWERTY : « ! » avec Maj).
    const AZERTY: Readonly<Record<string, string>> = { "1": "&", "2": "é", "3": '"', "4": "'", "5": "(", "6": "-", "7": "è", "8": "_", "9": "ç", "0": "à" };
    const QWERTY_MAJ: Readonly<Record<string, string>> = { "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(", "0": ")" };
    for (const c of COMMANDES_DEUX_TEMPS) {
      const s = secondTemps(c.raccourci)!;
      const maj = s.startsWith("Maj+");
      const touche = s.slice(maj ? 4 : 0);
      if (/^[0-9]$/.test(touche)) {
        const code = `Digit${touche}`;
        expect(commandeDuSecondTemps({ key: maj ? touche : AZERTY[touche]!, code, ctrlKey: false, shiftKey: maj, altKey: false })?.id, `${c.raccourci} (AZERTY)`).toBe(c.id);
        expect(commandeDuSecondTemps({ key: maj ? QWERTY_MAJ[touche]! : touche, code, ctrlKey: false, shiftKey: maj, altKey: false })?.id, `${c.raccourci} (QWERTY)`).toBe(c.id);
        continue;
      }
      expect(commandeDuSecondTemps({ key: maj ? touche : touche.toLowerCase(), code: `Key${touche}`, ctrlKey: false, shiftKey: maj, altKey: false })?.id, c.raccourci).toBe(c.id);
    }
    // Un vrai KeyboardEvent : ses modificateurs sont des accesseurs du prototype, perdus par un étalement.
    class Evenement {
      get key() { return "!"; }
      get code() { return "Digit1"; }
      get shiftKey() { return true; }
      get ctrlKey() { return false; }
      get altKey() { return false; }
      get metaKey() { return false; }
    }
    expect(commandeDuSecondTemps(new Evenement())?.id, "Maj+1 lu sur un événement à accesseurs").toBe("vue-ortho");
    expect(commandeDuClavier({ key: " ", ctrlKey: true, shiftKey: true, altKey: false }), "l'entrée seule n'exécute rien").toBeNull();
    expect(commandeDuSecondTemps({ key: "v", code: "KeyV", ctrlKey: false, shiftKey: false, altKey: false })?.id).toBe("versions");
    expect(commandeDuSecondTemps({ key: "V", code: "KeyV", ctrlKey: false, shiftKey: true, altKey: false })?.id).toBe("brouillon");
  });

  it("une touche sans commande ne résout rien", () => {
    expect(commandeDuClavier({ key: "q", ctrlKey: false, shiftKey: false, altKey: true, code: "KeyQ" })).toBeNull();
    expect(commandeDuClavier({ key: "ArrowLeft", ctrlKey: false, shiftKey: false, altKey: false })).toBeNull();
  });
});
