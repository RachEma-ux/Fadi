import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyStudioCommands, newStudioDocument, STUDIO_TOOLS, studioMesh3d, type StudioCommand, type StudioDocument, type StudioSurfaceLibre } from "@parcours/atelier-model";
import { cibleRaccourci, OUTILS_MODES, OUTILS_VOLUME_LIBRE, RACCOURCIS_RESERVES } from "../planche2d/raccourcis";
import { ALTERNATIVES_GESTES } from "../planche2d/alternatives-gestes";
import { moteursDeOutil } from "../chargement/moteurs";
import { Ordonnanceur } from "../taches/ordonnanceur";
import { NoyauExactStudio } from "../exact/client-exact";
import { FauxWorker, type CompteurFaux } from "../exact/faux-worker";
import {
  demandeEpaississement, engagementEpaississement, etatApresEpaississement, etatCourantEpaississement, MESSAGES_EPAISSISSEMENT, tacheEpaississement,
} from "../exact/epaississement-session";
import { commandeModifierPole, commandeModifierSommet, commandeSubdivision, commandeSurfacePlane, descriptionSubdivision, descriptionSurface, lireMaillageControle, SURFACE_VIDE, valeursPole, valeursSommet } from "./surfaces-ui";
import { demandeSolidification, engagementSolidification, etatApresSolidification, tacheSolidification } from "../exact/solidification-session";
import { PanneauSubdivisions } from "./PanneauSubdivisions";
import { entreesLibres } from "./entrees-scene";
import { solidesDesignables } from "./designation";
import { PanneauSurfaces } from "./PanneauSurfaces";
import { Vue3DStudio } from "./Vue3DStudio";
import en from "../../../lib/i18n/en.json";

/**
 * X.1-05 — surfaces libres NURBS dans l'interface de Studio : formulaires purs (grille de pôles, pôle modifié),
 * épaississement exact de bout en bout sur l'ordonnanceur réel et un faux Worker (résultat SYNTHÉTIQUE, forme du
 * contrat seulement : le vrai noyau est testé par `@parcours/geometry-exact` et l'API), panneaux, rendu des pôles,
 * règle d'or (icône, barre, raccourci, alternative clavier).
 */

const nombre = (v: number) => String(v);
const ok = (r: { commandes: StudioCommand[] } | { erreur: string }): StudioCommand[] => { if ("erreur" in r) throw new Error(r.erreur); return r.commandes; };
const grille = { x: 1, y: 2, z: 0.5, largeur: 4, profondeur: 2, lignes: 3, colonnes: 2, degreU: 2, degreV: 1 };
const avecSurface = (): StudioDocument => applyStudioCommands(newStudioDocument("ui"), ok(commandeSurfacePlane(grille, "S")));

