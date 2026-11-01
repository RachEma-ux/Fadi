/**
 * Lot G2 — AC-004 et MES-05 (achèvement Studio).
 *
 * AC-004 : sur un corpus comportant des objets **superposés** (doublons exacts, côté de rectangle confondu avec une
 * ligne), des **densités variables** (amas serré de petits segments, longues lignes éparses), des **intersections** et
 * des **références liées** (cotes associatives liées aux extrémités, murs dont le contour s'accroche), l'index accéléré
 * (grille, et index incrémental après insertions et suppressions) rend les mêmes cibles et les mêmes points
 * d'accrochage que le parcours linéaire de référence, **avec la trace des cas ambigus** (candidates à égalité, règle
 * de départage) ; la désignation au point (sélection) aussi. Une candidate se choisit explicitement (« Cible
 * d'accrochage suivante »). Cas négatif : un index qui choisit une autre cible après insertion / suppression fait
 * échouer le critère, malgré un gain de p95.
 *
 * MES-05 : comparaison **simultanée**, avant / après optimisation, des cibles d'accrochage, de la désignation
 * (picking), des dimensions (cotes), des quantités, de l'historique (annuler / rétablir) et des exports (SVG, DXF,
 * IFC), dans une seule évaluation (`studioEvaluerOptimisation`) : chemin de référence (parcours linéaire, document
 * appliqué d'un bloc, maillage direct) contre chemins optimisés du client (index incrémental, brouillon à instantanés,
 * maillage incrémental). Le p95 relevé ici est celui du banc qui exécute (aucune valeur d'appareil ni budget).
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyStudioCommands, exportStudioDxf, exportStudioIfc, exportStudioSvg, measureStudioDimension, newStudioDocument, quantitesStudio, studioMesh3d, studioMesh3dIncremental,
  validateStudioDocument, type StudioCommand, type StudioDocument, type StudioShape,
} from "@parcours/atelier-model";
import { studioEvaluerOptimisation, type StudioCritereOptimisation } from "@parcours/atelier-model/studio-cmd";
import { contoursMurs } from "./architecture/architecture-ui";
import { candidatsObjets, indexAccrochage, indexLineaire, MODES_ACCROCHAGE, resoudreTrace, suiviAccrochage, type IndexAccrochage, type ReglagesAccrochage, type RequeteAccrochage } from "./accrochage";
import { annulerBrouillon, appliquerBrouillon, creerBrouillon, documentBrouillon, peutAnnuler, retablirBrouillon } from "./brouillon";
import { designationAuPoint, designationAuPointLineaire, designationSuivante } from "./selection";

vi.setConfig({ testTimeout: 120_000 });

const reglages: ReglagesAccrochage = { objets: true, modes: new Set(MODES_ACCROCHAGE), orthogonal: false, polaire: false, pasPolaire: 45 };

/** Générateur pseudo-aléatoire à graine fixe (mulberry32) : corpus et requêtes reproductibles. */
function alea(graine: number) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Commandes du corpus AC-004 (au-dessus du seuil de l'index : 1 000 formes et plus). */
function commandesCorpus(n = 1100): StudioCommand[] {
  const h = alea(4);
  const cs: StudioCommand[] = [];
  const ligne = (id: string, a: { x: number; y: number }, b: { x: number; y: number }) => cs.push({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: a, end: b } });
  // Amas dense : petits segments dans un carré de 10 m.
  for (let i = 0; i < n * 0.6; i++) { const x = r3(h() * 10), y = r3(h() * 10); ligne(`d${i}`, { x, y }, { x: r3(x + 0.05 + h() * 0.3), y: r3(y + h() * 0.3) }); }
  // Zone éparse : longues lignes qui se croisent (intersections), sur 200 m.
  for (let i = 0; i < n * 0.15; i++) ligne(`e${i}`, { x: r3(20 + h() * 180), y: r3(20 + h() * 180) }, { x: r3(20 + h() * 180), y: r3(20 + h() * 180) });
  // Superposés : doublons exacts d'une ligne, et côté de rectangle confondu avec une ligne.
  for (let i = 0; i < n * 0.05; i++) {
    const x = 300 + i * 3, y = 300;
    ligne(`s${i}`, { x, y }, { x: x + 2, y });
    ligne(`s${i}-bis`, { x, y }, { x: x + 2, y });
    cs.push({ toolId: "studio.dessin.rectangle", params: { id: `q${i}`, type: "rectangle", origin: { x, y }, width: 2, height: 1 } });
  }
  // Jonctions en T : l'extrémité d'une ligne posée sur une autre (extrémité et intersection au même point).
  for (let i = 0; i < n * 0.02; i++) { const x = 700 + i * 4; ligne(`th${i}`, { x, y: 0 }, { x: x + 2, y: 0 }); ligne(`tv${i}`, { x: x + 1, y: 0 }, { x: x + 1, y: 1.5 }); }
  // Cercles qui recoupent l'amas (intersections courbes).
  for (let i = 0; i < n * 0.05; i++) cs.push({ toolId: "studio.dessin.cercle", params: { id: `c${i}`, type: "circle", center: { x: r3(h() * 10), y: r3(h() * 10) }, radius: r3(0.2 + h()) } });
  // Références liées : cotes associatives aux extrémités des doublons ; murs dont le contour s'accroche.
  for (let i = 0; i < n * 0.05; i += 2) {
    cs.push({ toolId: "studio.dessin.cote", params: { id: `k${i}`, type: "dimension", start: { x: 300 + i * 3, y: 300 }, end: { x: 302 + i * 3, y: 300 }, offset: 0.5, links: { start: { objectId: `s${i}`, anchor: "start" }, end: { objectId: `s${i}`, anchor: "end" } }, toResolve: false } });
  }
  for (let i = 0; i < 5; i++) cs.push({ toolId: "studio.architecture.mur", params: { id: `m${i}`, type: "wall", axis: [{ x: 500 + i * 10, y: 0 }, { x: 506 + i * 10, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } });
  return cs;
}
const corpus = (cs = commandesCorpus()) => applyStudioCommands(newStudioDocument("ac004"), cs);
/** Formes accrochables de la planche (formes du document et contours des murs, comme `gestes.ts`). */
const accrochables = (d: StudioDocument): StudioShape[] => [...d.objects, ...contoursMurs(d, () => true)];

/** Requêtes : extrémités confondues (égalités), milieux, intersections, points au hasard dans l'amas et l'éparse. */
function requetes(d: StudioDocument, n = 400): RequeteAccrochage[] {
  const h = alea(11);
  const out: RequeteAccrochage[] = [];
  for (const o of d.objects) if (o.id.startsWith("tv") && o.type === "line") out.push({ curseur: { x: o.start.x + 0.01, y: o.start.y + 0.01 }, tolerance: 0.25, base: null });
  for (const o of d.objects) if (o.id.startsWith("s") && !o.id.endsWith("-bis") && o.type === "line") out.push({ curseur: { ...o.start }, tolerance: 0.25, base: null }, { curseur: { x: o.start.x + 1, y: o.start.y + 0.01 }, tolerance: 0.25, base: { x: o.start.x, y: o.start.y + 5 } });
  for (let i = 0; i < n; i++) out.push({ curseur: { x: r3(h() * 10), y: r3(h() * 10) }, tolerance: 0.15, base: i % 3 === 0 ? { x: 5, y: 5 } : null });
  for (let i = 0; i < n / 4; i++) out.push({ curseur: { x: r3(20 + h() * 180), y: r3(20 + h() * 180) }, tolerance: 2, base: null });
  out.push({ curseur: { x: 503, y: 0.1 }, tolerance: 0.3, base: null });
  return out;
}
const sansFonction = (x: unknown) => JSON.parse(JSON.stringify(x));
const tracer = (idx: IndexAccrochage, qs: readonly RequeteAccrochage[]) => qs.map((q) => sansFonction({ candidats: candidatsObjets(idx, q, reglages), resolution: resoudreTrace(idx, q, reglages) }));

describe("AC-004 — index accéléré = algorithme de référence, avec traces des cas ambigus (lot G2)", () => {
  it("AC-004 [+] corpus superposé / densités variables / intersections / références liées : mêmes cibles et mêmes points que la référence, mêmes traces d'ambiguïté (grille, puis index incrémental après insertions et suppressions)", () => {
    const d = corpus();
    expect(d.objects.length).toBeGreaterThanOrEqual(1000);
    const qs = requetes(d);
    const reference = tracer(indexLineaire(accrochables(d)), qs);
    // Le corpus comporte vraiment des cas ambigus tracés (doublons, côté confondu) et des intersections.
    const ambigus = reference.filter((r) => r.resolution.ambiguite);
    expect(ambigus.length).toBeGreaterThan(20);
    expect(ambigus.some((r) => r.resolution.ambiguite.candidats.some((c: { objets: string[] }) => c.objets.some((o) => o.endsWith("-bis"))))).toBe(true);
    expect(reference.some((r) => r.candidats.some((c: { genre: string }) => c.genre === "intersection"))).toBe(true);
    expect(new Set(ambigus.map((r) => r.resolution.ambiguite.regle))).toEqual(new Set(["ordre-document", "mode"]));
    // Index en grille (au-dessus du seuil) : identique, traces comprises.
    expect(tracer(indexAccrochage(accrochables(d)), qs)).toEqual(reference);
    // Index incrémental mené à travers des insertions et des suppressions, puis comparé sur le document atteint.
    const suivi = suiviAccrochage(0);
    suivi.indexer(accrochables(d));
    const moins = applyStudioCommands(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["s0-bis", "d3", "e2", "c1"] } }]);
    suivi.indexer(accrochables(moins));
    const plus = applyStudioCommands(moins, [
      { toolId: "studio.dessin.ligne", params: { id: "s0-ter", type: "line", start: { x: 300, y: 300 }, end: { x: 302, y: 300 } } },
      { toolId: "studio.dessin.ligne", params: { id: "n1", type: "line", start: { x: 1, y: 1 }, end: { x: 9, y: 9 } } },
    ]);
    const idx = suivi.indexer(accrochables(plus));
    expect(suivi.dernierBilan?.inseres).toBeGreaterThan(0);
    const qs2 = requetes(plus);
    expect(tracer(idx, qs2)).toEqual(tracer(indexLineaire(accrochables(plus)), qs2));
    // Désignation au point (sélection) : index de sélection = parcours linéaire, ambiguïtés comprises (cotes liées incluses).
    const points = qs.map((q) => q.curseur);
    const lin = points.map((p) => designationAuPointLineaire(plus, p, 0.05));
    expect(points.map((p) => designationAuPoint(plus, p, 0.05, 0))).toEqual(lin);
    expect(lin.filter((t) => t.ambigus.length > 1).length).toBeGreaterThan(10);
  });

  it("AC-004 [+] cas ambigu tracé puis résolu explicitement : la candidate suivante devient le point posé ; la désignation passe à l'objet superposé suivant", () => {
    const d = corpus(commandesCorpus(200));
    const idx = indexAccrochage(accrochables(d), 0);
    const q: RequeteAccrochage = { curseur: { x: 300, y: 300 }, tolerance: 0.25, base: null };
    const r0 = resoudreTrace(idx, q, reglages);
    expect(r0.ambiguite).not.toBeNull();
    // Extrémités confondues (doublon, coin du rectangle) puis intersections au même point, toutes à distance nulle.
    expect(r0.ambiguite!.candidats.map((c) => c.objets.join("+")).slice(0, 3)).toEqual(["s0", "s0-bis", "q0"]);
    expect(r0.ambiguite!.candidats.slice(3).every((c) => c.genre === "intersection")).toBe(true);
    expect(r0.ambiguite!.regle).toBe("ordre-document");
    expect(r0.repere!.ancre).toMatchObject({ objectId: "s0", anchor: "start" });
    const r1 = resoudreTrace(idx, q, reglages, { cle: r0.ambiguite!.cle, rang: 1 });
    expect(r1).toMatchObject({ choix: 1, repere: { ancre: { objectId: "s0-bis" } } });
    expect(resoudreTrace(idx, q, reglages, { cle: r0.ambiguite!.cle, rang: r0.ambiguite!.candidats.length }).repere!.ancre!.objectId).toBe("s0");
    // Un choix d'un autre cas n'est jamais appliqué en silence.
    expect(resoudreTrace(idx, q, reglages, { cle: "autre-cas", rang: 1 }).repere!.ancre!.objectId).toBe("s0");
    // Désignation : doublon exact et côté confondu sous le clic — le dernier dessiné d'abord, puis cycle explicite.
    const t = designationAuPoint(d, { x: 301, y: 300 }, 0.05, 0);
    expect(t.ambigus).toEqual(["q0", "s0-bis", "s0"]);
    expect(designationSuivante(t, "q0")).toBe("s0-bis");
    expect(designationSuivante(t, "s0")).toBe("q0");
    expect(designationSuivante(designationAuPoint(d, { x: 5000, y: 5000 }, 0.05, 0), undefined)).toBeNull();
  });

  it("AC-004 [−] un index qui choisit une autre cible après insertion / suppression fait échouer le critère, malgré un gain de p95", () => {
    const d = corpus();
    const qs = requetes(d, 60);
    // Index fautif : il « perd » la dernière forme insérée (doublon en tête) — plus rapide, mais faux.
    const fautif = (doc: StudioDocument): IndexAccrochage => {
      const vrai = indexAccrochage(accrochables(doc), 0);
      return { taille: vrai.taille, formes: (z) => vrai.formes(z).filter((f) => f.forme.id !== "s0") };
    };
    let horloge = 0, appel = 0;
    const ev = studioEvaluerOptimisation({
      reference: (doc: StudioDocument) => tracer(indexLineaire(accrochables(doc)), qs),
      optimisee: (doc: StudioDocument) => tracer(fautif(doc), qs),
      corpus: [{ nom: "corpus AC-004", entree: d }],
      criteres: [{ nom: "cibles d'accrochage", extraire: (r) => r, tolerance: { type: "exacte" } }],
      repetitions: 3,
      // Horloge injectée : la référence « dure » 10, l'optimisée 1 — le gain de p95 est réel et ne sauve rien.
      maintenant: () => (horloge += appel++ % 4 < 2 ? 5 : 0.5),
    });
    expect(ev.p95.gain).toBeGreaterThan(0);
    expect(ev.verdict).toBe("rejetee");
    expect(ev.motifs).toContain("« cibles d'accrochage » hors tolérance sur 1 cas");
  });
});

