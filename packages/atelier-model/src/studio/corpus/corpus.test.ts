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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_LIMITS, validateStudioDocument, type StudioDocument } from "../document-2d.js";
import { quantitesStudio, type GrandeurQuantite } from "../quantites.js";
import { studioQuantitesSolides } from "../solides-libres.js";
import type { StudioSolideExactBooleen } from "../objets-3d/exacts.js";
import { studioAireApprocheeSurface, studioPointSurface } from "../objets-3d/surfaces-libres.js";
import { studioAireSubdivision, studioMaillageSubdivise, studioVolumeSubdivision } from "../objets-3d/subdivisions.js";
import { studioQuantitesArchitecture } from "../architecture/index.js";
import { studioAngularValue } from "../objets/cote-angulaire.js";
import { studioDimensionValue } from "../objets/cote.js";
import { measureStudioDimension } from "../document-2d.js";
import { controlerExigences } from "../facade-exigences.js";
import { studioAireContour } from "../graphismes/graphismes.js";
import { lireDxfStudio } from "../import-dxf.js";
import { studioSha256 } from "../empreinte-sha256.js";
import { createHash } from "node:crypto";

const studioSha256Octets = (o: Buffer) => createHash("sha256").update(o).digest("hex");
import {
  commandesDuDocument, empreinteCorpus, fondAxesS2, primitivesDuDocument, REFERENCE_S2, empreintePlanS6, genererCorpus, oracleCorpus, oracleS6, oracleSessionS7, planS6, primitivesDu, referenceVisuelle,
  LICENCE_CORPUS, parametresS5, SCENES_DOCUMENTS, SURFACES_S5, TAILLES_ILLUSTRATIVES, TOLERANCE_ORACLE, TOLERANCE_ORACLE_SURFACES, type CorpusStudio, type OracleCorpus, type SceneDocuments,
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
    for (const e of [...d.objects, ...(d.dimensions ?? []), ...(d.annotations ?? []), ...(d.architecture ?? []), ...(d.solides ?? []), ...(d.exacts ?? []), ...(d.surfaces ?? []), ...(d.subdivisions ?? []), ...(d.graphismes ?? [])]) c[e.type] = (c[e.type] ?? 0) + 1;
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
  // Graphismes (aire des contours, symboles posés, points des splines), solides exacts (volume du noyau), sources.
  const graphismes = { aireHachures: 0, symboles: {} as Record<string, number>, pointsSplines: 0 };
  const exacts = { operations: {} as Record<string, number>, volume: 0 };
  const surfaces = { nombre: 0, aire: 0, epaissies: 0, volumeEpaissies: 0 };
  const subdivisions = { nombre: 0, aire: 0, volume: 0, solidifiees: 0, volumeSolidifiees: 0 };
  const sources = { nombre: 0, objets: 0 };
  for (const d of corpus.documents) {
    for (const g of d.graphismes ?? []) {
      if (g.type === "hachure") graphismes.aireHachures += Math.abs(studioAireContour(g.contour));
      else if (g.type === "symbole") graphismes.symboles[g.symbole] = (graphismes.symboles[g.symbole] ?? 0) + 1;
      else graphismes.pointsSplines += g.points.length;
    }
    for (const e of d.exacts ?? []) {
      exacts.operations[e.operation] = (exacts.operations[e.operation] ?? 0) + 1;
      // Surfaces épaissies (X.1-05) : volume du noyau, comparé à part avec sa tolérance.
      if (e.operation === "epaississement") { surfaces.epaissies++; surfaces.volumeEpaissies += e.resultat.volume; }
      else if (e.operation === "solidification") { subdivisions.solidifiees++; subdivisions.volumeSolidifiees += e.resultat.volume; }
      else exacts.volume += e.resultat.volume;
    }
    for (const s of d.surfaces ?? []) { surfaces.nombre++; surfaces.aire += studioAireApprocheeSurface(s); }
    for (const s of d.subdivisions ?? []) { subdivisions.nombre++; subdivisions.aire += studioAireSubdivision(s); subdivisions.volume += studioVolumeSubdivision(s) ?? Number.NaN; }
    for (const x of d.sources ?? []) { sources.nombre++; sources.objets += x.objets; }
  }
  return { totaux, volumeNonEvalues, volumeSolides, cotes: { liees, libres, sommeMesures }, angles: { nombre: angles, sommeDegres }, murs, premier, graphismes, exacts, surfaces, subdivisions, sources };
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
  // Volume des solides hors surfaces épaissies (formes closes, TOLERANCE_ORACLE) ; épaissies : tolérance du noyau.
  proche(m.volumeSolides - m.surfaces.volumeEpaissies - m.subdivisions.volumeSolidifiees, (o.volumeSolides ?? 0) - (o.surfaces?.volumeEpaissies ?? 0) - (o.subdivisions?.volumeSolidifiees ?? 0), "volume des solides");
  if (o.subdivisions) {
    expect([m.subdivisions.nombre, m.subdivisions.solidifiees], "surfaces de subdivision, solidifiées").toEqual([o.subdivisions.nombre, o.subdivisions.solidifiees]);
    // Maillage subdivisé de forme close (Loop niveau 1) : aire et volume au calcul flottant près ; solide polyédrique du noyau : tolérance du noyau.
    proche(m.subdivisions.aire, o.subdivisions.aire, "aire des surfaces de subdivision");
    proche(m.subdivisions.volume, o.subdivisions.volume, "volume des surfaces de subdivision");
    expect(Math.abs(m.subdivisions.volumeSolidifiees - o.subdivisions.volumeSolidifiees), "volume des subdivisions solidifiées (noyau)").toBeLessThanOrEqual(TOLERANCE_ORACLE_SURFACES.volumeNoyau * Math.max(1e-12, o.subdivisions.volumeSolidifiees));
  } else expect(m.subdivisions).toEqual({ nombre: 0, aire: 0, volume: 0, solidifiees: 0, volumeSolidifiees: 0 });
  if (o.surfaces) {
    expect([m.surfaces.nombre, m.surfaces.epaissies], "surfaces libres, surfaces épaissies").toEqual([o.surfaces.nombre, o.surfaces.epaissies]);
    expect(Math.abs(m.surfaces.aire - o.surfaces.aire), `aire des surfaces libres : ${m.surfaces.aire} au lieu de ${o.surfaces.aire}`).toBeLessThanOrEqual(TOLERANCE_ORACLE_SURFACES.aireMaillage * o.surfaces.aire);
    expect(Math.abs(m.surfaces.volumeEpaissies - o.surfaces.volumeEpaissies), `volume des surfaces épaissies (noyau) : ${m.surfaces.volumeEpaissies} au lieu de ${o.surfaces.volumeEpaissies}`).toBeLessThanOrEqual(TOLERANCE_ORACLE_SURFACES.volumeNoyau * Math.max(1e-12, o.surfaces.volumeEpaissies));
  } else expect(m.surfaces).toEqual({ nombre: 0, aire: 0, epaissies: 0, volumeEpaissies: 0 });
  if (o.graphismes) {
    proche(m.graphismes.aireHachures, o.graphismes.aireHachures, "aire des hachures");
    expect(m.graphismes.symboles, "symboles posés").toEqual(o.graphismes.symboles);
    expect(m.graphismes.pointsSplines, "points des splines").toBe(o.graphismes.pointsSplines);
  } else expect(m.graphismes).toEqual({ aireHachures: 0, symboles: {}, pointsSplines: 0 });
  if (o.exacts) {
    expect(m.exacts.operations, "booléens par opération").toEqual(o.exacts.operations);
    proche(m.exacts.volume, o.exacts.volume, "volume des solides exacts (noyau)");
  } else expect(m.exacts.volume).toBe(0);
  expect(m.sources, "références externes déclarées").toEqual(o.sources ?? { nombre: 0, objets: 0 });
}

