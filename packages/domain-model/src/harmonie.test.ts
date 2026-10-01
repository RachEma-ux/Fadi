import { describe, expect, it } from "vitest";
import {
  buildHarmonieProposals,
  decideHarmonieProposal,
  harmonieProfile,
  harmonieProposalId,
  harmonieVisibleRef,
  incomingIntentions,
  retainedCount,
  type HarmonieProfilesData,
} from "./harmonie";
import { EMPTY_HARMONIE_STEP_STATE, type ParcoursStepDefinition } from "./parcours";

// Sous-ensemble fidèle de harmonie-profiles.json (textes du prototype).
const DATA: HarmonieProfilesData = {
  states: {
    proposed: "Proposée",
    retained: "Retenue",
    adapted: "Adaptée et retenue",
    translated: "Traduite dans le programme",
    drawn: "Dessinée · déclaration",
    verified: "Vérifiée · preuve déclarée",
    dismissed: "Écartée avec motif",
  },
  retainedStates: ["retained", "adapted", "translated", "drawn", "verified"],
  aliases: { commercial: "commerce", bureau: "tertiaire" },
  defaultProfile: { label: "Type à préciser", site: "SITE-DEFAUT", usage: "USAGE-DEFAUT", decor: "DECOR-DEFAUT" },
  mixedTrainingOffices: { requires: ["enseignement", "tertiaire"], label: "Formation & bureaux", site: "SITE-MIXTE", usage: "USAGE-MIXTE" },
  profiles: {
    tertiaire: { label: "Bureaux", site: "SITE-TERTIAIRE", usage: "USAGE-TERTIAIRE", decor: "DECOR-TERTIAIRE" },
    mixte: { label: "Bâtiment mixte", site: "SITE-MIXTE-BASE", usage: "USAGE-MIXTE-BASE", decor: "DECOR-MIXTE" },
  },
};

function def(number: number, transmitsTo: number[] = [number + 1]): ParcoursStepDefinition {
  return {
    number,
    title: `Étape ${number}`,
    phase: "Programmer",
    key: "k",
    scope: "Périmètre",
    goal: null,
    inputs: "Entrées de l'étape",
    deliverable: null,
    method: null,
    topic: null,
    transmitsTo,
    form: null,
    harmonieOptions: [
      { title: "A-titre", proposal: "A-texte", benefit: "A-intérêt", tradeoff: "A-compromis", validation: "A-conditions" },
      { title: "B-titre", proposal: "B-texte", benefit: "B-intérêt", tradeoff: "B-compromis", validation: "B-conditions" },
      { title: "C-titre", proposal: "C-texte", benefit: "C-intérêt", tradeoff: "C-compromis", validation: "C-conditions" },
    ],
  };
}

const NOW = "2026-10-01T20:00:00.000Z";

describe("harmonieProfile", () => {
  it("normalise les alias et retombe sur le profil « Type à préciser »", () => {
    expect(harmonieProfile(DATA, "bureau").key).toBe("tertiaire");
    expect(harmonieProfile(DATA, null).label).toBe("Type à préciser");
    expect(harmonieProfile(DATA, "inconnu").key).toBe("inconnu");
    expect(harmonieProfile(DATA, "").key).toBe("unknown");
  });

  it("reconnaît le cas mixte formation + bureaux seulement avec ses deux composantes", () => {
    expect(harmonieProfile(DATA, "mixte", ["enseignement", "tertiaire"]).label).toBe("Formation & bureaux");
    expect(harmonieProfile(DATA, "mixte", ["enseignement"]).label).toBe("Bâtiment mixte");
  });
});

describe("buildHarmonieProposals", () => {
  it("numérote H(étape−1)-clé en interne et H(étape)-clé à l'affichage, comme le prototype", () => {
    expect(harmonieProposalId(2, "A")).toBe("H01-A");
    expect(harmonieVisibleRef(2, "A")).toBe("H02-A");
    const qs = buildHarmonieProposals(DATA, def(2), harmonieProfile(DATA, "tertiaire"), EMPTY_HARMONIE_STEP_STATE);
    expect(qs.map((q) => q.id)).toEqual(["H01-A", "H01-B", "H01-C"]);
    expect(qs[0]!.recommended).toBe(true);
    expect(qs[1]!.recommended).toBe(false);
  });

  it("choisit « Pourquoi ici » selon la position de l'étape (site ≤ 4, usage < 12, décor = 21)", () => {
    const p = harmonieProfile(DATA, "tertiaire");
    expect(buildHarmonieProposals(DATA, def(4), p, EMPTY_HARMONIE_STEP_STATE)[0]!.why).toBe("SITE-TERTIAIRE");
    expect(buildHarmonieProposals(DATA, def(11), p, EMPTY_HARMONIE_STEP_STATE)[0]!.why).toBe("USAGE-TERTIAIRE");
    expect(buildHarmonieProposals(DATA, def(21), p, EMPTY_HARMONIE_STEP_STATE)[0]!.why).toBe("DECOR-TERTIAIRE");
    expect(buildHarmonieProposals(DATA, def(15), p, EMPTY_HARMONIE_STEP_STATE)[0]!.why).toMatch(/réserves et responsabilités/);
  });
});