describe("X.1-05 — formulaires des surfaces libres (purs)", () => {
  it("X.1-05 interface : Surface NURBS — grille plane de pôles saisie (normale +z), champs vides refusés, aucune valeur proposée", () => {
    expect(Object.values(SURFACE_VIDE).every((v) => Number.isNaN(v))).toBe(true);
    expect(commandeSurfacePlane(SURFACE_VIDE, "S")).toEqual({ erreur: "Saisissez l’origine, les dimensions, les nombres de pôles et les degrés : aucune valeur n’est proposée." });
    expect(commandeSurfacePlane({ ...grille, largeur: 0 }, "S")).toEqual({ erreur: "La largeur et la profondeur doivent être strictement positives." });
    expect(commandeSurfacePlane({ ...grille, lignes: 1 }, "S")).toEqual({ erreur: "Les nombres de pôles sont des entiers de 2 à 64." });
    expect(commandeSurfacePlane({ ...grille, degreU: 3 }, "S")).toMatchObject({ erreur: expect.stringMatching(/^Le degré d’un sens/) });
    const [c] = ok(commandeSurfacePlane(grille, "S", "default"));
    const s = c!.params as StudioSurfaceLibre;
    expect(c!.toolId).toBe("studio.surface.nurbs");
    expect(s).toMatchObject({ id: "S", type: "surface-libre", degreU: 2, degreV: 1, lignes: 3, colonnes: 2 });
    expect(s).not.toHaveProperty("layerId");
    expect(s).not.toHaveProperty("poids");
    expect(s.controle).toEqual([{ x: 1, y: 2, z: 0.5 }, { x: 1, y: 4, z: 0.5 }, { x: 3, y: 2, z: 0.5 }, { x: 3, y: 4, z: 0.5 }, { x: 5, y: 2, z: 0.5 }, { x: 5, y: 4, z: 0.5 }]);
    const d = applyStudioCommands(newStudioDocument("ui"), [c!]);
    // Normale +z : la nappe plane de 4 × 2 m est au-dessus du plan z = 0,5 une fois épaissie « le long de la normale ».
    const m = studioMesh3d(d).surfaces![0]!;
    const [a, b, cc] = m.triangles[0]!.map((i) => m.vertices[i]!);
    expect((b!.x - a!.x) * (cc!.y - a!.y) - (b!.y - a!.y) * (cc!.x - a!.x)).toBeGreaterThan(0);
    expect(descriptionSurface(d.surfaces![0]!, nombre)).toBe("Surface NURBS 3 × 2 pôles, degrés 2 × 1, non rationnelle · aire approchée 8 m²");
  });

  it("X.1-05 interface : Modifier la surface — le pôle choisi reprend ses valeurs, position et poids saisis, même identité ; refus nommés", () => {
    const d = avecSurface(), s = d.surfaces![0]!;
    expect(valeursPole(s, 1, 0)).toEqual({ i: 1, j: 0, x: 3, y: 2, z: 0.5, poids: 1 });
    expect(commandeModifierPole(null, valeursPole(s, 1, 0))).toEqual({ erreur: "Sélectionnez d’abord la surface à modifier." });
    expect(commandeModifierPole(s, { ...valeursPole(s, 1, 0), i: 3 })).toEqual({ erreur: "Choisissez le pôle à modifier (ligne et colonne)." });
    expect(commandeModifierPole(s, { ...valeursPole(s, 1, 0), z: Number.NaN })).toEqual({ erreur: "Saisissez la position (x, y, z) et le poids du pôle." });
    expect(commandeModifierPole(s, { ...valeursPole(s, 1, 0), poids: 0 })).toEqual({ erreur: "Le poids d’un pôle est strictement positif." });
    // Même poids (1) : aucun tableau de poids n'est créé ; poids changé : un tableau, les autres à 1.
    const sansPoids = ok(commandeModifierPole(s, { ...valeursPole(s, 1, 0), z: 1.5 }))[0]!.params as StudioSurfaceLibre;
    expect(sansPoids).not.toHaveProperty("poids");
    const cs = ok(commandeModifierPole(s, { ...valeursPole(s, 1, 0), z: 1.5, poids: 2 }));
    expect(cs[0]!.toolId).toBe("studio.surface.modifier");
    const m = applyStudioCommands(d, cs).surfaces![0]!;
    expect(m.id).toBe("S");
    expect(m.controle[2]).toEqual({ x: 3, y: 2, z: 1.5 });
    expect(m.controle.filter((_, k) => k !== 2)).toEqual(s.controle.filter((_, k) => k !== 2));
    expect(m.poids).toEqual([1, 1, 2, 1, 1, 1]);
    expect(descriptionSurface(m, nombre)).toMatch(/, rationnelle · /);
  });
});

function banc(mode = { silence: false }) {
  const compteur: CompteurFaux = { crees: 0, arretes: 0, vivants: [] };
  const vus: unknown[] = [];
  const tetra = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
  const noyau = new NoyauExactStudio({
    creerWorker: () => new FauxWorker((d) => {
      if (d.nature === "charger") return { pret: true };
      vus.push(d.op);
      return mode.silence ? "silence" : { brep: "U1lOVEhFVElRVUU=", maillage: tetra, volume: 0.8, aire: 16.4, faces: 6, solides: 1, moteur: "occt-wasm", versionMoteur: "5.6.1", empreinte: "0123456789abcdef" };
    }, compteur),
  });
  const ord = new Ordonnanceur({ concurrence: 1, reprisesMax: 0, delaiMs: 60_000, executer: ({ charge, signal, delaiMs }) => noyau.executer((charge as { entrees: unknown }).entrees, { signal, delaiMs }) });
  return { ord, vus, compteur };
}