const TAILLES: readonly number[] = LOURD ? TAILLES_ILLUSTRATIVES : TAILLES_ILLUSTRATIVES.filter((t) => t <= 10_000);
const referencesVisuelles = (taille: number) => taille === 100 || LOURD;

describe("Corpus de qualification S1–S7 : licence d'utilisation (REF-02 §18.2, X.1-01 à X.1-08)", () => {
  const RACINE_DEPOT = join(ICI, "../../../../..");
  it("licence du corpus établie : celle du dépôt (aucune licence ouverte déclarée, droits réservés), corpus généré sans source tierce", () => {
    // Faits de la licence du dépôt, relus : un fichier de licence ou un champ « license » ajouté fait échouer ce test.
    const racine = readdirSync(RACINE_DEPOT);
    expect(racine.filter((f) => /^(?:LICEN[CS]E|COPYING)(?:\.|$)/i.test(f))).toEqual([]);
    const manifeste = JSON.parse(readFileSync(join(RACINE_DEPOT, "package.json"), "utf8")) as { private?: boolean; license?: string };
    expect(manifeste.private).toBe(true);
    expect(manifeste.license).toBeUndefined();
    const doc = readFileSync(join(ICI, "LICENCE.md"), "utf8");
    expect(doc).toMatch(/aucune licence ouverte/);
    expect(doc).toMatch(/droits réservés du titulaire du dépôt/);
    expect(LICENCE_CORPUS).toMatch(/corpus\/LICENCE\.md/);
    // Chaque scène et le plan S6 portent cette licence.
    for (const scene of SCENES_DOCUMENTS) expect(genererCorpus(scene, 100).licence).toBe(LICENCE_CORPUS);
    expect(planS6().licence).toBe(LICENCE_CORPUS);
  });
});

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
        // Licence établie (X.1-01 à X.1-07) : celle du dépôt, le corpus étant généré par son code (corpus/LICENCE.md).
        expect(corpus.licence).toBe(LICENCE_CORPUS);
        expect(corpus.licence).toMatch(/^Licence du dépôt Fadi \(RachEma-ux\/Fadi\) : corpus synthétique généré par le code du dépôt, aucune source tierce/);
        expect(corpus.taille).toBe(taille);
        for (const d of corpus.documents) {
          expect(primitivesDuDocument(d)).toBeLessThanOrEqual(STUDIO_LIMITS.objects);
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
    // 20 007 primitives de S2 (motif de 9) : deux feuillets, le second porte un motif entier (3 murs, 2 ouvertures).
    const c = genererCorpus("S2", 20_007);
    expect(c.documents).toHaveLength(2);
    expect(c.documents[1]!.architecture).toHaveLength(5);
    controlerOracle(c, oracleCorpus("S2", 20_007));
  });
  it("un motif entamé (taille non multiple du motif) reste valide et l'oracle en tient compte", () => {
    for (const scene of SCENES_DOCUMENTS) for (const taille of [1, 3, 7, 13]) controlerOracle(genererCorpus(scene, taille), oracleCorpus(scene, taille));
  });
});

