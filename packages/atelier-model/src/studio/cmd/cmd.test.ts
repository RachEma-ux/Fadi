import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { studioMesh3d } from "../mesh-3d.js";
import { studioMesh3dIncremental } from "../projections.js";
import { quantitesStudio } from "../quantites.js";
import { exportStudioDxf } from "../export.js";
import type { StudioOpening, StudioWall } from "../architecture/types.js";
import { studioEffetsCommande, studioRelations, STUDIO_DOMAINES_DERIVES } from "./effets.js";
import {
  studioDomainesPerimes, studioEtatDeriveCoherent, studioEtatDeriveContenu, studioEtatDeriveInitial, studioEtatsDomainesInitiaux, studioInvaliderDomaines, studioLibelleEtatDerive,
  studioTransitionDerive, type StudioEtatDerive,
} from "./etats-derives.js";
import { studioEvaluerOptimisation, studioP95 } from "./optimisation.js";
import { studioHorsPerimetre } from "./perimetre.js";
import { studioAccepterResultatEssai } from "./essai.js";

const avec = (d: StudioDocument, ...c: StudioCommand[]) => applyStudioCommands(d, c);
const mur = (id: string, y: number, over: Partial<StudioWall> = {}): StudioWall => ({ id, type: "wall", axis: [{ x: 0, y }, { x: 6, y }], thickness: 0.2, height: 3, base: 0, justification: "center", ...over });
const ouverture = (id: string, hostId: string, position: number): StudioOpening => ({ id, type: "opening", hostId, position, width: 1, height: 2.1, sill: 0 });
const modele = (): StudioDocument => avec(newStudioDocument("doc"),
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: -2 }, end: { x: 5, y: -2 } } },
  { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: -2 }, end: { x: 5, y: -2 }, offset: 1, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.architecture.mur", params: mur("m1", 4) },
  { toolId: "studio.architecture.ouverture", params: ouverture("o1", "m1", 1) },
  { toolId: "studio.architecture.ouverture", params: ouverture("o2", "m1", 4) },
  { toolId: "studio.propriete.definir", params: { cibleId: "m1", nom: "Résistance au feu", valeur: "EI 60", source: "essai" } },
);
const meta = (r: string) => ({ revisionBase: "R12", revisionSortie: r, source: "authenticated-session", auteurId: "u1", requestId: "q1" });

