/**
 * Corpus de qualification S1–S7 (X.1-01 à X.1-08, X.1-10) : validité, déterminisme, empreintes conservées, oracles
 * numériques indépendants, références visuelles, plans S6 / S7 rejoués par le modèle.
 *
 * Tailles contrôlées par `npm test` : 100 (tout, références visuelles comprises) et 10 000 (validité, oracles,
 * empreinte du corpus). Le contrôle lourd — références visuelles à 10 000 et tout à 100 000 primitives — est derrière
 * `STUDIO_CORPUS_LOURD=1` (script `npm run test:corpus-lourd`, job CI `corpus-lourd` à la demande et chaque semaine).
 * Réécriture des empreintes, références et fixtures : `STUDIO_CORPUS_ECRIRE=1`. Une entrée n'est écrite que **calculée en
 * entier** et remplace l'ancienne (jamais de fusion) : sans `STUDIO_CORPUS_LOURD=1`, les entrées lourdes (10 000 avec
 * leurs références visuelles, 100 000) ne sont pas écrites — elles restent comparées sur ce qui est calculé, et un écart
 * demande la réécriture lourde (`STUDIO_CORPUS_LOURD=1 STUDIO_CORPUS_ECRIRE=1`).
 *
 * Plateforme : les SVG de référence formatent les cotes en `fr-FR` ; une plateforme sans données ICU françaises
 * produirait d'autres octets. Le chargement l'exige et le manifeste consigne Node et ICU.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_LIMITS, validateStudioDocument, type StudioDocument } from "../document-2d.js";
import { quantitesStudio, type GrandeurQuantite } from "../quantites.js";
import { studioQuantitesSolides } from "../solides-libres.js";
import { studioQuantitesArchitecture } from "../architecture/index.js";
import { studioAngularValue } from "../objets/cote-angulaire.js";
import { studioDimensionValue } from "../objets/cote.js";
import { measureStudioDimension } from "../document-2d.js";
import { controlerExigences } from "../facade-exigences.js";
import {
  commandesDuDocument, empreinteCorpus, empreintePlanS6, genererCorpus, oracleCorpus, oracleS6, oracleSessionS7, planS6, primitivesDu, referenceVisuelle,
  SCENES_DOCUMENTS, TAILLES_ILLUSTRATIVES, TOLERANCE_ORACLE, type CorpusStudio, type OracleCorpus, type SceneDocuments,
} from "./index.js";

// Plateforme exigée par les références visuelles (cotes formatées en fr-FR) : échec explicite plutôt qu'un écart d'octets.
const FORMAT_FR = new Intl.NumberFormat("fr-FR").format(1.5);
if (FORMAT_FR !== "1,5") {
  throw new Error(`Plateforme non conforme pour le corpus Studio : Intl.NumberFormat("fr-FR").format(1.5) donne « ${FORMAT_FR} » au lieu de « 1,5 » (Node ${process.versions.node}, ICU ${process.versions.icu ?? "absent"}). Installez Node avec les données ICU complètes (full-icu).`);
}

const ICI = dirname(fileURLToPath(import.meta.url));
const MANIFESTE = join(ICI, "empreintes.json");
const REFERENCES = join(ICI, "references");
const FIXTURES = join(ICI, "fixtures");
const LOURD = process.env.STUDIO_CORPUS_LOURD === "1";
const ECRIRE = process.env.STUDIO_CORPUS_ECRIRE === "1";
// Tailles normales : quelques secondes ; le contrôle lourd (100 000 primitives, références à 10 000) a sa propre borne.
vi.setConfig({ testTimeout: LOURD ? 900_000 : 120_000 });

interface EntreeManifeste { corpus: string; feuillets: number; svg?: string[]; maillage?: string[] }
interface Manifeste { $commentaire: string; plateforme?: { node: string; icu: string }; scenes: Record<string, Record<string, EntreeManifeste>>; plans: Record<string, string> }
const manifeste: Manifeste = existsSync(MANIFESTE) ? JSON.parse(readFileSync(MANIFESTE, "utf8")) as Manifeste : { $commentaire: "", scenes: {}, plans: {} };

/** Réécrit le manifeste, plateforme d'écriture consignée (Node et ICU : le formatage fr-FR des SVG en dépend). */
function ecrireManifeste() {
  const { scenes, plans } = manifeste;
  const ecrit: Manifeste = {
    $commentaire: "Empreintes conservées des corpus de qualification Studio S1–S7 (REF-02 §18.2, X.1-08) : SHA-256 du corpus (suite des empreintes de ses feuillets), des SVG de référence et empreintes de contenu du maillage 3D dérivé, par scène et par taille illustrative (X.1-10, pas un engagement de capacité) ; plans S6 : SHA-256 du plan entier (base, variantes, étapes, exigences). Géométrie synthétique. Réécrites seulement par STUDIO_CORPUS_ECRIRE=1 (corpus.test.ts), entrée par entrée, chacune calculée en entier ; les entrées lourdes exigent STUDIO_CORPUS_LOURD=1. « plateforme » : Node et ICU de la dernière écriture.",
    plateforme: { node: process.versions.node, icu: process.versions.icu ?? "absent" },
    scenes, plans,
  };
  Object.assign(manifeste, ecrit);
  writeFileSync(MANIFESTE, `${JSON.stringify(ecrit, null, 2)}\n`);
}