describe("X.1-05 — épaississement exact dans l'interface (ordonnanceur réel, faux Worker)", () => {
  it("X.1-05 interface : épaississement de bout en bout — capture, tâche « nurbs » au Worker, résultat, engagement de la commande ; surface conservée", async () => {
    const d = avecSurface();
    expect(demandeEpaississement(d, "1", { surface: "S", epaisseur: Number.NaN, sens: "normale" }, "E")).toMatchObject({ ok: false, message: expect.stringMatching(/Saisissez l’épaisseur/) });
    expect(demandeEpaississement(d, "1", { surface: "S", epaisseur: 0.2, sens: "" }, "E")).toMatchObject({ ok: false, message: expect.stringMatching(/Choisissez le côté/) });
    const r = demandeEpaississement(d, "1", { surface: "S", epaisseur: 0.2, sens: "inverse" }, "E");
    if (!r.ok) throw new Error(r.message);
    const t = tacheEpaississement(r.demande);
    expect(t).toMatchObject({ cle: "studio.exact.epaississement", classe: "interactive", nature: "epaississement", empreinte: { revision: "1" } });
    const { ord, vus } = banc();
    const e = etatApresEpaississement(r.demande, await ord.soumettre(t).issue, "1");
    expect(vus).toEqual([{ type: "nurbs", nurbs: { degreU: 2, degreV: 1, lignes: 3, colonnes: 2, controle: d.surfaces![0]!.controle }, epaisseur: -0.2 }]);
    expect(e).toMatchObject({ etape: "pret", resultat: { volume: 0.8 } });
    const eng = engagementEpaississement(e, { doc: d, revision: "1", modifiable: true });
    if (!eng.ok) throw new Error(eng.message);
    expect(eng.commandes[0]).toMatchObject({ toolId: "studio.surface.epaissir", params: { id: "E", surface: "S", epaisseur: 0.2, sens: "inverse" } });
    const apres = applyStudioCommands(d, eng.commandes);
    expect(apres.surfaces).toBeUndefined();
    expect(apres.exacts![0]).toMatchObject({ id: "E", operation: "epaississement", surface: d.surfaces![0] });
  });

  it("X.1-05 interface : résultat périmé (révision ou surface changée), lecture seule, panne du Worker — jamais engagé, document intact", async () => {
    const d = avecSurface();
    const r = demandeEpaississement(d, "1", { surface: "S", epaisseur: 0.2, sens: "normale" }, "E");
    if (!r.ok) throw new Error(r.message);
    const { ord } = banc();
    const e = etatApresEpaississement(r.demande, await ord.soumettre(tacheEpaississement(r.demande)).issue, "2");
    expect(e).toMatchObject({ etape: "perime", message: MESSAGES_EPAISSISSEMENT.perimeRevision });
    expect(engagementEpaississement(e, { doc: d, revision: "2", modifiable: true }).ok).toBe(false);
    const pret = etatApresEpaississement(r.demande, await ord.soumettre(tacheEpaississement(r.demande)).issue, "1");
    expect(etatCourantEpaississement(pret, "2")).toMatchObject({ etape: "perime" });
    const s = d.surfaces![0]!;
    const changee = applyStudioCommands(d, ok(commandeModifierPole(s, { ...valeursPole(s, 0, 0), z: 2 })));
    expect(engagementEpaississement(pret, { doc: changee, revision: "1", modifiable: true })).toMatchObject({ ok: false, etat: { etape: "perime" } });
    expect(engagementEpaississement(pret, { doc: d, revision: "1", modifiable: false })).toMatchObject({ ok: false, message: "Lecture seule : le résultat ne peut pas être engagé." });
    // Panne du Worker : échec annoncé, relance explicite, rien n'est engagé.
    const mode = { silence: true };
    const b = banc(mode);
    const p = b.ord.soumettre(tacheEpaississement(r.demande));
    await new Promise((x) => setTimeout(x, 0));
    b.compteur.vivants[0]!.planter();
    const panne = etatApresEpaississement(r.demande, await p.issue, "1");
    expect(panne).toMatchObject({ etape: "echec", relancer: true });
    expect(engagementEpaississement(panne, { doc: d, revision: "1", modifiable: true })).toMatchObject({ ok: false, message: MESSAGES_EPAISSISSEMENT.aucunResultat });
  });
});