describe("TR-EX-010 — événement d'effets d'une commande acceptée", () => {
  it("EX-010 [+] : créer, modifier, supprimer — identifiants, relations, domaines dérivés, révision et origine cohérents", () => {
    const d = modele();
    const cmds: StudioCommand[] = [
      { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 8, y: 0 }, width: 2, height: 1 } },
      { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 0, dy: 1 } },
    ];
    const e = studioEffetsCommande(d, avec(d, ...cmds), cmds, meta("R13"));
    expect(e.crees).toEqual(["r1"]);
    expect(e.modifies).toContain("l1");
    expect(e.supprimes).toEqual([]);
    expect(e.revisionBase).toBe("R12");
    expect(e.revisionSortie).toBe("R13");
    expect(e.origine).toEqual({ source: "authenticated-session", auteurId: "u1", requestId: "q1", outils: ["studio.dessin.rectangle", "studio.dessin.deplacer"] });
    expect(e.domainesInvalides).toEqual(["plan-2d", "maillage-3d", "quantites", "exports", "publications"]);
    // Une cote seule modifiée n'invalide ni la vue 3D ni le métré.
    const c: StudioCommand[] = [{ toolId: "studio.dessin.modifier", params: { id: "c1", type: "dimension", start: { x: 0, y: -2 }, end: { x: 5, y: -2 }, offset: 2, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false } }];
    const ec = studioEffetsCommande(d, avec(d, ...c), c, meta("R13"));
    expect(ec.modifies).toEqual(["c1"]);
    expect(ec.domainesInvalides).toEqual(["plan-2d", "exports", "publications"]);
  });

  it("EX-010 [+] : références et contraintes modifiées — cote rendue « à résoudre » par la suppression de son objet lié", () => {
    const d = modele();
    const c: StudioCommand[] = [{ toolId: "studio.dessin.supprimer", params: { ids: ["l1"] } }];
    const apres = avec(d, ...c);
    const e = studioEffetsCommande(d, apres, c, meta("R13"));
    expect(e.supprimes).toContain("l1");
    expect(e.references.retirees.filter((r) => r.nature === "cote-liee").map((r) => `${r.de}→${r.vers}`)).toEqual(["c1→l1"]);
    expect(e.contraintes).toEqual([{ id: "c1", contrainte: "a-resoudre", avant: false, apres: true }]);
  });

  it("EX-010 [−] : suppression d'hôte avec dépendants — chaque ouverture et chaque relation rompue décrites, publications invalidées", () => {
    const d = modele();
    const c: StudioCommand[] = [{ toolId: "studio.architecture.supprimer", params: { ids: ["m1"], cascade: true } }];
    const e = studioEffetsCommande(d, avec(d, ...c), c, meta("R13"));
    expect(e.supprimes).toEqual(expect.arrayContaining(["m1", "o1", "o2", "m1#Résistance au feu"]));
    expect(e.references.retirees.filter((r) => r.nature === "hote").map((r) => r.de).sort()).toEqual(["o1", "o2"]);
    expect(e.references.retirees.some((r) => r.nature === "propriete" && r.vers === "m1")).toBe(true);
    expect(e.domainesInvalides).toContain("publications");
    // Sans cascade, le modèle refuse : aucune acceptation silencieuse.
    expect(() => avec(d, { toolId: "studio.architecture.supprimer", params: { ids: ["m1"], cascade: false } })).toThrow(/ouverture/);
  });

  it("relations du document : cote liée, hôte, propriété", () => {
    expect(studioRelations(modele()).map((r) => `${r.nature}:${r.de}→${r.vers}`)).toEqual(["cote-liee:c1→l1", "propriete:m1#Résistance au feu→m1", "hote:o1→m1", "hote:o2→m1"]);
  });
});