describe("X.1-01 / X.1-02 / X.1-05 — éléments ajoutés au corpus depuis les fonctions livrées", () => {
  it("X.1-01 S1 : hachures, symboles (blocs de bibliothèque) et splines dans chaque motif, rendus dans le SVG de référence", () => {
    const c = genererCorpus("S1", 100), d = c.documents[0]!;
    const types = new Set((d.graphismes ?? []).map((g) => g.type));
    expect([...types].sort()).toEqual(["hachure", "spline", "symbole"]);
    expect(c.couverture.representes.join(" ")).toMatch(/hachures/);
    expect(c.couverture.absents.map((x) => x.element)).not.toContain("hachures");
    const svg = referenceVisuelle(c).svg[0]!;
    expect(svg).toMatch(/opacity="0.5"/);
    expect(svg).toMatch(/ C /);
  });

  it("X.1-02 S2 : croisements de murs en cours de portée et référence externe déclarée — fond DXF des axes relu, empreinte du fichier recalculée", () => {
    const c = genererCorpus("S2", 100), d = c.documents[0]!;
    const traversants = (d.architecture ?? []).filter((a) => a.type === "wall" && a.id.endsWith("mur-traversant"));
    // 100 primitives = 11 motifs entiers et un motif entamé (son premier mur seulement) : 11 murs traversants.
    expect(traversants.length).toBe(Math.floor(100 / 9));
    // Un traversant croise le mur vertical de sa cellule à 4,5 m de son départ (hors d'une extrémité).
    const t = traversants[0]!, v = d.architecture!.find((a) => a.id === "s2-0-mur-v")!;
    if (t.type !== "wall" || v.type !== "wall") throw new Error("murs attendus");
    expect(t.axis[0]!.x < v.axis[0]!.x && t.axis[1]!.x > v.axis[0]!.x && t.axis[0]!.y > v.axis[0]!.y && t.axis[0]!.y < v.axis[1]!.y).toBe(true);
    // Référence externe : provenance d'un vrai fichier — même empreinte que le fond recalculé, relu en autant de lignes.
    const [source] = d.sources!;
    const fond = fondAxesS2(d);
    expect(source).toMatchObject({ format: "dxf", versionFormat: "AC1009", nomFichier: REFERENCE_S2.nomFichier, uniteLue: "m", facteur: 1, transformation: "identite", objets: fond.objets });
    expect(source!.empreinteSha256).toBe(studioSha256(fond.dxf));
    const relu = lireDxfStudio(fond.dxf);
    expect(relu.statut).toBe("pret");
    const lignes = relu.commandes.filter((x) => x.toolId === "studio.dessin.ligne");
    expect(lignes).toHaveLength(fond.objets);
    const axes = d.objects.filter((o) => o.layerId === "axes");
    for (const [i, l] of lignes.entries()) {
      const a = axes[i]!, p = l.params as { start: { x: number; y: number }; end: { x: number; y: number } };
      if (a.type !== "line") throw new Error("ligne attendue");
      for (const k of ["start", "end"] as const) { expect(p[k].x).toBeCloseTo(a[k].x, 6); expect(p[k].y).toBeCloseTo(a[k].y, 6); }
    }
    expect(c.couverture.absents.map((x) => x.element)).toEqual(["jonctions calculées aux croisements de murs", "modèle lié dans le document"]);
  });

  it("X.1-05 S5 : booléens exacts (union, différence, intersection) aux opérandes conservés, maillage du noyau dans la référence 3D", () => {
    const c = genererCorpus("S5", 100), d = c.documents[0]!;
    expect(d.exacts?.filter((e) => e.operation !== "epaississement" && e.operation !== "solidification").map((e) => [e.operation, (e as StudioSolideExactBooleen).operandes.map((o) => o.id)])).toEqual([
      ["union", ["s5-0-op-a", "s5-0-op-b"]], ["difference", ["s5-1-op-a", "s5-1-op-b"]], ["intersection", ["s5-2-op-a", "s5-2-op-b"]],
    ]);
    // Les opérandes sont conservés, jamais rangés parmi les solides libres.
    expect((d.solides ?? []).some((s) => s.id.includes("-op-"))).toBe(false);
    expect(c.couverture.absents.map((x) => x.element)).toEqual(["subdivision de Catmull-Clark (faces quadrangulaires)"]);
  });

  it("X.1-05 S5 : surface de subdivision de Loop (tétraèdre régulier, niveau 1) et sa solidification polyédrique par le noyau, surface conservée — oracle de forme close (sommets a/4, points d'arête (a + b)/4 ; aire s² (3√2/4 + √3/2), volume 5 s³ / 24), dans l'enveloppe convexe du maillage de contrôle", () => {
    const c = genererCorpus("S5", 100), d = c.documents[0]!, o = oracleCorpus("S5", 100);
    const s = d.subdivisions?.[0];
    expect(d.subdivisions?.map((x) => x.id)).toEqual([`s5-${SURFACES_S5.subdivision}-subdivision`]);
    expect(s).toMatchObject({ type: "surface-subdivision", niveau: 1, faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]] });
    // Forme close indépendante du code de Loop : chaque sommet du niveau 1 est un a/4 ou un (a + b)/4 (centre retiré).
    const t = parametresS5(SURFACES_S5.subdivision).subdivision.s;
    const centre = { x: -20 * (SURFACES_S5.subdivision + 1), y: -20, z: t };
    const attendus = new Set<string>();
    const v = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    const k = (p: number[]) => p.map((x) => (t * x / 4).toFixed(9)).join(",");
    for (let i = 0; i < 4; i++) { attendus.add(k(v[i]!)); for (let j = i + 1; j < 4; j++) attendus.add(k(v[i]!.map((x, n) => x + v[j]![n]!))); }
    const m = studioMaillageSubdivise(s!);
    const obtenus = new Set<string>();
    for (let i = 0; i < m.positions.length; i += 3) obtenus.add([m.positions[i]! - centre.x, m.positions[i + 1]! - centre.y, m.positions[i + 2]! - centre.z].map((x) => x.toFixed(9)).join(","));
    expect([...obtenus].sort()).toEqual([...attendus].sort());
    // Enveloppe convexe du tétraèdre de contrôle : |x| + |y| + |z| ≤ 3 t pour chaque point (inégalités des quatre faces).
    for (let i = 0; i < m.positions.length; i += 3) {
      const [x, y, z] = [m.positions[i]! - centre.x, m.positions[i + 1]! - centre.y, m.positions[i + 2]! - centre.z];
      for (const [a, b, cc] of [[1, 1, -1], [1, -1, 1], [-1, 1, 1], [-1, -1, -1]]) expect(a! * x + b! * y + cc! * z).toBeLessThanOrEqual(t + 1e-12);
    }
    proche(studioAireSubdivision(s!), t * t * ((3 * Math.SQRT2) / 4 + Math.sqrt(3) / 2), "aire du niveau 1");
    proche(studioVolumeSubdivision(s!), (5 * t ** 3) / 24, "volume du niveau 1");
    const e = d.exacts?.find((x) => x.operation === "solidification");
    expect(e).toMatchObject({ id: `s5-${SURFACES_S5.solidifiee}-solidifiee`, subdivision: { id: `s5-${SURFACES_S5.solidifiee}-subdivision`, niveau: 1 } });
    const ts = parametresS5(SURFACES_S5.solidifiee).subdivision.s;
    expect(Math.abs(e!.resultat.volume - (5 * ts ** 3) / 24) / e!.resultat.volume).toBeLessThan(TOLERANCE_ORACLE_SURFACES.volumeNoyau);
    expect(o.subdivisions).toMatchObject({ nombre: 1, solidifiees: 1 });
  });

  it("X.1-05 S5 : surface libre NURBS (quart de cylindre rationnel, pôles et poids) et surface épaissie par le noyau, surface conservée — oracle de forme close (aire π R L / 2, volume π/4 ((R + e)² − R²) L)", () => {
    const c = genererCorpus("S5", 100), d = c.documents[0]!, o = oracleCorpus("S5", 100);
    const s = d.surfaces?.[0];
    expect(d.surfaces?.map((x) => x.id)).toEqual([`s5-${SURFACES_S5.surface}-surface`]);
    expect(s).toMatchObject({ type: "surface-libre", degreU: 2, degreV: 1, lignes: 3, colonnes: 2, poids: [1, 1, Math.SQRT1_2, Math.SQRT1_2, 1, 1] });
    // Chaque point de la nappe est à la distance R de l'axe : le quart de cylindre est exact (rationnel), pas approché.
    const q = parametresS5(SURFACES_S5.surface).surface, axe = s!.controle[2]!;
    const cx = axe.x - q.rayon, cy = axe.y - q.rayon;
    for (const u of [0, 0.1, 0.37, 0.5, 0.9, 1]) { const P = studioPointSurface(s!, u, 0.5); expect(Math.hypot(P.x - cx, P.y - cy)).toBeCloseTo(q.rayon, 12); }
    const e = d.exacts?.find((x) => x.operation === "epaississement");
    expect(e).toMatchObject({ id: `s5-${SURFACES_S5.epaissie}-epaissie`, epaisseur: 0.1, sens: "normale", surface: { id: `s5-${SURFACES_S5.epaissie}-surface`, type: "surface-libre" } });
    expect(o.surfaces).toMatchObject({ nombre: 1, epaissies: 1 });
    const p = parametresS5(SURFACES_S5.epaissie).surface;
    expect(Math.abs(e!.resultat.volume - (Math.PI / 4) * ((p.rayon + p.epaisseur) ** 2 - p.rayon ** 2) * p.hauteur) / e!.resultat.volume).toBeLessThan(TOLERANCE_ORACLE_SURFACES.volumeNoyau);
    expect(Math.abs(studioAireApprocheeSurface(s!) - (Math.PI * q.rayon * q.hauteur) / 2) / ((Math.PI * q.rayon * q.hauteur) / 2)).toBeLessThan(TOLERANCE_ORACLE_SURFACES.aireMaillage);
  });
});