// ——— MES-05 ———

const META = { studyName: "Étude", variantName: "Variante", timestamp: "2026-10-26T00:00:00" };
interface Entree { base: StudioDocument; lot: StudioCommand[]; requetes: RequeteAccrochage[] }
interface Resultat { cibles: unknown; picking: unknown; dimensions: unknown; quantites: unknown; historique: unknown; exports: unknown }

function entreesMes05(): { nom: string; entree: Entree }[] {
  const tout = commandesCorpus(1100);
  // Base : le corpus ; lot : les 30 dernières commandes (cotes liées, murs, cercles), jouées pas à pas.
  const base = applyStudioCommands(newStudioDocument("mes05"), tout.slice(0, -30));
  const lot = tout.slice(-30);
  const fin = applyStudioCommands(base, lot);
  return [{ nom: "corpus AC-004 (1 100 formes et plus)", entree: { base, lot, requetes: requetes(fin, 120) } }];
}

const empreinte = (d: StudioDocument) => JSON.stringify(d);
function mesurer(final: StudioDocument, idx: IndexAccrochage, designer: (d: StudioDocument, p: { x: number; y: number }) => unknown, historique: string[], maillage: unknown, e: Entree): Resultat {
  return {
    cibles: tracer(idx, e.requetes),
    picking: e.requetes.map((q) => designer(final, q.curseur)),
    dimensions: (final.dimensions ?? []).map((c) => [c.id, measureStudioDimension(final, c.id)?.value ?? null]),
    quantites: sansFonction({ q: quantitesStudio(final), maillage }),
    historique,
    exports: { svg: exportStudioSvg(final), dxf: exportStudioDxf(final), ifc: exportStudioIfc(final, META) },
  };
}