describe("TR-EX-016 — états des contenus dérivés", () => {
  it("EX-016 [+] : source R12 → R13 : à recalculer, en calcul, puis à jour R13 ou échec explicite", () => {
    let e: StudioEtatDerive = studioTransitionDerive(studioEtatDeriveInitial("R12"), { type: "resultat", revision: "R12", ok: true }).etat;
    expect(e).toEqual({ etat: "a-jour", revision: "R12", image: "R12", motif: null });
    e = studioTransitionDerive(e, { type: "source", revision: "R13" }).etat;
    expect(e.etat).toBe("a-recalculer");
    expect(studioLibelleEtatDerive(e)).toBe("À recalculer");
    e = studioTransitionDerive(e, { type: "debut", revision: "R13" }).etat;
    expect(studioLibelleEtatDerive(e)).toBe("En calcul");
    const ok = studioTransitionDerive(e, { type: "resultat", revision: "R13", ok: true }).etat;
    expect(studioLibelleEtatDerive(ok)).toBe("À jour pour la révision R13");
    const echec = studioTransitionDerive(e, { type: "resultat", revision: "R13", ok: false, motif: "noyau indisponible" }).etat;
    expect(echec).toEqual({ etat: "echec", revision: "R13", image: "R12", motif: "noyau indisponible" });
    expect(studioLibelleEtatDerive(echec)).toBe("Échec du calcul : noyau indisponible");
    expect(studioEtatDeriveCoherent(echec, "R13")).toBe(true);
    const na = studioTransitionDerive(e, { type: "non-applicable", motif: "aucun volume" }).etat;
    expect(studioLibelleEtatDerive(na)).toBe("Non applicable : aucun volume");
  });

  it("EX-016 [−] : ancienne image R12 présentée « à jour R13 » après échec — l'oracle rejette ce statut", () => {
    const faux: StudioEtatDerive = { etat: "a-jour", revision: "R13", image: "R12", motif: null };
    expect(studioEtatDeriveCoherent(faux, "R13")).toBe(false);
    expect(studioEtatDeriveCoherent({ etat: "a-jour", revision: "R12", image: "R12", motif: null }, "R13")).toBe(false);
    expect(studioEtatDeriveCoherent({ etat: "a-jour", revision: "R13", image: "R13", motif: null }, "R13")).toBe(true);
  });

  it("INV-006 : un résultat calculé sur R12 arrivé quand R13 est courante est ignoré, il n'écrase pas l'état courant", () => {
    const e = studioTransitionDerive(studioEtatDeriveInitial("R12"), { type: "source", revision: "R13" }).etat;
    const t = studioTransitionDerive(e, { type: "resultat", revision: "R12", ok: true });
    expect(t.ignore).toBe("autre-revision");
    expect(t.etat).toBe(e);
  });

  it("EX-051 : domaines périmés après une commande — seuls les domaines invalidés par l'effet passent « à recalculer »", () => {
    const etats = studioInvaliderDomaines(studioEtatsDomainesInitiaux("R12"), "R13", ["plan-2d", "exports"]);
    expect(studioDomainesPerimes(etats)).toEqual(["plan-2d", "exports"]);
    expect(etats["maillage-3d"]).toEqual({ etat: "a-jour", revision: "R13", image: "R13", motif: null });
    expect(STUDIO_DOMAINES_DERIVES.every((d) => studioEtatDeriveCoherent(etats[d], "R13"))).toBe(true);
  });

  it("EX-016 : état d'un contenu affiché par un panneau — les cinq états, toujours cohérents avec la révision courante", () => {
    const base = { revision: "R13", image: "R12", enCours: false, echec: null, nonApplicable: null };
    const etats = [
      studioEtatDeriveContenu({ ...base, image: "R13" }),
      studioEtatDeriveContenu(base),
      studioEtatDeriveContenu({ ...base, enCours: true }),
      studioEtatDeriveContenu({ ...base, echec: "vue illisible" }),
      studioEtatDeriveContenu({ ...base, nonApplicable: "aucun objet" }),
    ];
    expect(etats.map((e) => e.etat)).toEqual(["a-jour", "a-recalculer", "en-calcul", "echec", "non-applicable"]);
    expect(etats.every((e) => studioEtatDeriveCoherent(e, "R13"))).toBe(true);
    // Échec du calcul de la révision courante : l'image n'est jamais la révision courante (aucune image « à jour »).
    expect(studioEtatDeriveContenu({ ...base, image: "R13", echec: "délai dépassé" })).toEqual({ etat: "echec", revision: "R13", image: null, motif: "délai dépassé" });
    // Un résultat de la révision courante prime sur un calcul en cours ; sans résultat, « à recalculer » (jamais « à jour »).
    expect(studioEtatDeriveContenu({ ...base, image: "R13", enCours: true }).etat).toBe("a-jour");
    expect(studioEtatDeriveContenu({ ...base, image: null }).etat).toBe("a-recalculer");
  });
});

describe("TR-EX-045 — essai à portée de révision", () => {
  it("EX-045 [−] : résultat d'essai R12 reçu après R13, essai abandonné : refusés sans effet", () => {
    expect(studioAccepterResultatEssai("R12", { essaiId: "e", baseRevisionId: "R12", statut: "termine" })).toEqual({ accepte: true });
    expect(studioAccepterResultatEssai("R13", { essaiId: "e", baseRevisionId: "R12", statut: "termine" })).toMatchObject({ accepte: false, motif: "autre-revision" });
    expect(studioAccepterResultatEssai("R12", { essaiId: "e", baseRevisionId: "R12", statut: "abandonne" })).toMatchObject({ accepte: false, motif: "abandonne" });
  });
});

