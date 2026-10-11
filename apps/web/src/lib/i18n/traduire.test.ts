import { describe, expect, it } from "vitest";
import { Traducteur } from "./traduire";
import dico from "./en.json";

describe("traduction de l'interface (D-163)", () => {
  const t = new Traducteur({
    Annuler: "Undo",
    "Étape {0} · {1}": "Step {0} · {1}",
    "{0} objet(s) sélectionné(s).": "{0} object(s) selected.",
    "Mur {0} m": "Wall {0} m",
    "{0} ({1})": "{0} ({1})",
    Mur: "Wall",
    "Rotation {0} puis {0}": "Rotation {0} then {0}",
  });

  it("exact, espaces de bord conservés, inconnu inchangé", () => {
    expect(t.traduire("Annuler")).toBe("Undo");
    expect(t.traduire("  Annuler ")).toBe("  Undo ");
    expect(t.traduire("Bonjour")).toBe("Bonjour");
    expect(t.traduire("")).toBe("");
    expect(t.traduire("→")).toBe("→");
  });

  it("motifs : valeurs reportées, traduites si connues, décimales au point", () => {
    expect(t.traduire("12 objet(s) sélectionné(s).")).toBe("12 object(s) selected.");
    expect(t.traduire("Mur 4,50 m")).toBe("Wall 4.50 m");
    expect(t.traduire("Étape 07 · Mur")).toBe("Step 07 · Wall");
    expect(t.traduire("Rotation 3 puis 3")).toBe("Rotation 3 then 3");
    // Un motif fait seulement de valeurs et de ponctuation n'est jamais appliqué.
    expect(t.traduire("Cuisine (12)")).toBe("Cuisine (12)");
  });

  it("nombres décimaux d'un texte inconnu passés au point", () => {
    expect(t.traduire("x 4,81 · y 7,46 m")).toBe("x 4.81 · y 7.46 m");
  });

  it("consignes dynamiques de la Révolution (Suivez-moi) traduites en entier", () => {
    const d = new Traducteur(dico as Record<string, string>);
    expect(d.traduire("Révolution : cliquez sur le profil à tourner autour de l'axe (360°, 48 segments par tour).")).toBe(
      "Revolution: click the profile to revolve around the axis (360°, 48 segments per turn).",
    );
    expect(d.traduire("Révolution : cliquez sur le profil à tourner autour de l'axe (90°, 48 segments par tour) — 12 segments, écart de facettage ≈ 4,282 mm.")).toBe(
      "Revolution: click the profile to revolve around the axis (90°, 48 segments per turn) — 12 segments, faceting deviation ≈ 4.282 mm.",
    );
    expect(d.traduire("Révolution : cliquez sur le profil à tourner autour de l'axe (5°, 48 segments par tour) — 1 segment, écart de facettage ≈ 0,1 mm.")).toBe(
      "Revolution: click the profile to revolve around the axis (5°, 48 segments per turn) — 1 segment, faceting deviation ≈ 0.1 mm.",
    );
  });

  it("le dictionnaire livré couvre l'interface courante et garde les paramètres", () => {
    const d = dico as Record<string, string>;
    expect(Object.keys(d).length).toBeGreaterThan(5000);
    for (const [fr, en] of Object.entries(d)) {
      // L'anglais n'invente aucun paramètre (il peut omettre un accord de pluriel français).
      const pf = new Set(fr.match(/\{\d+\}/g) ?? []);
      for (const p of en.match(/\{\d+\}/g) ?? []) expect(pf.has(p), `${fr} → ${en}`).toBe(true);
    }
    const tr = new Traducteur(d);
    expect(tr.traduire("Enregistré · r12")).toBe("Saved · r12");
    expect(tr.traduire("Mes projets")).toBe("My projects");
    expect(tr.traduire("Non évalué")).toBe("Not evaluated");
  });
});

describe("traduction : garde-fous et textes composés (D-163)", () => {
  const t = new Traducteur({ "Escalier {0}": "Staircase {0}", "{0} sur {1}": "{0} on {1}", Mur: "Wall", Terminée: "Completed", "Parcelle / Site existant": "Plot / Existing site", "Cliquez pour poser.": "Click to place." });
  it("un motif court ne réécrit pas une donnée", () => {
    expect(t.traduire("Escalier B et mezzanine")).toBe("Escalier B et mezzanine");
    expect(t.traduire("Escalier 3")).toBe("Staircase 3");
    expect(t.traduire("Cliquez sur un mur pour y poser la porte")).toBe("Cliquez sur un mur pour y poser la porte");
  });
  it("texte composé traduit morceau par morceau, raccourci entre parenthèses conservé", () => {
    expect(t.traduire("01 · Parcelle / Site existant · Terminée")).toBe("01 · Plot / Existing site · Completed");
    expect(t.traduire("Mur (M) — Cliquez pour poser.")).toBe("Wall (M) — Click to place.");
  });
});