describe("X.1-05 — panneaux, vue 3D et règle d'or", () => {
  it("X.1-05 interface : panneaux — formulaire vide (aucune valeur proposée), pôles de la surface sélectionnée, épaississement sans côté choisi ; lecture seule désactivée", () => {
    const d = avecSurface();
    const props = { doc: d, revision: "1", modifiable: true, selection: null, pole: null, surPole: () => {} };
    const creation = renderToStaticMarkup(createElement(PanneauSurfaces, { ...props, outil: "studio.surface.nurbs" }));
    expect(creation).toContain("data-studio-surface-nurbs");
    for (const n of ["surface-x", "surface-largeur", "surface-lignes", "surface-degre-u"]) expect(creation).toMatch(new RegExp(`name="${n}" value=""`));
    expect(creation).toContain("data-studio-surfaces");
    const sansChoix = renderToStaticMarkup(createElement(PanneauSurfaces, { ...props, outil: "studio.surface.modifier" }));
    expect(sansChoix).toContain("data-studio-surface-indice");
    const edition = renderToStaticMarkup(createElement(PanneauSurfaces, { ...props, outil: "studio.surface.modifier", selection: "S" }));
    expect(edition.match(/<option value="\d,\d">/g)).toHaveLength(6);
    expect(edition).toContain("Ligne 3, colonne 2");
    const epaissir = renderToStaticMarkup(createElement(PanneauSurfaces, { ...props, outil: "studio.surface.epaissir" }));
    expect(epaissir).toContain('<select name="epaissir-sens" required="" data-studio-epaissir-sens="true"><option value="" selected="">Choisir le côté…</option>');
    expect(epaissir).toContain('name="epaissir-epaisseur" value=""');
    const lecture = renderToStaticMarkup(createElement(PanneauSurfaces, { ...props, modifiable: false, outil: "studio.surface.nurbs" }));
    expect(lecture).toMatch(/<fieldset disabled="">/);
    // Vue 3D : le panneau suit l'outil actif.
    expect(renderToStaticMarkup(createElement(Vue3DStudio, { doc: d, outil: "studio.surface.epaissir", modifiable: true }))).toContain("data-studio-epaissir");
  });

  it("X.1-05 vue 3D : nappe à deux faces, désignable ; sélectionnée, son polygone de contrôle et un repère désignable par pôle (userData.pole)", () => {
    const d = avecSurface(), mesh = studioMesh3d(d);
    const lecture = (selection: string | null) => ({ mesh, cle: () => "k", doc: d, mode: "ombre" as never, selection, selectionArchitecture: null, present: () => true });
    const [libre] = entreesLibres(lecture(null));
    expect(libre).toMatchObject({ id: "S" });
    const construire = (e: unknown) => (e as { construire: () => THREE.Object3D[] }).construire();
    const objets = construire(libre);
    expect(objets.filter((o) => typeof o.userData.pole === "number")).toHaveLength(0);
    const nappe = objets[0] as THREE.Mesh;
    expect((nappe.material as THREE.Material).side).toBe(THREE.DoubleSide);
    const [choisie] = entreesLibres(lecture("S"));
    expect(choisie!.signature).not.toBe(libre!.signature);
    const poles = construire(choisie).filter((o) => typeof o.userData.pole === "number");
    expect(poles.map((o) => [o.userData.surface, o.userData.pole, o.position.toArray()])).toEqual(d.surfaces![0]!.controle.map((p, k) => ["S", k, [p.x, p.y, p.z]]));
    expect(solidesDesignables(d)("S")).toBe(true);
  });

  it("X.1-05 règle d'or : Surface NURBS (Ctrl+F8), Modifier la surface (Ctrl+F9), Épaissir la surface (Shift+F11) — icône propre, barre « volume-libre », raccourci libre et non réservé, alternative clavier ; seul Épaissir charge le noyau exact", () => {
    const outils = STUDIO_TOOLS.filter((t) => t.toolId.startsWith("studio.surface.") || t.toolId.startsWith("studio.subdivision."));
    expect(outils.map((t) => [t.toolId, t.raccourci, t.iconeSymbolique, t.groupe])).toEqual([
      ["studio.surface.nurbs", "Ctrl+F8", "studio-surface-nurbs", "volume-libre"],
      ["studio.surface.modifier", "Ctrl+F9", "studio-surface-edit", "volume-libre"],
      ["studio.surface.epaissir", "Shift+F11", "studio-surface-thicken", "volume-libre"],
      ["studio.subdivision.creer", "Ctrl+Shift+Home", "studio-surface-subdivision", "volume-libre"],
      ["studio.subdivision.solidifier", "Ctrl+Shift+End", "studio-surface-solidify", "volume-libre"],
    ]);
    for (const t of outils) {
      expect(cibleRaccourci(t.raccourci)).toEqual({ type: "outil", toolId: t.toolId });
      expect(RACCOURCIS_RESERVES).not.toContain(t.raccourci);
      expect(STUDIO_TOOLS.filter((x) => x.raccourci === t.raccourci || x.iconeSymbolique === t.iconeSymbolique)).toHaveLength(1);
      expect(OUTILS_VOLUME_LIBRE.has(t.toolId) && OUTILS_MODES.has(t.toolId)).toBe(true);
      expect(ALTERNATIVES_GESTES[t.toolId]).toBeDefined();
      expect((en as Record<string, string>)[t.libelleFR], t.libelleFR).toBeTruthy();
    }
    expect(ALTERNATIVES_GESTES["studio.surface.nurbs"]).toMatchObject({ type: "saisie-numerique", moyens: ["panneau-volume-3d"] });
    expect(moteursDeOutil("studio.surface.epaissir", "volume-libre")).toContain("noyau-exact");
    expect(moteursDeOutil("studio.surface.nurbs", "volume-libre")).not.toContain("noyau-exact");
    expect(moteursDeOutil("studio.surface.modifier", "volume-libre")).not.toContain("noyau-exact");
  });
});