describe("TR-INV-007 — évaluation conjointe performance p95 et résultats métier", () => {
  const corpus = Array.from({ length: 4 }, (_, i) => ({ nom: `doc-${i}`, entree: avec(modele(), { toolId: "studio.architecture.mur", params: mur(`m${i + 10}`, 10 + i, { height: 2 + i }) }) }));
  const criteres = [
    { nom: "objets maillés", extraire: (m: ReturnType<typeof studioMesh3d>) => ({ solides: m.solids.length, contours: m.outlines.length, masques: m.hidden }), tolerance: { type: "exacte" as const } },
    { nom: "géométrie", extraire: (m: ReturnType<typeof studioMesh3d>) => m, tolerance: { type: "absolue" as const, valeur: 1e-9 } },
  ];
  it("INV-007 [+] : optimisation (maillage incrémental) comparée en p95 ET en résultats métier — préservée dans la tolérance", () => {
    const r = studioEvaluerOptimisation({ reference: (d: StudioDocument) => studioMesh3d(d), optimisee: (d: StudioDocument) => studioMesh3dIncremental(d, null).mesh, corpus, criteres, repetitions: 3 });
    expect(r.criteres.every((c) => c.ecarts.length === 0)).toBe(true);
    expect(Number.isFinite(r.p95.reference) && Number.isFinite(r.p95.optimisee)).toBe(true);
    expect(["acceptee", "sans-gain"]).toContain(r.verdict);
  });
  it("INV-007 [−] : gain de p95 avec un résultat hors tolérance (volume différent) — optimisation rejetée", () => {
    let t = 0;
    const horloge = () => (t += 1);
    // « Optimisation » qui arrondit la hauteur des murs : volume différent de 1 cm.
    const rapideFaussee = (d: StudioDocument) => studioMesh3d(avec(d, { toolId: "studio.architecture.modifier", params: mur("m1", 4, { height: 3.01 }) }));
    const r = studioEvaluerOptimisation({ reference: (d: StudioDocument) => studioMesh3d(d), optimisee: rapideFaussee, corpus, criteres, repetitions: 2, maintenant: horloge });
    expect(r.verdict).toBe("rejetee");
    expect(r.motifs.join(" ")).toMatch(/géométrie.*hors tolérance/);
    // Quantités et export : un critère sans tolérance déclarée rejette aussi.
    const sansTol = studioEvaluerOptimisation({ reference: quantitesStudio, optimisee: quantitesStudio, corpus, criteres: [{ nom: "quantités", extraire: (q) => q }], repetitions: 1 });
    expect(sansTol.verdict).toBe("rejetee");
    const exp = studioEvaluerOptimisation({ reference: exportStudioDxf, optimisee: (d: StudioDocument) => exportStudioDxf(d).replace("ENTITIES", "ENTITIES\n"), corpus, criteres: [{ nom: "export", extraire: (x) => x, tolerance: { type: "exacte" } }], repetitions: 1 });
    expect(exp.verdict).toBe("rejetee");
    expect(studioP95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100])).toBe(19);
  });
});

describe("TR-EX-002 — périmètre explicitement exclu", () => {
  it("EX-002 [−] : demande de comptabilité ou de gestion RH refusée par un motif nommé « hors-perimetre »", () => {
    expect(studioHorsPerimetre("studio.comptabilite.facture")).toMatchObject({ code: "hors-perimetre", domaine: "comptabilite" });
    expect(studioHorsPerimetre("studio.rh.conges")).toMatchObject({ code: "hors-perimetre", domaine: "rh" });
    expect(studioHorsPerimetre("studio.chantier.reserves")?.code).toBe("hors-perimetre");
    expect(studioHorsPerimetre("studio.architecture.mur")).toBeNull();
    expect(studioHorsPerimetre("studio.dessin.ligne")).toBeNull();
  });
});