describe("decideHarmonieProposal", () => {
  const p = harmonieProfile(DATA, null);

  it("retient une proposition et compte 1 choix retenu", () => {
    const r = decideHarmonieProposal(DATA, def(2), EMPTY_HARMONIE_STEP_STATE, "H01-A", { status: "retained" }, { now: NOW });
    expect(r.retained).toBe(true);
    expect(r.targets).toEqual([3]);
    expect(r.state.proposals["H01-A"]!.status).toBe("retained");
    expect(r.state.proposals["H01-A"]!.decisionVersion).toBe(1);
    expect(retainedCount(DATA, def(2), r.state)).toBe(1);
  });

  it("retenir une autre variante écarte la précédente avec le motif « Remplacée par … »", () => {
    const first = decideHarmonieProposal(DATA, def(2), EMPTY_HARMONIE_STEP_STATE, "H01-A", { status: "retained" }, { now: NOW });
    const second = decideHarmonieProposal(DATA, def(2), first.state, "H01-B", { status: "retained" }, { now: NOW });
    expect(second.dismissed).toEqual(["H01-A"]);
    expect(second.state.proposals["H01-A"]!.status).toBe("dismissed");
    expect(second.state.proposals["H01-A"]!.notes).toBe("Remplacée par H01-B");
    expect(second.state.proposals["H01-A"]!.history.at(-1)!.reason).toBe("Variante remplacée par H01-B");
    expect(retainedCount(DATA, def(2), second.state)).toBe(1);
  });

  it("exige un motif de 8 caractères pour adapter ou écarter", () => {
    expect(() => decideHarmonieProposal(DATA, def(2), EMPTY_HARMONIE_STEP_STATE, "H01-A", { status: "dismissed", notes: "court" }, { now: NOW })).toThrow(
      "Décrivez votre adaptation ou votre motif (8 caractères minimum).",
    );
    const r = decideHarmonieProposal(DATA, def(2), EMPTY_HARMONIE_STEP_STATE, "H01-A", { status: "adapted", notes: "Décaler le parvis de 3 m" }, { now: NOW });
    expect(r.state.proposals["H01-A"]!.adaptedText).toBe("Décaler le parvis de 3 m");
    const shown = buildHarmonieProposals(DATA, def(2), p, r.state).find((q) => q.id === "H01-A")!;
    expect(shown.text).toBe("Décaler le parvis de 3 m");
    expect(shown.originalText).toBe("A-texte");
    expect(shown.retained).toBe(true);
  });

  it("exige responsable et preuve pour traduire, dessiner, vérifier ; dessiner seulement dès l'étape 10", () => {
    expect(() => decideHarmonieProposal(DATA, def(6), EMPTY_HARMONIE_STEP_STATE, "H05-A", { status: "translated", owner: "", proof: "preuve suffisante" }, { now: NOW })).toThrow(
      "Responsable et référence / preuve sont requis pour ce statut.",
    );
    expect(() => decideHarmonieProposal(DATA, def(6), EMPTY_HARMONIE_STEP_STATE, "H05-A", { status: "drawn", owner: "X", proof: "preuve suffisante" }, { now: NOW })).toThrow(
      "L’état dessiné se renseigne dans l’Atelier ou dans l’Esquisse.",
    );
    const ok = decideHarmonieProposal(DATA, def(10), EMPTY_HARMONIE_STEP_STATE, "H09-A", { status: "drawn", owner: "Architecte", proof: "Plan RDC rev. 3" }, { now: NOW });
    expect(ok.state.proposals["H09-A"]!.status).toBe("drawn");
  });

  it("refuse une vérification quand l'étape est à réexaminer", () => {
    expect(() => decideHarmonieProposal(DATA, def(6), EMPTY_HARMONIE_STEP_STATE, "H05-A", { status: "verified", owner: "X", proof: "preuve suffisante" }, { now: NOW, stale: true })).toThrow(
      "Actualisez d’abord les propositions sur les données courantes.",
    );
  });

  it("rejette un statut ou une proposition inconnus", () => {
    expect(() => decideHarmonieProposal(DATA, def(2), EMPTY_HARMONIE_STEP_STATE, "H01-Z", { status: "retained" }, { now: NOW })).toThrow("Proposition absente");
    expect(() => decideHarmonieProposal(DATA, def(2), EMPTY_HARMONIE_STEP_STATE, "H01-A", { status: "n'importe" as never }, { now: NOW })).toThrow("Statut invalide");
  });
});

describe("incomingIntentions", () => {
  it("remonte les intentions retenues des étapes amont qui ciblent l'étape", () => {
    const d2 = def(2, [6, 9]);
    const d3 = def(3, [4]);
    const s2 = decideHarmonieProposal(DATA, d2, EMPTY_HARMONIE_STEP_STATE, "H01-B", { status: "retained" }, { now: NOW }).state;
    const s3 = decideHarmonieProposal(DATA, d3, EMPTY_HARMONIE_STEP_STATE, "H02-A", { status: "retained" }, { now: NOW }).state;
    const steps = [
      { def: d3, state: s3 },
      { def: d2, state: s2 },
    ];
    const p = harmonieProfile(DATA, null);
    expect(incomingIntentions(DATA, steps, 6, p).map((q) => q.ref)).toEqual(["H02-B"]);
    expect(incomingIntentions(DATA, steps, 4, p).map((q) => q.ref)).toEqual(["H03-A"]);
    expect(incomingIntentions(DATA, steps, 2, p)).toEqual([]);
  });
});