/** Égalité dans la tolérance relative déclarée de l'oracle. */
function proche(mesure: number | null | undefined, attendu: number, quoi: string) {
  expect(mesure, quoi).not.toBeNull();
  expect(Math.abs((mesure as number) - attendu), `${quoi} : ${mesure} au lieu de ${attendu}`).toBeLessThanOrEqual(TOLERANCE_ORACLE * Math.max(1, Math.abs(attendu)));
}

function comptes(corpus: CorpusStudio): Record<string, number> {
  const c: Record<string, number> = {};
  for (const d of corpus.documents) {
    for (const e of [...d.objects, ...(d.dimensions ?? []), ...(d.annotations ?? []), ...(d.architecture ?? []), ...(d.solides ?? [])]) c[e.type] = (c[e.type] ?? 0) + 1;
  }
  return c;
}

/** Ce que le modèle dérive du corpus, à comparer à l'oracle. */
function mesures(corpus: CorpusStudio) {
  const totaux: Partial<Record<GrandeurQuantite, number>> = {};
  let volumeNonEvalues = 0, volumeSolides = 0, liees = 0, libres = 0, sommeMesures = 0, angles = 0, sommeDegres = 0;
  const murs = { brut: 0, deduit: 0, net: 0 };
  let premier: { id: string; brut: number; deduit: number; net: number } | undefined;
  for (const d of corpus.documents) {
    const q = quantitesStudio(d);
    for (const t of q.totaux) {
      if (t.valeur !== null) totaux[t.grandeur] = (totaux[t.grandeur] ?? 0) + t.valeur;
      if (t.grandeur === "volume") volumeNonEvalues += t.nonEvalues;
    }
    volumeSolides += studioQuantitesSolides(d).totalVolume ?? Number.NaN;
    const cotes = d.dimensions ?? [];
    for (const c of cotes) {
      if (c.links.start && c.links.end) liees++; else libres++;
      // Valeur mesurée par le modèle (celle de `measureStudioDimension`, sans revalider le feuillet à chaque cote).
      sommeMesures += studioDimensionValue(c) ?? Number.NaN;
    }
    // La façade de mesure rend la même valeur : contrôlé sur la première cote de chaque feuillet.
    if (cotes[0]) expect(measureStudioDimension(d, cotes[0].id)?.value).toBe(studioDimensionValue(cotes[0]));
    for (const a of d.annotations ?? []) {
      if (a.type !== "angular-dimension") continue;
      angles++;
      sommeDegres += studioAngularValue(a) ?? Number.NaN;
    }
    for (const m of studioQuantitesArchitecture(d.architecture ?? [])) {
      if (m.type !== "wall") continue;
      murs.brut += m.volumeBrut; murs.deduit += m.deduction; murs.net += m.volumeNet;
      if (!premier) premier = { id: m.id, brut: m.volumeBrut, deduit: m.deduction, net: m.volumeNet };
    }
  }
  return { totaux, volumeNonEvalues, volumeSolides, cotes: { liees, libres, sommeMesures }, angles: { nombre: angles, sommeDegres }, murs, premier };
}