/** Chemin de référence : documents recalculés d'un bloc, parcours linéaire, maillage direct. */
function reference(e: Entree): Resultat {
  const etapes = e.lot.map((_, k) => applyStudioCommands(e.base, e.lot.slice(0, k + 1)));
  const final = etapes[etapes.length - 1]!;
  // Historique : annuler jusqu'à la base, puis tout rétablir (les documents atteints, dans l'ordre).
  const historique = [...[...etapes].reverse().slice(1).map(empreinte), empreinte(validateStudioDocument(e.base)), ...etapes.map(empreinte)];
  return mesurer(final, indexLineaire(accrochables(final)), (d, p) => designationAuPointLineaire(d, p, 0.05), historique, studioMesh3d(final), e);
}

/** Chemins optimisés du client : brouillon à instantanés, index incrémental, désignation indexée, maillage incrémental. */
function optimise(e: Entree): Resultat {
  const suivi = suiviAccrochage(0);
  let b = creerBrouillon(e.base);
  suivi.indexer(accrochables(e.base));
  let cache = studioMesh3dIncremental(e.base, null).cache;
  for (const c of e.lot) {
    b = appliquerBrouillon(b, [c]);
    const d = documentBrouillon(b);
    suivi.indexer(accrochables(d));
    cache = studioMesh3dIncremental(d, cache).cache;
  }
  const final = documentBrouillon(b);
  const historique: string[] = [];
  let x = b;
  while (peutAnnuler(x)) { x = annulerBrouillon(x); historique.push(empreinte(documentBrouillon(x))); }
  for (let i = 0; i < e.lot.length; i++) { x = retablirBrouillon(x); historique.push(empreinte(documentBrouillon(x))); }
  return mesurer(final, suivi.indexer(accrochables(final)), (d, p) => designationAuPoint(d, p, 0.05, 0), historique, studioMesh3dIncremental(final, cache).mesh, e);
}