const SOMMETS_TETRA = "1 1 1; 1 -1 -1; -1 1 -1; -1 -1 1";
const FACES_TETRA = "1 2 3; 1 4 2; 1 3 4; 2 4 3";
const avecSubdivision = (): StudioDocument => applyStudioCommands(newStudioDocument("ui"), ok(commandeSubdivision(SOMMETS_TETRA, FACES_TETRA, 1, "T")));

describe("X.1-05 — surfaces de subdivision dans l'interface", () => {
  it("X.1-05 interface : Surface de subdivision — maillage de contrôle saisi au clavier (sommets, faces numérotées à partir de 1, niveau), saisies incomplètes refusées ; sommet modifié, même identité", () => {
    expect(lireMaillageControle("", FACES_TETRA)).toMatchObject({ erreur: expect.stringMatching(/^Saisissez les sommets/) });
    expect(lireMaillageControle(SOMMETS_TETRA, "1 2 3; 1 4 9")).toMatchObject({ erreur: expect.stringMatching(/^Saisissez les faces triangulaires/) });
    expect(lireMaillageControle(SOMMETS_TETRA, "1 2 3 4")).toMatchObject({ erreur: expect.stringMatching(/^Saisissez les faces triangulaires/) });
    expect(commandeSubdivision(SOMMETS_TETRA, FACES_TETRA, Number.NaN, "T")).toEqual({ erreur: "Saisissez le niveau de subdivision : un entier de 0 à 4." });
    const [c] = ok(commandeSubdivision(SOMMETS_TETRA, FACES_TETRA, 1, "T", "default"));
    expect(c).toEqual({ toolId: "studio.subdivision.creer", params: { id: "T", type: "surface-subdivision", niveau: 1, sommets: [{ x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }], faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]] } });
    const d = avecSubdivision(), t = d.subdivisions![0]!;
    expect(descriptionSubdivision(t, nombre)).toMatch(/^Surface de subdivision 4 sommets, 4 faces, niveau 1, fermée · aire /);
    expect(valeursSommet(t, 2)).toEqual({ k: 2, x: -1, y: 1, z: -1, niveau: 1 });
    expect(commandeModifierSommet(null, valeursSommet(t, 2))).toEqual({ erreur: "Sélectionnez d’abord la surface à modifier." });
    expect(commandeModifierSommet(t, { ...valeursSommet(t, 2), k: 7 })).toEqual({ erreur: "Choisissez le sommet de contrôle à modifier." });
    const cs = ok(commandeModifierSommet(t, { ...valeursSommet(t, 2), z: -2, niveau: 2 }));
    expect(cs[0]!.toolId).toBe("studio.surface.modifier");
    const m = applyStudioCommands(d, cs).subdivisions![0]!;
    expect(m.id).toBe("T");
    expect(m.sommets[2]).toEqual({ x: -1, y: 1, z: -2 });
    expect(m.niveau).toBe(2);
    expect(m.faces).toEqual(t.faces);
  });

  it("X.1-05 interface : solidification de bout en bout — tâche « polyedre » au Worker (maillage subdivisé), engagement de la commande ; surface ouverte refusée avant le Worker", async () => {
    const d = avecSubdivision();
    const r = demandeSolidification(d, "1", "T", "P");
    if (!r.ok) throw new Error(r.message);
    expect(tacheSolidification(r.demande)).toMatchObject({ cle: "studio.exact.solidification", nature: "solidification" });
    const { ord, vus } = banc();
    const e = etatApresSolidification(r.demande, await ord.soumettre(tacheSolidification(r.demande)).issue, "1");
    expect((vus[0] as { type: string; triangles: unknown[] })).toMatchObject({ type: "polyedre" });
    expect((vus[0] as { triangles: unknown[] }).triangles).toHaveLength(16);
    const eng = engagementSolidification(e, { doc: d, revision: "1", modifiable: true });
    if (!eng.ok) throw new Error(eng.message);
    const apres = applyStudioCommands(d, eng.commandes);
    expect(apres.subdivisions).toBeUndefined();
    expect(apres.exacts![0]).toMatchObject({ id: "P", operation: "solidification", subdivision: d.subdivisions![0] });
    const ouverte = applyStudioCommands(newStudioDocument("ui"), ok(commandeSubdivision("0 0 0; 1 0 0; 0 1 0", "1 2 3", 1, "O")));
    expect(demandeSolidification(ouverte, "1", "O", "Q")).toMatchObject({ ok: false, message: expect.stringMatching(/^Solidification impossible : surface de subdivision ouverte/) });
    expect(engagementSolidification(etatApresSolidification(r.demande, await ord.soumettre(tacheSolidification(r.demande)).issue, "2"), { doc: d, revision: "2", modifiable: true }).ok).toBe(false);
  });

  it("X.1-05 vue 3D : surface de subdivision sélectionnée — maillage de contrôle et un repère désignable par sommet (userData.sommet) ; panneaux : saisies vides, sommet choisi, solidification", () => {
    const d = avecSubdivision(), mesh = studioMesh3d(d);
    const lecture = (selection: string | null) => ({ mesh, cle: () => "k", doc: d, mode: "ombre" as never, selection, selectionArchitecture: null, present: () => true });
    const construire = (e: unknown) => (e as { construire: () => THREE.Object3D[] }).construire();
    const sd = entreesLibres(lecture("T")).find((x) => x.id === "T")!;
    const reperes = construire(sd).filter((o) => typeof o.userData.sommet === "number");
    expect(reperes.map((o) => [o.userData.subdivision, o.userData.sommet, o.position.toArray()])).toEqual(d.subdivisions![0]!.sommets.map((p, k) => ["T", k, [p.x, p.y, p.z]]));
    expect(construire(entreesLibres(lecture(null)).find((x) => x.id === "T")!).filter((o) => typeof o.userData.sommet === "number")).toHaveLength(0);
    expect(solidesDesignables(d)("T")).toBe(true);
    const props = { doc: d, revision: "1", modifiable: true, selection: null, sommet: null, surSommet: () => {} };
    const creation = renderToStaticMarkup(createElement(PanneauSubdivisions, { ...props, outil: "studio.subdivision.creer" }));
    expect(creation).toContain('name="subdivision-sommets" required="" rows="3" data-studio-subdivision-sommets="true"></textarea>');
    expect(creation).toContain('name="subdivision-niveau" value=""');
    const edition = renderToStaticMarkup(createElement(PanneauSubdivisions, { ...props, outil: "studio.surface.modifier", selection: "T", sommet: 1 }));
    expect(edition).toContain("data-studio-subdivision-modifier=\"T\"");
    expect(edition.match(/<option value="\d"/g)).toHaveLength(4);
    expect(edition).toContain('<option value="1" selected="">Sommet 2</option>');
    // La surface NURBS n'affiche pas son formulaire de pôle quand une subdivision est sélectionnée.
    expect(renderToStaticMarkup(createElement(PanneauSurfaces, { doc: d, revision: "1", modifiable: true, selection: "T", pole: null, surPole: () => {}, outil: "studio.surface.modifier" }))).not.toContain("data-studio-surface-modifier");
    const solidifier = renderToStaticMarkup(createElement(PanneauSubdivisions, { ...props, outil: "studio.subdivision.solidifier" }));
    expect(solidifier).toContain("data-studio-solidifier");
    expect(solidifier).toContain('<option value="" selected="">Choisir la surface…</option>');
  });
});