function controlerOracle(corpus: CorpusStudio, o: OracleCorpus) {
  expect(primitivesDu(corpus)).toBe(o.primitives);
  expect(corpus.documents).toHaveLength(o.feuillets);
  expect(comptes(corpus)).toEqual(o.comptes);
  const m = mesures(corpus);
  for (const [g, v] of Object.entries(o.totaux)) proche(m.totaux[g as GrandeurQuantite], v, `total ${g}`);
  expect(m.volumeNonEvalues, "volumes non évalués (objets non extrudés)").toBe(o.volumeNonEvalues);
  if (o.cotes) {
    expect([m.cotes.liees, m.cotes.libres]).toEqual([o.cotes.liees, o.cotes.libres]);
    proche(m.cotes.sommeMesures, o.cotes.sommeMesures, "somme des cotes");
  }
  if (o.angles) {
    expect(m.angles.nombre).toBe(o.angles.nombre);
    proche(m.angles.sommeDegres, o.angles.sommeDegres, "somme des angles");
  }
  if (o.murs) {
    proche(m.murs.brut, o.murs.brut, "volume brut des murs");
    proche(m.murs.deduit, o.murs.deduit, "volume déduit des murs");
    proche(m.murs.net, o.murs.net, "volume net des murs");
    if (o.murs.premier) {
      expect(m.premier?.id).toBe(o.murs.premier.id);
      for (const k of ["brut", "deduit", "net"] as const) proche(m.premier?.[k], o.murs.premier[k], `premier mur ${k}`);
    }
  }
  proche(m.volumeSolides, o.volumeSolides ?? 0, "volume des solides");
}

const TAILLES: readonly number[] = LOURD ? TAILLES_ILLUSTRATIVES : TAILLES_ILLUSTRATIVES.filter((t) => t <= 10_000);
const referencesVisuelles = (taille: number) => taille === 100 || LOURD;

describe("Corpus de qualification S1–S7 : tailles illustratives (X.1-10)", () => {
  it("tailles 100 / 10 000 / 100 000, jamais des engagements ; 100 000 derrière STUDIO_CORPUS_LOURD", () => {
    expect([...TAILLES_ILLUSTRATIVES]).toEqual([100, 10_000, 100_000]);
    expect(TAILLES).toContain(100);
    expect(TAILLES).toContain(10_000);
  });
});

