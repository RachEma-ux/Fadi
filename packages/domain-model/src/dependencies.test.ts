import { describe, expect, it } from "vitest";
import { computeStepDependencies, siteContextHash, stepFingerprintBase, staleRetainedCount, type StepFingerprintSources } from "./dependencies";
import { buildHarmonieProposals, decideHarmonieProposal, harmonieProfile, regenerateHarmonieStep, type HarmonieProfilesData } from "./harmonie";
import { harmonieReportFileName, harmonieReportHtml } from "./harmonie-report";
import { EMPTY_HARMONIE_STEP_STATE, type HarmonieStepState, type ParcoursStepDefinition } from "./parcours";
import { DEFAULT_SITE_OBSERVATIONS, siteContext } from "./site";

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
  aliases: {},
  defaultProfile: { label: "Type à préciser", site: "SITE-DEFAUT", usage: "USAGE-DEFAUT", decor: "DECOR-DEFAUT" },
  mixedTrainingOffices: { requires: ["enseignement", "tertiaire"], label: "Formation & bureaux", site: "SITE-MIXTE", usage: "USAGE-MIXTE" },
  profiles: { tertiaire: { label: "Bureaux", site: "SITE-TERTIAIRE", usage: "USAGE-TERTIAIRE", decor: "DECOR-TERTIAIRE" } },
};

