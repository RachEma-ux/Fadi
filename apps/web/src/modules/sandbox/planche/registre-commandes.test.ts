import { describe, expect, it } from "vitest";
import { OUTILS, normaliserRaccourci } from "@parcours/sandbox-planche-model";
import { REGISTRE_COMMANDES, commandeDuClavier, routeeParLeRegistre } from "./registre-commandes";
import { pictoOutil, raccourciOutil, type Cle } from "./outils-planche";

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
  return { key, code: lettre ? `Key${touche}` : undefined, ctrlKey, shiftKey, altKey };
}

describe("Registre unique des commandes (lot 9, EX-CMD-01)", () => {
  it("identifiants, icônes et raccourcis uniques ; aucun raccourci d'outil repris", () => {
    const ids = REGISTRE_COMMANDES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(REGISTRE_COMMANDES.map((c) => c.picto)).size).toBe(ids.length);
    const r = REGISTRE_COMMANDES.map((c) => normaliserRaccourci(c.raccourci));
    expect(new Set(r).size).toBe(r.length);
    const outils = new Set(OUTILS.map((o) => raccourciOutil(o)).filter((x): x is string => x !== null).map(normaliserRaccourci));
    for (const x of r) expect(outils.has(x), `raccourci ${x} pris par un outil`).toBe(false);
  });

  it("règle d'or (revue de #128) : aucune icône de commande ne reprend celle d'un outil", () => {
    const pictos = new Map(OUTILS.map((o) => [pictoOutil(o.id), o.id] as const));
    for (const c of REGISTRE_COMMANDES) expect(pictos.get(c.picto), `icône ${c.picto} de « ${c.id} » prise par un outil`).toBeUndefined();
  });

  it("chaque commande routée par le registre se retrouve depuis son événement clavier, y compris sous macOS (Option)", () => {
    for (const c of REGISTRE_COMMANDES.filter(routeeParLeRegistre)) {
      expect(commandeDuClavier(evenement(c.raccourci))?.id, c.raccourci).toBe(c.id);
      if (c.raccourci.includes("Alt")) expect(commandeDuClavier(evenement(c.raccourci, true))?.id, `${c.raccourci} (macOS)`).toBe(c.id);
    }
    // Les commandes à touche nue ou à Échap / Origine gardent leur garde dans la Planche.
    expect(REGISTRE_COMMANDES.filter((c) => !routeeParLeRegistre(c)).map((c) => c.id).sort()).toEqual(["composant", "fermer", "fermer-tout"]);
  });

  it("une touche sans commande ne résout rien", () => {
    expect(commandeDuClavier({ key: "q", ctrlKey: false, shiftKey: false, altKey: true, code: "KeyQ" })).toBeNull();
    expect(commandeDuClavier({ key: "ArrowLeft", ctrlKey: false, shiftKey: false, altKey: false })).toBeNull();
  });
});