for (const scene of SCENES_DOCUMENTS) {
  describe(`Corpus ${scene}`, () => {
    for (const taille of TAILLES) {
      it(`${taille} primitives : feuillets valides, synthétique, empreinte conservée, oracles${referencesVisuelles(taille) ? ", références visuelles" : ""}`, () => {
        const corpus = genererCorpus(scene as SceneDocuments, taille);
        expect(corpus.synthetique).toBe(true);
        expect(corpus.licence).toMatch(/synthétique/);
        // La licence n'est pas affirmée : elle attend la décision du maître d'ouvrage.
        expect(corpus.licence).toMatch(/^Licence à valider par le maître d'ouvrage/);
        expect(corpus.taille).toBe(taille);
        for (const d of corpus.documents) {
          const n = d.objects.length + (d.dimensions?.length ?? 0) + (d.annotations?.length ?? 0) + (d.architecture?.length ?? 0) + (d.solides?.length ?? 0);
          expect(n).toBeLessThanOrEqual(STUDIO_LIMITS.objects);
          // Forme canonique : le document validé est identique au document généré.
          expect(JSON.stringify(validateStudioDocument(d))).toBe(JSON.stringify(d));
        }
        controlerOracle(corpus, oracleCorpus(scene, taille));
        const entree: EntreeManifeste = { corpus: empreinteCorpus(corpus), feuillets: corpus.documents.length };
        if (referencesVisuelles(taille)) {
          const ref = referenceVisuelle(corpus);
          entree.svg = ref.empreintesSvg;
          entree.maillage = ref.empreintesMaillage;
          if (taille === 100) {
            const fichier = join(REFERENCES, `${scene}-100.svg`);
            if (ECRIRE) { mkdirSync(REFERENCES, { recursive: true }); writeFileSync(fichier, ref.svg[0]!); }
            expect(readFileSync(fichier, "utf8"), `référence visuelle ${fichier}`).toBe(ref.svg[0]);
          }
        }
        const conservee = manifeste.scenes[scene]?.[String(taille)];
        // Entrée complète (références visuelles calculées) : seule une entrée complète peut être écrite, et elle
        // remplace l'ancienne en entier. Une entrée lourde calculée sans STUDIO_CORPUS_LOURD n'est jamais écrite.
        const complete = referencesVisuelles(taille);
        if (ECRIRE && complete) {
          (manifeste.scenes[scene] ??= {})[String(taille)] = entree;
          ecrireManifeste();
        } else {
          const lourde = !complete ? " (entrée lourde : STUDIO_CORPUS_LOURD=1 STUDIO_CORPUS_ECRIRE=1 pour la réécrire)" : "";
          expect(conservee, `empreintes conservées de ${scene} / ${taille} (STUDIO_CORPUS_ECRIRE=1 pour les écrire)${lourde}`).toBeDefined();
          expect(entree.corpus, `empreinte du corpus${lourde}`).toBe(conservee!.corpus);
          expect(entree.feuillets, `feuillets${lourde}`).toBe(conservee!.feuillets);
          if (complete) {
            expect(entree.svg, "empreintes des SVG de référence").toEqual(conservee!.svg);
            expect(entree.maillage, "empreintes du maillage 3D dérivé").toEqual(conservee!.maillage);
          }
        }
      });
    }
    it("déterministe : même graine, même corpus ; couverture déclarée", () => {
      const a = genererCorpus(scene as SceneDocuments, 100), b = genererCorpus(scene as SceneDocuments, 100);
      expect(empreinteCorpus(a)).toBe(empreinteCorpus(b));
      expect(a.couverture.representes.length).toBeGreaterThan(0);
      for (const x of a.couverture.absents) expect(x.raison.length).toBeGreaterThan(0);
      // Rien n'est daté ni tiré de l'horloge : aucune valeur ne change d'un appel à l'autre.
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
}

describe("Feuillets au-delà de la borne d'un document", () => {
  it("un feuillet ne coupe jamais un motif : cotes et ouvertures restent avec leur objet", () => {
    // 20 008 primitives de S2 (motif de 8) : deux feuillets, le second porte un motif entier.
    const c = genererCorpus("S2", 20_008);
    expect(c.documents).toHaveLength(2);
    expect(c.documents[1]!.architecture).toHaveLength(4);
    controlerOracle(c, oracleCorpus("S2", 20_008));
  });
  it("un motif entamé (taille non multiple du motif) reste valide et l'oracle en tient compte", () => {
    for (const scene of SCENES_DOCUMENTS) for (const taille of [1, 3, 7, 13]) controlerOracle(genererCorpus(scene, taille), oracleCorpus(scene, taille));
  });
});

describe("REC-A-03 dans le corpus", () => {
  it("S2 : mur de 6 × 0,2 × 3 m — brut 3,600 m³, porte 0,420 m³, net 3,180 m³", () => {
    const o = oracleCorpus("S2", 100).murs!.premier!;
    proche(o.brut, 3.6, "brut");
    proche(o.deduit, 0.42, "déduit");
    proche(o.net, 3.18, "net");
  });
});

/** Rejoue un plan S6 dans le modèle seul (sans API) : têtes de chaque variante. */
function rejouerS6() {
  const plan = planS6();
  const tetes = new Map<string, StudioDocument>();
  const apres = new Map<string, StudioDocument>();
  for (const e of plan.etapes) {
    let doc = tetes.get(e.variante);
    if (!doc) {
      const v = plan.variantes.find((x) => x.cle === e.variante)!;
      doc = v.depuis ? apres.get(v.depuis.apresEtape)! : newStudioDocument(plan.base.id);
    }
    doc = applyStudioCommands(doc, e.commandes);
    tetes.set(e.variante, doc);
    apres.set(e.cle, doc);
  }
  return { plan, tetes, apres };
}

describe("S6 — étude à variantes et révisions (plan rejoué par le modèle)", () => {
  it("A1 recrée exactement le plan de base ; têtes A, B, C conformes à l'oracle ; REC-A-03 3,180 puis 3,096 m³", () => {
    const { plan, tetes, apres } = rejouerS6();
    const o = oracleS6();
    expect(JSON.stringify(apres.get("A1"))).toBe(JSON.stringify(plan.base));
    for (const cle of ["A", "B", "C"] as const) {
      const doc = tetes.get(cle)!, attendu = o.variantes[cle];
      const c = comptes({ documents: [doc] } as CorpusStudio);
      expect({ wall: c.wall, opening: c.opening, line: c.line, dimension: c.dimension, text: c.text }, `variante ${cle}`).toEqual({ wall: attendu.wall, opening: attendu.opening, line: attendu.line, dimension: attendu.dimension, text: attendu.text });
      const m = mesures({ documents: [doc] } as CorpusStudio).murs;
      for (const k of ["brut", "deduit", "net"] as const) proche(m[k], attendu.murs[k], `variante ${cle} : murs ${k}`);
      const jeu = { version: 1, exigences: plan.exigences.map((e) => ({ ...e, valeur: o.exigences.valeurs[e.id]! })) };
      const controle = controlerExigences("s6", cle, doc, jeu);
      expect(controle.conclusion, `contrôle ${cle}`).toBe(o.exigences.conclusions[cle]);
      expect(Object.fromEntries(controle.ecarts.map((e) => [e.exigenceId, e.statut])), `écarts ${cle}`).toEqual(o.exigences.statuts[cle]);
    }
    const premier = (d: StudioDocument) => studioQuantitesArchitecture(d.architecture ?? []).find((x) => x.id === "s6-0-mur-h")!;
    const avant = premier(apres.get("A1")!), apresA2 = premier(apres.get("A2")!);
    if (avant.type !== "wall" || apresA2.type !== "wall") throw new Error("mur attendu");
    proche(avant.volumeNet, 3.18, "A1 : net du mur s6-0-mur-h");
    proche(apresA2.volumeNet, 3.096, "A2 : net du mur s6-0-mur-h");
    proche(apresA2.volumeNet, o.premierMur.apres.net, "A2 : net selon l'oracle");
    for (const [cle, n] of Object.entries(o.revisionsAjoutees)) expect(plan.etapes.filter((e) => e.variante === cle)).toHaveLength(n);
    expect(plan.couverture.representes.length).toBeGreaterThan(0);
    for (const x of plan.couverture.absents) expect(x.raison.length).toBeGreaterThan(0);
  });

  it("fixture de la recette API (fixtures/s6-plan.json) identique au plan et à l'oracle générés", () => {
    const attendu = `${JSON.stringify({ plan: planS6(), oracle: oracleS6() }, null, 1)}\n`;
    const fichier = join(FIXTURES, "s6-plan.json");
    if (ECRIRE) { mkdirSync(FIXTURES, { recursive: true }); writeFileSync(fichier, attendu); }
    expect(readFileSync(fichier, "utf8")).toBe(attendu);
    const corps = JSON.stringify({ contractVersion: "studio-commands/1", requestId: "x".repeat(64), baseRevisionId: "x".repeat(64), commands: planS6().etapes[0]!.commandes });
    // La recette envoie A1 en une enveloppe : sous la limite de corps de l'API (256 ko).
    expect(corps.length).toBeLessThan(256 * 1024);
  });
});

describe("S7 — session hors réseau (corpus de départ de la recette e2e)", () => {
  it("fixture de la recette (fixtures/s7-100.json) : document, commandes qui le recréent, attendus après reconnexion", () => {
    const corpus = genererCorpus("S7", 100), doc = corpus.documents[0]!;
    // Couverture propre à la session hors réseau, distincte de celle du plan de niveau S2.
    expect(corpus.couverture).not.toEqual(genererCorpus("S2", 100).couverture);
    expect(corpus.couverture.representes.join(" ")).toMatch(/hors réseau/);
    const commandes = commandesDuDocument(doc);
    expect(JSON.stringify(applyStudioCommands(newStudioDocument(doc.id), commandes))).toBe(JSON.stringify(doc));
    const attendu = `${JSON.stringify({ scene: "S7", definition: corpus.definition, synthetique: true, licence: corpus.licence, avertissement: corpus.avertissement, couverture: corpus.couverture, empreinte: empreinteCorpus(corpus), document: doc, commandes, session: oracleSessionS7(100) }, null, 1)}\n`;
    const fichier = join(FIXTURES, "s7-100.json");
    if (ECRIRE) { mkdirSync(FIXTURES, { recursive: true }); writeFileSync(fichier, attendu); }
    expect(readFileSync(fichier, "utf8")).toBe(attendu);
  });
});

describe("Empreintes des plans", () => {
  it("S6 : empreinte du plan entier conservée (base, variantes, étapes et exigences)", () => {
    const e = empreintePlanS6(planS6());
    if (ECRIRE) { manifeste.plans.S6 = e; ecrireManifeste(); }
    expect(e).toBe(manifeste.plans.S6);
    // Une étape ou une exigence changée change l'empreinte.
    const p = planS6();
    expect(empreintePlanS6({ ...p, etapes: p.etapes.slice(1) })).not.toBe(e);
    expect(empreintePlanS6({ ...p, exigences: p.exigences.map((x) => ({ ...x, tolerance: 0 })) })).not.toBe(e);
  });
});