describe("Commandes qui recréent le corpus (recettes par l'API)", () => {
  it("chaque scène S1–S7 (100 primitives) : les commandes appliquées à un document vide rendent le feuillet à l'identique (graphismes, exacts, sources compris)", () => {
    for (const scene of SCENES_DOCUMENTS) {
      const doc = genererCorpus(scene, 100).documents[0]!;
      expect(JSON.stringify(applyStudioCommands(newStudioDocument(doc.id), commandesDuDocument(doc))), scene).toBe(JSON.stringify(doc));
    }
  });
});

/**
 * Références visuelles rendues (X.1-08) : la recette `apps/web/e2e/studio-corpus-references.mjs` pose chaque scène de
 * `fixtures/references-100.json` par l'API, la photographie dans Chromium (planche 2D et vue 3D) et compare chaque image
 * à la référence versionnée de `references/captures/` (empreinte SHA-256 dans `captures.json`). Ici : la fixture est
 * celle du corpus, et chaque image citée par le manifeste existe avec son empreinte.
 */
interface ManifesteCaptures { $commentaire: string; navigateur: string; moteur3d: string; tolerance: { ecartCanal: number; partPixels: number }; viewport: { largeur: number; hauteur: number }; scenes: Record<string, Record<"plan" | "vue3d", { fichier: string; sha256: string; largeur: number; hauteur: number }>> }
const CAPTURES = join(REFERENCES, "captures");
const SCENES_REFERENCES = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"] as const;