const CRITERES: StudioCritereOptimisation<Resultat>[] = [
  { nom: "cibles d'accrochage", extraire: (r) => r.cibles, tolerance: { type: "exacte" } },
  { nom: "désignation (picking)", extraire: (r) => r.picking, tolerance: { type: "exacte" } },
  { nom: "dimensions", extraire: (r) => r.dimensions, tolerance: { type: "absolue", valeur: 0 } },
  { nom: "quantités", extraire: (r) => r.quantites, tolerance: { type: "absolue", valeur: 0 } },
  { nom: "historique", extraire: (r) => r.historique, tolerance: { type: "exacte" } },
  { nom: "exports", extraire: (r) => r.exports, tolerance: { type: "exacte" } },
];

describe("MES-05 — comparaison simultanée avant / après optimisation (lot G2)", () => {
  it("MES-05 [+] cibles d'accrochage, désignation, dimensions, quantités, historique et exports comparés ensemble : tous identiques à la référence, p95 relevé sans seuil", () => {
    const ev = studioEvaluerOptimisation({ reference, optimisee: optimise, corpus: entreesMes05(), criteres: CRITERES, repetitions: 1 });
    expect(ev.criteres.map((c) => [c.nom, c.conformes, c.ecarts])).toEqual(CRITERES.map((c) => [c.nom, 1, []]));
    expect(ev.verdict).not.toBe("rejetee");
    expect(Number.isFinite(ev.p95.reference) && Number.isFinite(ev.p95.optimisee)).toBe(true);
    // Les six résultats sont réellement non vides (rien n'est comparé à vide).
    const r = reference(entreesMes05()[0]!.entree);
    expect((r.cibles as unknown[]).length).toBeGreaterThan(100);
    expect((r.dimensions as unknown[]).length).toBeGreaterThan(10);
    expect((r.historique as unknown[]).length).toBe(60);
    expect((r.exports as { ifc: string }).ifc).toContain("IFCWALL");
  });

  it("MES-05 [−] un chemin optimisé qui ne dérive qu'un seul résultat (export décalé, ou historique tronqué) est rejeté sur ce critère seulement", () => {
    const corpusMes = entreesMes05();
    const exportFaux = studioEvaluerOptimisation({ reference, optimisee: (e) => { const r = optimise(e); return { ...r, exports: { ...(r.exports as object), svg: `${(r.exports as { svg: string }).svg} ` } }; }, corpus: corpusMes, criteres: CRITERES, repetitions: 1 });
    expect(exportFaux.verdict).toBe("rejetee");
    expect(exportFaux.criteres.filter((c) => c.ecarts.length).map((c) => c.nom)).toEqual(["exports"]);
    const historiqueFaux = studioEvaluerOptimisation({ reference, optimisee: (e) => { const r = optimise(e); return { ...r, historique: (r.historique as string[]).slice(1) }; }, corpus: corpusMes, criteres: CRITERES, repetitions: 1 });
    expect(historiqueFaux.criteres.filter((c) => c.ecarts.length).map((c) => c.nom)).toEqual(["historique"]);
  });
});