function def(number: number, transmitsTo: number[]): ParcoursStepDefinition {
  return {
    number,
    title: `Étape ${number}`,
    phase: "Programmer",
    key: "k",
    scope: `Périmètre ${number}`,
    goal: `Objectif ${number}`,
    inputs: "Entrées",
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

const DEFS = [def(1, [2, 4]), def(2, [4]), def(3, [4]), def(4, [6]), def(6, [7]), def(7, [10]), def(10, [11]), def(19, [20])];
const PROFILE = harmonieProfile(DATA, "tertiaire");
const NOW = "2026-10-02T08:00:00.000Z";

function sources(over: Partial<StepFingerprintSources> = {}): StepFingerprintSources {
  return {
    siteHash: "site-1",
    profileKey: "tertiaire",
    business: new Map(),
    programmeCase: null,
    programmeRepartition: { type: "tertiaire", baseArea: 1000 },
    parcelSetback: null,
    model: null,
    compass: null,
    ...over,
  };
}

function inputs(states: Record<number, HarmonieStepState> = {}) {
  return DEFS.map((d) => ({ def: d, state: states[d.number] ?? EMPTY_HARMONIE_STEP_STATE }));
}

describe("stepFingerprintBase", () => {
  it("ne retient que les données pertinentes à chaque étape (fingerprintInner du prototype)", () => {
    const src = sources({
      business: new Map([
        [2, { f1: "règle" }],
        [3, { f1: "clientèle" }],
        [4, { f1: "type" }],
        [5, { f1: "usagers" }],
        [19, { decision: "GO" }],
      ]),
      parcelSetback: { front: 5 },
      model: { floor: { levels: {}, updated: "volatil" }, levels: [{ id: "L0" }], footprint: { vertices: [] } },
      programmeCase: { caseId: "c", spaces: [], updated: "2026-01-01" },
    });
    expect(stepFingerprintBase(1, src)).toEqual({ site: "site-1" });
    expect(stepFingerprintBase(2, src)).toEqual({ site: "site-1", fields: { f1: "règle" }, rules: { front: 5 } });
    expect(stepFingerprintBase(3, src)).toEqual({ site: "site-1", fields: { f1: "clientèle" }, rules: null });
    expect(stepFingerprintBase(4, src)).toEqual({ site: "site-1", type: "tertiaire", fields: { f1: "type" }, needs: [{ f1: "clientèle" }, { f1: "type" }, { f1: "usagers" }] });
    // Les champs volatils du cas (dates) ne pèsent pas dans l'empreinte.
    expect(stepFingerprintBase(7, src)).toEqual({ type: "tertiaire", programme: { caseId: "c", spaces: [] }, pmo: {} });
    expect(stepFingerprintBase(10, src)).toMatchObject({ site: "site-1", floor: { levels: {} }, levels: [{ id: "L0" }], compass: null, fields: {} });
    expect(stepFingerprintBase(20, src)).toEqual({ type: "tertiaire", fields: {}, programme: { caseId: "c", spaces: [] }, decision: { decision: "GO" } });
  });

  it("l'étape 07 lit la répartition quand aucun cas n'est appliqué", () => {
    expect(stepFingerprintBase(7, sources())).toEqual({ type: "tertiaire", programme: { type: "tertiaire", baseArea: 1000 }, pmo: {} });
  });
});

describe("siteContextHash", () => {
  it("change avec les observations ou la parcelle, pas avec un simple recalcul", () => {
    const parcel = { vertices: [[0, 0], [10, 0], [10, 8], [0, 8]] as [number, number][], vertexIds: ["B1", "B2", "B3", "B4"], crs: "EPSG:26191", units: "m", officialArea: 80, parcelNumber: "P", commune: "C", sourceFile: "f.kmz" };
    const a = siteContextHash(siteContext(parcel, DEFAULT_SITE_OBSERVATIONS, PROFILE));
    const b = siteContextHash(siteContext(parcel, DEFAULT_SITE_OBSERVATIONS, PROFILE));
    const c = siteContextHash(siteContext(parcel, { ...DEFAULT_SITE_OBSERVATIONS, frontContext: "open" }, PROFILE));
    const d = siteContextHash(siteContext({ ...parcel, officialArea: 81 }, DEFAULT_SITE_OBSERVATIONS, PROFILE));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });
});

describe("computeStepDependencies", () => {
  it("une étape jamais générée n'est pas périmée ; une étape générée sur d'autres données l'est", () => {
    const src = sources();
    const first = computeStepDependencies(DATA, inputs(), PROFILE, src);
    expect([...first.values()].every((d) => !d.stale)).toBe(true);
    const fp2 = first.get(2)!.fingerprint;
    const generated = regenerateHarmonieStep(EMPTY_HARMONIE_STEP_STATE, fp2, NOW);
    expect(generated.revision).toBe(1);
    expect(generated.generatedHash).toBe(fp2);
    const same = computeStepDependencies(DATA, inputs({ 2: generated }), PROFILE, src);
    expect(same.get(2)!.stale).toBe(false);
    // Le site change : l'étape 02 (générée) est à réexaminer, les autres (non générées) non.
    const moved = computeStepDependencies(DATA, inputs({ 2: generated }), PROFILE, sources({ siteHash: "site-2" }));
    expect(moved.get(2)!.stale).toBe(true);
    expect(moved.get(4)!.stale).toBe(false);
    // Un champ de l'étape 19 ne concerne pas l'étape 02.
    const other = computeStepDependencies(DATA, inputs({ 2: generated }), PROFILE, sources({ business: new Map([[19, { decision: "GO" }]]) }));
    expect(other.get(2)!.stale).toBe(false);
  });

  it("une intention reçue entre dans l'empreinte de la cible, avec sa version et la péremption de son origine", () => {
    const src = sources();
    const base = computeStepDependencies(DATA, inputs(), PROFILE, src);
    const retained = decideHarmonieProposal(DATA, DEFS[0]!, EMPTY_HARMONIE_STEP_STATE, "H00-A", { status: "retained" }, { now: NOW, fingerprint: base.get(1)!.fingerprint });
    const generated4 = regenerateHarmonieStep(EMPTY_HARMONIE_STEP_STATE, base.get(4)!.fingerprint, NOW);
    const after = computeStepDependencies(DATA, inputs({ 1: retained.state, 4: generated4 }), PROFILE, src);
    expect(after.get(4)!.incoming).toHaveLength(1);
    expect(after.get(4)!.incoming[0]).toMatchObject({ origin: 1, id: "H00-A", decisionVersion: 1, originStale: false });
    expect(after.get(4)!.fingerprint).not.toBe(base.get(4)!.fingerprint);
    expect(after.get(4)!.stale).toBe(true);
    expect(after.get(2)!.incoming[0]!.id).toBe("H00-A");
    // L'origine périmée se propage : « Source à réexaminer » et nouvelle empreinte aval.
    const generated1 = regenerateHarmonieStep(retained.state, after.get(1)!.fingerprint, NOW);
    const refreshed = computeStepDependencies(DATA, inputs({ 1: generated1, 4: generated4 }), PROFILE, src);
    expect(refreshed.get(1)!.stale).toBe(false);
    const siteMoved = computeStepDependencies(DATA, inputs({ 1: generated1, 4: generated4 }), PROFILE, sources({ siteHash: "site-2" }));
    expect(siteMoved.get(1)!.stale).toBe(true);
    expect(siteMoved.get(4)!.incoming[0]!.originStale).toBe(true);
    expect(siteMoved.get(4)!.fingerprint).not.toBe(refreshed.get(4)!.fingerprint);
  });
});

describe("acceptedHash et choix à réexaminer", () => {
  it("un choix retenu est daté de l'empreinte ; il devient « à réexaminer » quand elle change et redevient à jour une fois confirmé", () => {
    const d = DEFS[1]!;
    const src = sources();
    const fp = computeStepDependencies(DATA, inputs(), PROFILE, src).get(2)!.fingerprint;
    const r1 = decideHarmonieProposal(DATA, d, EMPTY_HARMONIE_STEP_STATE, "H01-B", { status: "retained" }, { now: NOW, fingerprint: fp });
    expect(r1.state.proposals["H01-B"]!.acceptedHash).toBe(fp);
    expect(r1.state.proposals["H01-B"]!.snapshot).toMatchObject({ ref: "H02-B", key: "B", group: "parti", title: "B-titre", text: "B-texte", targets: [4] });
    const fresh = buildHarmonieProposals(DATA, d, PROFILE, r1.state, null, fp);
    expect(fresh.find((q) => q.id === "H01-B")).toMatchObject({ retained: true, stale: false, orphaned: false });
    expect(staleRetainedCount(DATA, d, PROFILE, r1.state, null, fp)).toBe(0);

    const fpMoved = computeStepDependencies(DATA, inputs({ 2: r1.state }), PROFILE, sources({ siteHash: "site-2" })).get(2)!.fingerprint;
    const stale = buildHarmonieProposals(DATA, d, PROFILE, r1.state, null, fpMoved);
    expect(stale.find((q) => q.id === "H01-B")).toMatchObject({ retained: true, stale: true });
    expect(staleRetainedCount(DATA, d, PROFILE, r1.state, null, fpMoved)).toBe(1);
    // Sans empreinte courante (appel sans dépendances), rien n'est signalé.
    expect(buildHarmonieProposals(DATA, d, PROFILE, r1.state).find((q) => q.id === "H01-B")!.stale).toBe(false);

    // « Confirmer ce choix » : nouvelle version, empreinte courante.
    const r2 = decideHarmonieProposal(DATA, d, r1.state, "H01-B", { status: "retained" }, { now: NOW, fingerprint: fpMoved });
    expect(r2.state.proposals["H01-B"]!.decisionVersion).toBe(2);
    expect(buildHarmonieProposals(DATA, d, PROFILE, r2.state, null, fpMoved).find((q) => q.id === "H01-B")!.stale).toBe(false);
    // Écarter un choix retire son empreinte.
    const r3 = decideHarmonieProposal(DATA, d, r2.state, "H01-B", { status: "dismissed", notes: "Motif suffisant" }, { now: NOW, fingerprint: fpMoved });
    expect(r3.state.proposals["H01-B"]!.acceptedHash).toBeNull();
  });

  it("une vérification est refusée tant que l'étape est à réexaminer", () => {
    const d = DEFS[1]!;
    expect(() => decideHarmonieProposal(DATA, d, EMPTY_HARMONIE_STEP_STATE, "H01-A", { status: "verified", owner: "X", proof: "Preuve suffisante" }, { now: NOW, stale: true })).toThrow(
      "Actualisez d’abord les propositions sur les données courantes.",
    );
  });

  it("un choix retenu dont la proposition a disparu est conservé en proposition orpheline, à réexaminer", () => {
    const d = DEFS[6]!; // étape 10
    const locals = [{ key: "LOCAL", roomId: "L0|r1", objectId: "r1", title: "Bureau 1 · 12 m²", text: "Texte local", why: "Pourquoi", benefit: "I", tradeoff: "C", conditions: "Cond", source: "Modèle abcd · objet r1", targets: [11] }];
    const withModel = { options: null, recommendedKey: "A", locals };
    const r = decideHarmonieProposal(DATA, d, EMPTY_HARMONIE_STEP_STATE, "H09-LOCAL-L0|r1", { status: "adapted", notes: "Adaptation suffisante" }, { now: NOW, computed: withModel, fingerprint: "fp" });
    expect(r.state.proposals["H09-LOCAL-L0|r1"]!.snapshot).toMatchObject({ group: "local", roomId: "L0|r1", title: "Bureau 1 · 12 m²", text: "Adaptation suffisante" });
    // Le modèle disparaît : plus de locaux calculés.
    const orphans = buildHarmonieProposals(DATA, d, PROFILE, r.state, null, "fp");
    const o = orphans.find((q) => q.id === "H09-LOCAL-L0|r1")!;
    expect(o).toMatchObject({ orphaned: true, stale: true, retained: true, group: "local", title: "Bureau 1 · 12 m²", text: "Adaptation suffisante", ref: "H10-LOCAL-L0|r1", roomId: "L0|r1", targets: [11] });
    expect(orphans.filter((q) => q.group === "parti")).toHaveLength(3);
    // Un choix non retenu n'est pas ressuscité.
    const dismissed = decideHarmonieProposal(DATA, d, r.state, "H09-LOCAL-L0|r1", { status: "dismissed", notes: "Motif suffisant" }, { now: NOW, computed: withModel, fingerprint: "fp" });
    expect(buildHarmonieProposals(DATA, d, PROFILE, dismissed.state, null, "fp").some((q) => q.orphaned)).toBe(false);
  });
});

describe("harmonieReportHtml", () => {
  it("compose un document autonome : cartes des partis et des choix retenus, intentions reçues, péremption", () => {
    const src = sources();
    const deps = computeStepDependencies(DATA, inputs(), PROFILE, src);
    const r1 = decideHarmonieProposal(DATA, DEFS[0]!, EMPTY_HARMONIE_STEP_STATE, "H00-A", { status: "retained" }, { now: NOW, fingerprint: deps.get(1)!.fingerprint });
    const state1 = regenerateHarmonieStep(r1.state, deps.get(1)!.fingerprint, NOW);
    const after = computeStepDependencies(DATA, inputs({ 1: state1 }), PROFILE, sources({ siteHash: "site-2" }));
    expect(after.get(1)!.stale).toBe(true);
    const steps = [DEFS[0]!, DEFS[1]!].map((d) => ({
      def: d,
      proposals: buildHarmonieProposals(DATA, d, PROFILE, d.number === 1 ? state1 : EMPTY_HARMONIE_STEP_STATE, null, after.get(d.number)!.fingerprint),
      incoming: after.get(d.number)!.incoming,
      stale: after.get(d.number)!.stale,
      site: d.number === 1 ? { geoSource: "Conversion EPSG:26191 → WGS84 ; système source à confirmer", sketch: null } : null,
    }));
    const html = harmonieReportHtml({ projectName: "P.118 <test>", stepNumber: 1, steps, definitions: DEFS, states: DATA.states, css: ".h7-chip{}", now: NOW });
    expect(html.startsWith("<!doctype html><html lang=\"fr\">")).toBe(true);
    expect(html).toContain("<title>Harmonie · P.118 &lt;test&gt; · 01 · Étape 1</title>");
    expect(html).toContain("Rapport limité à l’objet de cette étape.");
    expect(html).toContain("Données modifiées depuis la génération : revue nécessaire.");
    expect(html).toContain("À réexaminer · choix conservé");
    expect(html).toContain("Conversion EPSG:26191 → WGS84 ; système source à confirmer");
    expect(html).toContain("<h3>Choix à transmettre</h3>");
    expect(html).toContain("02 · Périmètre 2");
    expect(html).toContain("Source à réexaminer");
    expect(html).not.toContain("<button");
    expect(harmonieReportFileName(1)).toBe("Harmonie_Etape_01_V7.html");
    expect(harmonieReportFileName(null)).toBe("Harmonie_Choix_Parcours_V7.html");
    const synthesis = harmonieReportHtml({ projectName: "P", stepNumber: null, steps, definitions: DEFS, states: DATA.states, css: "", now: NOW });
    expect(synthesis).toContain("Synthèse des étapes effectivement ouvertes");
    expect(synthesis).toContain("<title>Harmonie · P</title>");
  });
});
