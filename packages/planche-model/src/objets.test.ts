/** Lot 5 — objets : masquer, verrouiller, adoucir / lisser, orienter, intersection des faces, occurrences liées, métadonnées. */
import { describe, expect, it } from "vitest";
import {
  adoucirAretes,
  appliquer,
  adoucirLisser,
  afficherEntites,
  afficherTout,
  ajouterRectangle,
  compter,
  contexte,
  copier,
  deplacer,
  eclater,
  effacerEntites,
  grouper,
  intersecterAvecModele,
  inverserFace,
  masquerEntites,
  modeleVide,
  modifierDefinition,
  nombreOccurrences,
  orienterFaces,
  pousserTirer,
  renommerOccurrence,
  rendreUnique,
  verrouillerOccurrences,
  volume,
  type Modele,
} from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { etendreSelection, scene } from "./outils/selection.js";
import { v3 } from "./vecteur.js";

/** Boîte 2 × 2 × 1,5 groupée, coin en (dx ; dy ; 0). */
function boite(m: Modele, dx: number, dy = 0, nom = "Boîte") {
  const r = ajouterRectangle(m, v3(dx, dy, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
  const dedans = (mm: Modele, s: string) => {
    const p = mm.racine.sommets[s]!.position;
    return p.x >= dx - 1e-9 && p.x <= dx + 2 + 1e-9 && p.y >= dy - 1e-9 && p.y <= dy + 2 + 1e-9;
  };
  const face = Object.values(r.racine.faces).find((f) => f.exterieur.every((s) => dedans(r, s)))!;
  const b = pousserTirer(r, face.id, 1.5).modele;
  const ids = [...Object.values(b.racine.faces).filter((f) => f.exterieur.every((s) => dedans(b, s))), ...Object.values(b.racine.aretes).filter((a) => dedans(b, a.a) && dedans(b, a.b))].map((e) => e.id);
  return grouper(b, ids, { nom });
}
const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
const faceDe = (m: Modele) => Object.values(m.racine.faces)[0]!;

describe("Masquer / réafficher", () => {
  it("une face masquée n'est ni rendue ni visée ; Réafficher la rétablit (un pas chacun)", () => {
    const m = sol();
    const f = faceDe(m).id;
    const h = masquerEntites(m, [f]).modele;
    expect(h.racine.faces[f]!.masquee).toBe(true);
    expect(geometrieVisible(h).faces).toHaveLength(0);
    expect(scene(h).filter((e) => e.genre === "face")).toHaveLength(0);
    const v = afficherEntites(h, [f]).modele;
    expect(v.racine.faces[f]!.masquee).toBeUndefined();
    expect(geometrieVisible(v).faces).toHaveLength(1);
  });
  it("un objet masqué disparaît avec son contenu ; Réafficher tout le rend, dans tous les contextes", () => {
    const g = boite(modeleVide(), 0);
    const h = masquerEntites(g.modele, [g.occurrence]).modele;
    expect(geometrieVisible(h).faces).toHaveLength(0);
    expect(scene(h)).toHaveLength(0);
    // Une arête masquée à l'intérieur du groupe aussi.
    const def = h.definitions[g.definition]!;
    const arete = Object.keys(def.contenu.aretes)[0]!;
    const h2 = masquerEntites(h, [arete], { dans: g.occurrence }).modele;
    const tout = afficherTout(h2).modele;
    expect(tout.racine.occurrences[g.occurrence]!.masquee).toBeUndefined();
    expect(Object.values(tout.definitions[g.definition]!.contenu.aretes).every((a) => !a.masquee)).toBe(true);
    expect(geometrieVisible(tout).faces).toHaveLength(6);
  });
});

describe("Verrouiller", () => {
  it("un objet verrouillé refuse déplacement, copie, effacement et éclatement ; déverrouillé, tout reprend", () => {
    const g = boite(modeleVide(), 0);
    const v = verrouillerOccurrences(g.modele, [g.occurrence], true).modele;
    expect(v.racine.occurrences[g.occurrence]!.verrouille).toBe(true);
    expect(() => deplacer(v, [g.occurrence], v3(1, 0, 0))).toThrow(/verrouillé/);
    expect(() => copier(v, [g.occurrence], v3(1, 0, 0))).toThrow(/verrouillé/);
    expect(() => effacerEntites(v, [g.occurrence])).toThrow(/verrouillé/);
    expect(() => eclater(v, g.occurrence)).toThrow(/verrouillé/);
    const d = verrouillerOccurrences(v, [g.occurrence], false).modele;
    expect(d.racine.occurrences[g.occurrence]!.verrouille).toBeUndefined();
    const dep = deplacer(d, [g.occurrence], v3(1, 0, 0)).modele;
    expect(appliquer(dep.racine.occurrences[g.occurrence]!.transformation, v3(0, 0, 0)).x).toBeCloseTo(appliquer(d.racine.occurrences[g.occurrence]!.transformation, v3(0, 0, 0)).x + 1, 9);
  });
});

describe("Adoucir / lisser", () => {
  it("adoucir les arêtes d'une face les marque ; Adoucir / lisser à 30° n'adoucit pas les arêtes d'une boîte (90°) mais adoucit à 100°", () => {
    const m = sol();
    const f = faceDe(m).id;
    const a = adoucirAretes(m, [f], true).modele;
    expect(Object.values(a.racine.aretes).every((e) => e.adoucie)).toBe(true);
    const b = pousserTirer(sol(), faceDe(sol()).id, 1).modele;
    const tous = Object.keys(b.racine.faces);
    const r30 = adoucirLisser(b, tous, 30, false);
    expect(r30.extra).toBe(0);
    const r100 = adoucirLisser(b, tous, 100, false);
    expect(r100.extra).toBe(12);
    expect(Object.values(r100.modele.racine.aretes).every((e) => e.adoucie)).toBe(true);
  });
});

describe("Orienter les faces", () => {
  it("une face retournée à la main sur une boîte est remise dans le sens des autres (1 face retournée)", () => {
    const b = pousserTirer(sol(), faceDe(sol()).id, 1).modele;
    const dessus = Object.values(b.racine.faces).find((f) => f.normale.z > 0.5)!;
    const cote = Object.values(b.racine.faces).find((f) => Math.abs(f.normale.z) < 0.5)!;
    const casse = inverserFace(b, cote.id).modele;
    expect(casse.racine.faces[cote.id]!.normale.x).toBeCloseTo(-cote.normale.x, 9);
    const r = orienterFaces(casse, dessus.id);
    expect(r.extra).toBe(1);
    expect(r.modele.racine.faces[cote.id]!.normale.x).toBeCloseTo(cote.normale.x, 9);
    const gg = grouper(r.modele, [...Object.keys(r.modele.racine.faces), ...Object.keys(r.modele.racine.aretes)]);
    expect(volume(gg.modele, gg.occurrence)).toBeCloseTo(12, 9);
  });
});

describe("Intersection des faces avec le modèle", () => {
  it("une boîte groupée qui pénètre une face libre y ajoute les arêtes de la pénétration (la face est découpée)", () => {
    const g = boite(modeleVide(), 1, 0.5);
    // Face libre verticale x = 2 (plan yz), de 0 à 3 en y, de 0 à 2 en z : traversée par la boîte (x de 1 à 3).
    const m = ajouterRectangle(g.modele, v3(2, -1, 0), v3(0, 5, 0), v3(0, 0, 2)).modele;
    const avant = compter(m.racine);
    const r = intersecterAvecModele(m, [g.occurrence]);
    expect(r.extra).toBeGreaterThan(0);
    const apres = compter(r.modele.racine);
    expect(apres.aretes).toBeGreaterThan(avant.aretes);
    expect(apres.faces).toBeGreaterThan(avant.faces);
    // L'objet n'est pas modifié.
    expect(r.modele.definitions[g.definition]!.contenu).toBe(m.definitions[g.definition]!.contenu);
    // Deux objets de même définition : rien (aucune face libre traversée).
    const deux = copier(g.modele, [g.occurrence], v3(5, 0, 0)).modele;
    const occs = Object.keys(deux.racine.occurrences);
    expect(intersecterAvecModele(deux, occs).extra).toBe(0);
  });
});

describe("Occurrences liées, Rendre unique, Éclater, groupes chevauchés", () => {
  it("Pousser / tirer dans une occurrence d'un composant fait grandir toutes les occurrences ; Rendre unique isole la sienne", () => {
    const m0 = sol();
    const g = grouper(m0, [...Object.keys(m0.racine.faces), ...Object.keys(m0.racine.aretes)], { genre: "composant", nom: "Dalle" });
    const deux = copier(g.modele, [g.occurrence], v3(6, 0, 0)).modele;
    const [o1, o2] = Object.keys(deux.racine.occurrences) as [string, string];
    expect(nombreOccurrences(deux, g.definition)).toBe(2);
    const face = Object.keys(deux.definitions[g.definition]!.contenu.faces)[0]!;
    const tire = pousserTirer(deux, face, 1, { dans: o1 }).modele;
    expect(volume(tire, o1)).toBeCloseTo(12, 9);
    expect(volume(tire, o2)).toBeCloseTo(12, 9);
    const u = rendreUnique(tire, o2).modele;
    expect(u.racine.occurrences[o2]!.definition).not.toBe(g.definition);
    expect(nombreOccurrences(u, g.definition)).toBe(1);
    const dessus = Object.values(u.definitions[u.racine.occurrences[o2]!.definition]!.contenu.faces).find((f) => f.normale.z > 0.5)!;
    const u2 = pousserTirer(u, dessus.id, 1, { dans: o2 }).modele;
    expect(volume(u2, o2)).toBeCloseTo(24, 9);
    expect(volume(u2, o1)).toBeCloseTo(12, 9);
  });
  it("Éclater une boîte groupée rend 18 entités libres (6 faces + 12 arêtes) ; deux groupes chevauchés ne collent pas", () => {
    const g = boite(modeleVide(), 0);
    const e = eclater(g.modele, g.occurrence).modele;
    const c = compter(e.racine);
    expect(c.faces + c.aretes).toBe(18);
    expect(c.occurrences).toBe(0);
    const a = boite(modeleVide(), 0);
    const b = boite(a.modele, 1);
    expect(Object.keys(b.modele.racine.faces)).toHaveLength(0);
    expect(compter(contexte(b.modele, a.occurrence)).faces).toBe(6);
    expect(compter(contexte(b.modele, b.occurrence)).faces).toBe(6);
    expect(volume(b.modele, a.occurrence)).toBeCloseTo(6, 9);
  });
  it("nom d'occurrence, nom / description / options de définition ; un pas chacun, conservés par Rendre unique", () => {
    const g = grouper(sol(), Object.keys(sol().racine.faces), { genre: "composant", nom: "Composant", description: "Dalle test", collerA: "horizontal" });
    const r = renommerOccurrence(g.modele, g.occurrence, "Dalle nord").modele;
    expect(r.racine.occurrences[g.occurrence]!.nom).toBe("Dalle nord");
    const d = modifierDefinition(r, g.definition, { nom: "Dalle", description: "Dalle béton", decouperOuverture: true }).modele;
    expect(d.definitions[g.definition]).toMatchObject({ nom: "Dalle", description: "Dalle béton", collerA: "horizontal", decouperOuverture: true });
    const deux = copier(d, [g.occurrence], v3(6, 0, 0)).modele;
    const autre = Object.keys(deux.racine.occurrences).find((o) => o !== g.occurrence)!;
    const u = rendreUnique(deux, autre).modele;
    expect(u.definitions[u.racine.occurrences[autre]!.definition]).toMatchObject({ nom: "Dalle#1", description: "Dalle béton", collerA: "horizontal" });
    expect(renommerOccurrence(r, g.occurrence, "").modele.racine.occurrences[g.occurrence]!.nom).toBeUndefined();
  });
});

describe("Sélectionner ▸", () => {
  it("arêtes bordantes, faces connectées, tout le connecté, inverser, tout, même matériau, même balise, désélectionner les faces", () => {
    const b = pousserTirer(sol(), faceDe(sol()).id, 1).modele;
    const f = Object.keys(b.racine.faces)[0]!;
    expect(etendreSelection(b, [f], "aretes-bordantes")).toHaveLength(5);
    expect(etendreSelection(b, [f], "faces-connectees")).toHaveLength(6);
    expect(etendreSelection(b, [f], "tout-connecte")).toHaveLength(18);
    expect(etendreSelection(b, [f], "tout")).toHaveLength(18);
    expect(etendreSelection(b, [f], "inverser")).toHaveLength(17);
    expect(etendreSelection(b, [f, Object.keys(b.racine.aretes)[0]!], "deselectionner-faces")).toHaveLength(1);
    expect(etendreSelection(b, [f], "meme-materiau")).toHaveLength(6);
    const g = boite(modeleVide(), 0);
    expect(etendreSelection(g.modele, [g.occurrence], "meme-balise")).toEqual([g.occurrence]);
  });
});