function fixtureReferences() {
  const scenes = SCENES_REFERENCES.map((scene) => {
    if (scene === "S6") {
      const plan = planS6();
      const doc = plan.etapes.filter((e) => e.variante === "A").reduce((d, e) => applyStudioCommands(d, e.commandes), newStudioDocument(plan.base.id));
      return { scene, libelle: "S6 — tête de la variante A (étapes A1 à A3)", empreinte: empreintePlanS6(plan), primitives: primitivesDuDocument(doc), commandes: commandesDuDocument(doc) };
    }
    const c = genererCorpus(scene, 100), doc = c.documents[0]!;
    return { scene, libelle: c.definition, empreinte: empreinteCorpus(c), primitives: primitivesDuDocument(doc), commandes: commandesDuDocument(doc) };
  });
  return { $commentaire: "Scènes S1–S7 (100 primitives, S6 : tête de A) posées par la recette studio-corpus-references.mjs ; générées par corpus.test.ts (STUDIO_CORPUS_ECRIRE=1). Géométrie synthétique.", licence: LICENCE_CORPUS, scenes };
}

describe("X.1-08 — références visuelles rendues (raster 2D et vue 3D)", () => {
  it("X.1-08 fixture des références rendues : scènes S1–S7 posables par l'API (une enveloppe chacune, sous les limites)", () => {
    const attendu = `${JSON.stringify(fixtureReferences())}\n`;
    const fichier = join(FIXTURES, "references-100.json");
    if (ECRIRE) writeFileSync(fichier, attendu);
    expect(readFileSync(fichier, "utf8")).toBe(attendu);
    for (const sc of fixtureReferences().scenes) {
      expect(sc.commandes.length, sc.scene).toBeLessThanOrEqual(500);
      expect(JSON.stringify({ contractVersion: "studio-commands/1", requestId: "x".repeat(64), baseRevisionId: "x".repeat(64), commands: sc.commandes }).length, `${sc.scene} : sous la limite de corps de l'API (256 ko)`).toBeLessThan(256 * 1024);
    }
  });

  it("X.1-08 captures de référence versionnées : chaque image (planche 2D et vue 3D, S1–S7) existe avec son empreinte SHA-256", () => {
    const manifeste = JSON.parse(readFileSync(join(CAPTURES, "captures.json"), "utf8")) as ManifesteCaptures;
    expect(Object.keys(manifeste.scenes).sort()).toEqual([...SCENES_REFERENCES]);
    expect(manifeste.navigateur).toMatch(/Chrom/);
    for (const [scene, vues] of Object.entries(manifeste.scenes)) for (const vue of ["plan", "vue3d"] as const) {
      const r = vues[vue], octets = readFileSync(join(CAPTURES, r.fichier));
      expect(octets.subarray(1, 4).toString("latin1"), `${scene}/${vue} : PNG`).toBe("PNG");
      expect(studioSha256Octets(octets), `${scene}/${vue} : empreinte`).toBe(r.sha256);
      // Largeur et hauteur lues dans l'en-tête IHDR du PNG.
      expect([octets.readUInt32BE(16), octets.readUInt32BE(20)], `${scene}/${vue} : dimensions`).toEqual([r.largeur, r.hauteur]);
    }
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
