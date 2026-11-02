import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { exportStudioDxf, exportStudioSvg } from "../export.js";
import { exportStudioIfc, studioIfcSummary, studioStepString } from "../ifc.js";
import { studioMesh3d } from "../mesh-3d.js";
import { quantitesStudio } from "../quantites.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_TOOLS } from "../registry.js";
import { studioRapportFidelite } from "../echanges/rapport-fidelite.js";
import { studioBilanExport3d, studioPiecesStep } from "../export-3d.js";
import { studioEffetsCommande } from "../cmd/effets.js";
import { studioCopieIndependante } from "../copie-independante.js";
import { comparerElementsStudio } from "../comparaison.js";
import { projectionsAInvalider, studioMesh3dIncremental } from "../projections.js";
import { metreStructurel } from "../architecture/structure.js";
import type { StudioBeam, StudioColumn, StudioSlab } from "../architecture/types.js";
import { studioCommandesRendreUnique, studioInstancesComposants, studioVolumeComposant, type StudioComposant, type StudioOccurrence } from "./composants.js";
import { STUDIO_SANS_NIVEAU, studioMembresNiveau, studioVueNiveau } from "../vue-niveau.js";

/**
 * Lot W3-B (X.1-04, S4 « immeuble multi-niveaux, structure, réseaux et composants répétitifs ») : niveaux comme objets,
 * composants 3D (définition partagée + occurrences) et éléments structurels typés (poteau, poutre, dalle). Toutes les
 * dimensions ci-dessous sont des **données de test synthétiques** (pas des valeurs de projet, ni des règles) : Studio
 * n'en propose aucune, et aucune vérification structurelle n'est faite.
 */
const cmd = (c: unknown) => c as StudioCommand;
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map(cmd));
const refus = (f: () => unknown): string => { try { f(); } catch (e) { return (e as Error).message; } return "accepté"; };
const proche = (a: number, b: number) => expect(a).toBeCloseTo(b, 12);

const niveau = (id: string, nom: string, cote: number) => ({ toolId: "studio.niveau.definir", params: { id, nom, cote } });
const poteau = (over: Partial<StudioColumn> = {}): StudioColumn => ({ id: "p1", type: "column", position: { x: 0, y: 0 }, rotation: 0, width: 0.3, depth: 0.4, height: 3, base: 0, ...over });
const poutre = (over: Partial<StudioBeam> = {}): StudioBeam => ({ id: "b1", type: "beam", start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, width: 0.2, height: 0.5, base: 2.5, ...over });
const dalle = (over: Partial<StudioSlab> = {}): StudioSlab => ({ id: "d1", type: "slab", contour: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 5 }, { x: 0, y: 5 }], thickness: 0.2, base: 3, ...over });
const structure = (e: StudioColumn | StudioBeam | StudioSlab) => ({ toolId: "studio.structure.element", params: e });
const composant = (over: Partial<StudioComposant> = {}): StudioComposant => ({
  id: "k1", nom: "Gaine (synthétique)",
  solides: [{ id: "s", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 0.2, depth: 0.2, height: 3 }], ...over,
});
const occurrence = (id: string, x: number, over: Partial<StudioOccurrence> = {}): StudioOccurrence => ({ id, type: "occurrence", composantId: "k1", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, ...over });
const definir = (c: StudioComposant) => ({ toolId: "studio.composant.definir", params: c });
const placer = (o: StudioOccurrence) => ({ toolId: "studio.composant.placer", params: o });
const mur = (id: string, over: Record<string, unknown> = {}) => ({ toolId: "studio.architecture.mur", params: { id, type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center", ...over } });

/** Volume d'un maillage fermé orienté (théorème de la divergence). */
function volumeMaillage(m: { vertices: { x: number; y: number; z: number }[]; triangles: [number, number, number][] }): number {
  let v = 0;
  for (const [a, b, c] of m.triangles) {
    const p = m.vertices[a]!, q = m.vertices[b]!, r = m.vertices[c]!;
    v += (p.x * (q.y * r.z - q.z * r.y) - p.y * (q.x * r.z - q.z * r.x) + p.z * (q.x * r.y - q.y * r.x)) / 6;
  }
  return v;
}
const zMin = (m: { vertices: { z: number }[] }) => Math.min(...m.vertices.map((v) => v.z));

/** Immeuble synthétique à deux niveaux : murs, ouverture, poteau, poutre, dalle, échelle et occurrences rattachés. */
function immeuble(): StudioDocument {
  return avec(newStudioDocument("w3b"),
    { toolId: "studio.calque.creer", params: { id: "structure", name: "Structure", visible: true, locked: false } },
    niveau("n0", "Rez-de-chaussée", 0), niveau("n1", "Étage 1", 3.2),
    mur("m0", { niveauId: "n0" }), mur("m1", { niveauId: "n1", base: 3.2 }),
    { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2, width: 1, height: 2.1, sill: 0, kind: "porte" } },
    structure(poteau({ niveauId: "n1", base: 3.2, layerId: "structure" })), structure(poutre({ niveauId: "n1", base: 5.7 })), structure(dalle({ niveauId: "n1", base: 6.2 })),
    { toolId: "studio.architecture.echelle-acces", params: { id: "e1", type: "ladder", niveauId: "n1", position: { x: 8, y: 1 }, rotation: 0, width: 0.5, height: 3, base: 3.2, rungs: 9, section: 0.04 } },
    definir(composant()), placer(occurrence("q0", 5.4, { niveauId: "n0" })), placer({ ...occurrence("q1", 5.4, { niveauId: "n1" }), placement: { origin: { x: 5.4, y: 0, z: 3.2 }, rotation: 0 } }), placer(occurrence("q2", 9)),
  );
}

describe("X.1-04 — registre : quatre outils du bâtiment, icônes, barre « Bâtiment » et raccourcis de la réserve", () => {
  it("Niveau (Ctrl+F2), Composant (Ctrl+F3), Occurrence de composant (Ctrl+F6), Élément structurel (Ctrl+F7) : mutations acceptées par l'API, sans agent", () => {
    const b = STUDIO_TOOLS.filter((t) => t.groupe === "batiment").map((t) => [t.toolId, t.libelleFR, t.raccourci, t.iconeSymbolique, t.nature, t.agentExposure]);
    expect(b).toEqual([
      ["studio.niveau.definir", "Niveau", "Ctrl+F2", "studio-level", "mutation", "none"],
      ["studio.composant.definir", "Composant", "Ctrl+F3", "studio-component", "mutation", "none"],
      ["studio.composant.placer", "Occurrence de composant", "Ctrl+F6", "studio-component-instance", "mutation", "none"],
      ["studio.structure.element", "Élément structurel", "Ctrl+F7", "studio-structure", "mutation", "none"],
    ]);
    for (const [id] of b) expect(STUDIO_COMMAND_TOOL_IDS).toContain(id);
    // Composants 3D distincts des blocs 2D : aucun identifiant de bloc n'est pris.
    for (const [id] of b) expect(String(id)).not.toMatch(/bloc/);
  });
});

describe("X.1-04 — niveaux comme objets : nom et cote saisis, objets rattachés, déplacement répercuté, vue par niveau", () => {
  it("un document sans niveau, composant ni élément structurel reste valide et relu à l'identique (extension additive)", () => {
    const ancien = avec(newStudioDocument("ancien"), mur("m"), { toolId: "studio.solide.boite", params: { id: "bx", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } });
    expect(JSON.stringify(validateStudioDocument(JSON.parse(JSON.stringify(ancien))))).toBe(JSON.stringify(ancien));
    expect(Object.keys(ancien)).not.toContain("niveaux");
    expect(Object.keys(ancien)).not.toContain("composants");
    expect(Object.keys(ancien)).not.toContain("occurrences");
  });

  it("niveau nommé avec sa cote ; murs, échelle, poteau, poutre, dalle et occurrences rattachés ; l'ouverture suit son mur", () => {
    const d = immeuble();
    expect(d.niveaux).toEqual([{ id: "n0", nom: "Rez-de-chaussée", cote: 0 }, { id: "n1", nom: "Étage 1", cote: 3.2 }]);
    expect([...studioMembresNiveau(d, "n1")].sort()).toEqual(["b1", "d1", "e1", "m1", "o1", "p1", "q1"]);
    expect([...studioMembresNiveau(d, "n0")].sort()).toEqual(["m0", "q0"]);
    expect([...studioMembresNiveau(d, STUDIO_SANS_NIVEAU)]).toEqual(["q2"]);
    // Relu à l'identique.
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("déplacer un niveau (nouvelle cote) translate tous ses objets du même écart, dans la même commande ; les autres ne bougent pas", () => {
    const d = immeuble();
    const apres = avec(d, niveau("n1", "Étage 1", 3.7));
    const a = (id: string) => apres.architecture!.find((x) => x.id === id) as { base: number };
    proche(a("m1").base, 3.7); proche(a("p1").base, 3.7); proche(a("b1").base, 6.2); proche(a("d1").base, 6.7); proche(a("e1").base, 3.7);
    expect(a("m0").base).toBe(0);
    proche(apres.occurrences!.find((o) => o.id === "q1")!.placement.origin.z, 3.7);
    expect(apres.occurrences!.find((o) => o.id === "q0")!.placement.origin.z).toBe(0);
    // L'ouverture garde son allège : elle suit la base de son mur (vide relevé de 0,5 m dans la vue 3D).
    const vide = (doc: StudioDocument) => zMin(studioMesh3d(doc).architecture!.find((x) => x.id === "o1")!);
    proche(vide(apres) - vide(d), 0.5);
    // Renommer sans changer la cote ne déplace rien.
    const renomme = avec(d, niveau("n1", "R+1", 3.2));
    expect(renomme.architecture).toEqual(d.architecture);
    expect(renomme.niveaux![1]!.nom).toBe("R+1");
  });

  it("refus : niveau inconnu, nom vide, cote non finie, champ inconnu ; objet rattaché sur un calque verrouillé (rien n'est déplacé en partie)", () => {
    const d = immeuble();
    expect(refus(() => avec(d, mur("mx", { niveauId: "n9" })))).toMatch(/niveau introuvable : n9/);
    expect(refus(() => avec(d, structure(poteau({ id: "px", niveauId: "n9" }))))).toMatch(/niveau introuvable : n9/);
    expect(refus(() => avec(d, placer(occurrence("qx", 1, { niveauId: "n9" }))))).toMatch(/niveau introuvable : n9/);
    expect(refus(() => avec(d, niveau("n2", " ", 6)))).toMatch(/nom non vide attendu/);
    expect(refus(() => avec(d, { toolId: "studio.niveau.definir", params: { id: "n2", nom: "R+2", cote: Number.NaN } }))).toMatch(/nombre fini attendu/);
    expect(refus(() => avec(d, { toolId: "studio.niveau.definir", params: { id: "n2", nom: "R+2", cote: 6, hauteur: 3 } }))).toMatch(/champs absents ou inconnus/);
    expect(refus(() => avec(d, niveau("m0", "Collision", 9)))).toMatch(/identifiant déjà utilisé/);
    const verrouille = avec(d, { toolId: "studio.calque.modifier", params: { id: "structure", name: "Structure", visible: true, locked: true } });
    expect(refus(() => avec(verrouille, niveau("n1", "Étage 1", 4)))).toMatch(/calque verrouillé/);
    expect(refus(() => validateStudioDocument({ ...d, architecture: [...d.architecture!, { id: "mz", type: "wall", niveauId: "absent", axis: [{ x: 0, y: 9 }, { x: 1, y: 9 }], thickness: 0.2, height: 3, base: 0, justification: "center" }] }))).toMatch(/niveau introuvable : absent/);
  });

  it("supprimer un niveau détache ses objets (géométrie et cotes gardées), rien n'est supprimé avec lui", () => {
    const d = immeuble();
    const apres = avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["n1"] } });
    expect(apres.niveaux!.map((n) => n.id)).toEqual(["n0"]);
    expect(apres.architecture!.map((x) => x.id)).toEqual(d.architecture!.map((x) => x.id));
    for (const x of apres.architecture!) if (x.type !== "opening") expect(x.niveauId === undefined || x.niveauId === "n0").toBe(true);
    expect((apres.architecture!.find((x) => x.id === "m1") as { base: number }).base).toBe(3.2);
    expect(apres.occurrences!.find((o) => o.id === "q1")).not.toHaveProperty("niveauId");
  });

  it("vue par niveau : document dérivé valide, objets du niveau seulement (ou sans niveau) ; la géométrie libre gardée ou masquée sur demande", () => {
    const d = avec(immeuble(), { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 9 }, end: { x: 3, y: 9 } } });
    const v1 = studioVueNiveau(d, "n1");
    expect(v1.architecture!.map((x) => x.id).sort()).toEqual(["b1", "d1", "e1", "m1", "o1", "p1"]);
    expect(v1.occurrences!.map((o) => o.id)).toEqual(["q1"]);
    expect(v1.objects.map((o) => o.id)).toEqual(["l1"]);
    expect(studioVueNiveau(d, "n1", { libres: "masquer" }).objects).toEqual([]);
    expect(studioVueNiveau(d, STUDIO_SANS_NIVEAU).occurrences!.map((o) => o.id)).toEqual(["q2"]);
    expect(studioVueNiveau(d, null)).toEqual(validateStudioDocument(d));
    expect(() => studioVueNiveau(d, "inconnu")).toThrow(/niveau inconnu/);
    // La vue 3D d'un niveau ne maille que ses objets.
    expect(studioMesh3d(v1).architecture!.map((a) => a.id).sort()).toEqual(["b1", "d1", "e1", "m1", "o1", "p1"]);
  });
});

describe("X.1-04 — composants 3D : définition partagée, occurrences, modification répercutée, occurrence rendue unique", () => {
  it("chaque occurrence dérive sa géométrie de la définition placée ; modifier la définition change toutes ses occurrences dans la même révision", () => {
    const d = immeuble();
    const m = studioMesh3d(d);
    expect(m.occurrences!.map((o) => o.id)).toEqual(["q0", "q1", "q2"]);
    for (const o of m.occurrences!) proche(volumeMaillage(o), 0.2 * 0.2 * 3);
    proche(Math.min(...m.occurrences![2]!.vertices.map((v) => v.x)), 9);
    // Modification de la définition (section 0,3 × 0,3) : les trois occurrences changent ensemble.
    const plus = avec(d, definir(composant({ solides: [{ id: "s", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 0.3, depth: 0.3, height: 3 }] })));
    for (const o of studioMesh3d(plus).occurrences!) proche(volumeMaillage(o), 0.3 * 0.3 * 3);
    // Les occurrences elles-mêmes n'ont pas changé : seule la définition porte la géométrie (aucune copie).
    expect(plus.occurrences).toEqual(d.occurrences);
    // Le métré suit : volume de la définition par occurrence.
    const q = quantitesStudio(plus).objets.filter((o) => o.nature === "occurrence-composant");
    expect(q.map((o) => o.objetId)).toEqual(["q0", "q1", "q2"]);
    for (const o of q) proche(o.valeurs[0]!.valeur!, 0.27);
  });

  it("rendre unique : l'occurrence désigne une copie de la définition ; la définition d'origine modifiée ne la touche plus", () => {
    const d = immeuble();
    const lot = studioCommandesRendreUnique(d.composants!, d.occurrences!.find((o) => o.id === "q2")!, "k2", "Gaine (synthétique, unique)");
    const unique = avec(d, ...lot);
    expect(unique.composants!.map((c) => c.id)).toEqual(["k1", "k2"]);
    expect(unique.occurrences!.find((o) => o.id === "q2")!.composantId).toBe("k2");
    const modifie = avec(unique, definir(composant({ solides: [{ id: "s", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 0.5, depth: 0.5, height: 1 }] })));
    const vol = (doc: StudioDocument, id: string) => volumeMaillage(studioMesh3d(doc).occurrences!.find((o) => o.id === id)!);
    proche(vol(modifie, "q0"), 0.25); proche(vol(modifie, "q1"), 0.25);
    proche(vol(modifie, "q2"), 0.12);
  });

  it("table d'instanciation : une géométrie par définition, l'indice d'instance désigne son occurrence (désignation conservée après instanciation)", () => {
    const d = avec(immeuble(), ...studioCommandesRendreUnique(immeuble().composants!, immeuble().occurrences![2]!, "k2", "Copie"));
    const t = studioInstancesComposants(d.composants!, d.occurrences!);
    expect(t.map((x) => [x.definition.composantId, x.occurrences.map((o) => o.id)])).toEqual([["k1", ["q0", "q1"]], ["k2", ["q2"]]]);
    proche(volumeMaillage(t[0]!.definition), 0.12);
    // Après suppression d'une occurrence, la table se réindexe : l'indice 0 désigne toujours une occurrence présente.
    const moins = avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["q0"] } });
    expect(studioInstancesComposants(moins.composants!, moins.occurrences!)[0]!.occurrences.map((o) => o.id)).toEqual(["q1"]);
  });

  it("refus : définition sans solide, solide avec calque, source ou basculement, identifiants de solide dupliqués ; occurrence d'une définition inconnue ; définition encore employée", () => {
    const d = immeuble();
    expect(refus(() => avec(d, definir(composant({ id: "k3", solides: [] }))))).toMatch(/un solide au moins attendu/);
    const s = composant().solides[0]!;
    expect(refus(() => avec(d, definir(composant({ id: "k3", solides: [{ ...s, layerId: "structure" }] }))))).toMatch(/n’a pas de calque/);
    expect(refus(() => avec(d, definir(composant({ id: "k3", solides: [{ ...s, placement: { ...s.placement, basculement: { x: 0.1, y: 0 } } }] }))))).toMatch(/aucun basculement/);
    expect(refus(() => avec(d, definir(composant({ id: "k3", solides: [s, s] }))))).toMatch(/identifiant de solide dupliqué/);
    expect(refus(() => avec(d, definir(composant({ id: "k3", nom: "" }))))).toMatch(/nom non vide attendu/);
    expect(refus(() => avec(d, placer(occurrence("q9", 1, { composantId: "inconnu" }))))).toMatch(/définition de composant introuvable : inconnu/);
    expect(refus(() => avec(d, placer(occurrence("q9", 1, { composantId: "m0" }))))).toMatch(/ce n’est pas une définition de composant : m0/);
    expect(refus(() => avec(d, placer({ ...occurrence("q9", 1), placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0, basculement: { x: 0.2, y: 0 } } as never })))).toMatch(/aucun basculement/);
    expect(refus(() => avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["k1"] } }))).toMatch(/le composant k1 a encore 3 occurrence/);
    const vide = avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["k1", "q0", "q1", "q2"] } });
    expect(vide).not.toHaveProperty("composants");
    expect(vide).not.toHaveProperty("occurrences");
    const verrouille = avec(avec(d, placer(occurrence("q3", 12, { layerId: "structure" }))), { toolId: "studio.calque.modifier", params: { id: "structure", name: "Structure", visible: true, locked: true } });
    expect(refus(() => avec(verrouille, definir(composant())))).toMatch(/calque verrouillé/);
  });

  it("volume d'une définition : somme de ses solides ; une occurrence tournée garde son volume", () => {
    const c = composant({ solides: [...composant().solides, { id: "t", type: "prism", placement: { origin: { x: 0, y: 0, z: 3 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], height: 2 }] });
    proche(studioVolumeComposant(c), 0.12 + 1);
    const d = avec(newStudioDocument("rot"), definir(c), placer({ ...occurrence("q", 0, { composantId: "k1" }), placement: { origin: { x: 1, y: 2, z: 0 }, rotation: Math.PI / 3 } }));
    proche(volumeMaillage(studioMesh3d(d).occurrences![0]!), 1.12);
  });
});

describe("X.1-04 — éléments structurels typés : poteau, poutre, dalle (géométrie seulement, sections saisies)", () => {
  it("emprise, volume 3D et métré des seules valeurs saisies ; aucune masse ni vérification", () => {
    const d = immeuble();
    const m = studioMesh3d(d).architecture!;
    const vol = (id: string) => volumeMaillage(m.find((x) => x.id === id)!);
    proche(vol("p1"), 0.3 * 0.4 * 3); proche(vol("b1"), 0.2 * 0.5 * 6); proche(vol("d1"), 6 * 5 * 0.2);
    expect(m.find((x) => x.id === "p1")).toMatchObject({ type: "column", niveauId: "n1", layerId: "structure" });
    expect(metreStructurel(dalle())).toEqual({ hauteur: 0.2, surface: 30, perimetre: 22, volume: 6 });
    expect(metreStructurel(poutre())).toEqual({ hauteur: 0.5, longueur: 6, section: 0.1, volume: 0.6000000000000001 });
    const q = quantitesStudio(d).objets;
    expect(q.find((o) => o.objetId === "p1")).toMatchObject({ nature: "poteau", calqueId: "structure" });
    expect(q.find((o) => o.objetId === "b1")!.valeurs.map((v) => v.grandeur)).toEqual(["longueur", "volume"]);
    expect(q.find((o) => o.objetId === "d1")!.valeurs.map((v) => [v.grandeur, v.valeur])).toEqual([["perimetre", 22], ["surface", 30], ["hauteur", 0.2], ["volume", 6]]);
    for (const o of q) for (const v of o.valeurs) expect(["masse", "poids", "resistance"]).not.toContain(v.grandeur);
  });

  it("refus : axe de poutre nul, contour de dalle croisé, section nulle ou absente, type inconnu, champ métier inconnu (matériau, classe)", () => {
    const d = newStudioDocument("refus");
    expect(refus(() => avec(d, structure(poutre({ end: { x: 0, y: 0 } }))))).toMatch(/axe de poutre de longueur nulle/);
    expect(refus(() => avec(d, structure(dalle({ contour: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }] }))))).toMatch(/contour fermé simple attendu/);
    expect(refus(() => avec(d, structure(poteau({ width: 0 }))))).toMatch(/largeur de section strictement positive/);
    const { height: _h, ...sansHauteur } = poteau();
    expect(refus(() => avec(d, structure(sansHauteur as StudioColumn)))).toMatch(/champs absents ou inconnus/);
    expect(refus(() => avec(d, { toolId: "studio.structure.element", params: { ...poteau(), type: "box" } }))).toMatch(/column \(poteau\), beam \(poutre\) ou slab \(dalle\) attendu/);
    expect(refus(() => avec(d, { toolId: "studio.structure.element", params: { ...poteau(), materiau: "béton" } }))).toMatch(/champs absents ou inconnus/);
    expect(refus(() => avec(d, { toolId: "studio.structure.element", params: { ...poutre(), classe: "IfcBeam" } }))).toMatch(/champs absents ou inconnus/);
    expect(refus(() => avec(d, structure(poteau()), structure(poteau())))).toMatch(/identifiant déjà utilisé/);
  });

  it("modifier, déplacer, copier, tourner et supprimer par les commandes de l'architecture ; niveau changé par Modifier", () => {
    const d = immeuble();
    const modifie = avec(d, { toolId: "studio.architecture.modifier", params: { ...poteau({ niveauId: "n0", base: 0, layerId: "structure" }), width: 0.5 } });
    expect(modifie.architecture!.find((x) => x.id === "p1")).toMatchObject({ width: 0.5, niveauId: "n0" });
    const deplace = avec(d, { toolId: "studio.dessin.deplacer", params: { id: "b1", dx: 1, dy: 2 } });
    expect(deplace.architecture!.find((x) => x.id === "b1")).toMatchObject({ start: { x: 1, y: 2 }, end: { x: 7, y: 2 } });
    const copie = avec(d, { toolId: "studio.dessin.copier", params: { ids: ["d1"], dx: 10, dy: 0, copies: 2, prefix: "c" } });
    expect(copie.architecture!.filter((x) => x.type === "slab")).toHaveLength(3);
    const tourne = avec(d, { toolId: "studio.dessin.rotation", params: { ids: ["p1"], center: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    proche((tourne.architecture!.find((x) => x.id === "p1") as StudioColumn).rotation, Math.PI / 2);
    const sym = avec(d, { toolId: "studio.dessin.symetrie", params: { ids: ["d1"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 1 }, keepSource: false } });
    proche(metreStructurel(sym.architecture!.find((x) => x.id === "d1") as StudioSlab).surface!, 30);
    const supprime = avec(d, { toolId: "studio.architecture.supprimer", params: { ids: ["p1", "b1"], cascade: false } });
    expect(supprime.architecture!.some((x) => x.id === "p1" || x.id === "b1")).toBe(false);
  });

  it("A.3-09 : une boîte libre n'acquiert jamais le type poteau ; seul l'outil Élément structurel crée un poteau, et aucune constante normative n'est écrite", () => {
    const boite = avec(newStudioDocument("a309"), { toolId: "studio.solide.boite", params: { id: "bx", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 0.3, depth: 0.3, height: 3 } });
    expect(exportStudioIfc(boite, { studyName: "É", variantName: "V", timestamp: "2026-10-26T00:00:00" })).not.toMatch(/IFCCOLUMN|IFCBEAM|IFCSLAB/);
    // Les sources du modèle structurel ne portent aucune valeur métier : seules des bornes techniques et 0, 1, 2.
    const source = readFileSync(new URL("../architecture/structure.ts", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const nombres = [...source.matchAll(/(?<![\w.])(\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![\w.])/g)].map((m) => Number(m[1]));
    expect([...new Set(nombres)].filter((n) => ![0, 1, 2, 3, 1e6, 1e-15, 1024].includes(n)), "constante métier dans structure.ts").toEqual([]);
  });
});

describe("X.1-04 — échanges : IFC (IfcBuildingStorey réels, IfcColumn / IfcBeam / IfcSlab, types partagés), plan, exports 3D, rapport de fidélité", () => {
  const ifc = (d: StudioDocument) => exportStudioIfc(d, { studyName: "Étude", variantName: "Variante", timestamp: "2026-10-26T00:00:00" });
  const lignes = (t: string) => new Map([...t.matchAll(/^#(\d+)=([A-Z0-9]+)\((.*)\);$/gm)].map((m) => [m[1]!, { type: m[2]!, args: m[3]! }]));

  it("un IfcBuildingStorey par niveau (nom, Elevation = cote) en plus du niveau de référence ; chaque élément rattaché contenu dans son étage", () => {
    const l = lignes(ifc(immeuble()));
    const etages = [...l.entries()].filter(([, x]) => x.type === "IFCBUILDINGSTOREY");
    const [reference, rdc, etage1] = ["Niveau de référence", "Rez-de-chaussée", "Étage 1"].map(studioStepString);
    expect(etages.map(([, x]) => x.args.split(",")[2])).toEqual([reference, rdc, etage1]);
    expect(etages.map(([, x]) => x.args.split(",").at(-1))).toEqual(["0.", "0.", "3.2"]);
    const tag = (ref: string) => /'([^']*)',\.[A-Z]+\.$/.exec(l.get(ref.slice(1))!.args)?.[1] ?? /,'([^']*)',[^,]*,[^,]*,[^,]*,[^,]*,[^,]*$/.exec(l.get(ref.slice(1))!.args)?.[1];
    const contenu = new Map(etages.map(([n, x]) => {
      const rel = [...l.values()].find((r) => r.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE" && r.args.endsWith(`,#${n}`));
      return [x.args.split(",")[2], rel ? /\(([^)]*)\),#\d+$/.exec(rel.args)![1]!.split(",").map((r) => tag(r)) : []];
    }));
    expect(contenu.get(rdc)!.sort()).toEqual(["m0", "q0"]);
    expect(contenu.get(etage1)!.sort()).toEqual(["b1", "d1", "e1", "m1", "o1", "p1", "q1"]);
    expect(contenu.get(reference)).toEqual(["q2"]);
    expect(studioIfcSummary(immeuble())).toMatchObject({ storeys: 2, components: { types: 1, occurrences: 3 }, architecture: { columns: 1, beams: 1, slabs: 1 } });
  });

  it("poteau, poutre, dalle → IfcColumn, IfcBeam, IfcSlab (.NOTDEFINED., SweptSolid) ; composant → IfcBuildingElementProxyType à représentation partagée, occurrences IfcMappedItem reliées par IfcRelDefinesByType", () => {
    const l = [...lignes(ifc(immeuble())).values()];
    const n = (t: string) => l.filter((x) => x.type === t).length;
    expect([n("IFCCOLUMN"), n("IFCBEAM"), n("IFCSLAB")]).toEqual([1, 1, 1]);
    for (const t of ["IFCCOLUMN", "IFCBEAM", "IFCSLAB"]) expect(l.find((x) => x.type === t)!.args.endsWith(".NOTDEFINED.")).toBe(true);
    expect(n("IFCBUILDINGELEMENTPROXYTYPE")).toBe(1);
    expect(n("IFCREPRESENTATIONMAP")).toBe(1);
    expect(n("IFCMAPPEDITEM")).toBe(3);
    expect(l.filter((x) => x.type === "IFCSHAPEREPRESENTATION" && x.args.includes("'MappedRepresentation'"))).toHaveLength(3);
    const rel = l.find((x) => x.type === "IFCRELDEFINESBYTYPE")!;
    expect(/\(([^)]*)\)/.exec(rel.args.split("$,$,$,")[1]!)![1]!.split(",")).toHaveLength(3);
    // Les solides de la définition ne sont écrits qu'une fois (représentation partagée, aucune copie par occurrence).
    expect(l.filter((x) => x.type === "IFCEXTRUDEDAREASOLID" && x.args.includes("IFCAXIS2PLACEMENT3D") === false)).toBeDefined();
    expect(l.some((x) => x.type === "IFCPROPERTYSET" && x.args.includes("'Fadi_StudioColumn'"))).toBe(true);
  });

  it("documents sans bâtiment : IFC inchangé (un seul niveau de référence, aucune entité nouvelle)", () => {
    const d = avec(newStudioDocument("ancien"), mur("m"));
    const t = ifc(d);
    expect(t.match(/IFCBUILDINGSTOREY/g)).toHaveLength(1);
    expect(t).not.toMatch(/IFCBUILDINGELEMENTPROXYTYPE|IFCMAPPEDITEM|DeclaredLevels/);
  });

  it("plan SVG / DXF : emprise des poteaux, poutres et dalles tracée ; rapport de fidélité : niveau → étage IFC, occurrences en représentation partagée", () => {
    const d = immeuble();
    const svg = exportStudioSvg(d);
    for (const t of ["column", "beam", "slab"]) expect(svg).toContain(`data-architecture="${t}"`);
    expect(exportStudioDxf(d).match(/POLYLINE/g)!.length).toBeGreaterThan(3);
    const r = studioRapportFidelite(d, "ifc");
    const raisons = new Map(r.lignes.map((x) => [`${x.categorie}.${x.type}`, `${x.statut}:${x.raison}`]));
    expect(raisons.get("niveaux.niveau")).toBe("exact:niveau-en-etage");
    expect(raisons.get("composants.composant")).toBe("exact:type-partage");
    expect(raisons.get("occurrences.occurrence")).toBe("exact:occurrence-partagee");
    expect(raisons.get("architecture.column")).toBe("exact:extrusion-exacte");
    expect(new Map(studioRapportFidelite(d, "svg").lignes.map((x) => [`${x.categorie}.${x.type}`, x.raison])).get("niveaux.niveau")).toBe("niveau-hors-2d");
  });

  it("exports 3D : poteaux, poutres, dalles, échelle et occurrences écrits ; niveaux et définitions comptés, jamais omis en silence", () => {
    const d = immeuble();
    const b = studioBilanExport3d(d, "stl");
    expect(b.nonEcrits).toMatchObject({ niveau: 2, "definition-composant": 1 });
    const pieces = studioPiecesStep(d).pieces.map((p) => [p.nom, p.categorie]);
    for (const [id, c] of [["p1", "structure"], ["b1", "structure"], ["d1", "structure"], ["e1", "echelle"], ["q0", "occurrence"], ["q2", "occurrence"]]) expect(pieces).toContainEqual([id, c]);
  });
});

describe("X.1-04 — suivi des révisions : effets, copie indépendante, comparaison, invalidation des projections", () => {
  it("modifier une définition invalide la projection de ses seules occurrences ; les effets citent la définition et les relations occurrence → définition", () => {
    const d = immeuble();
    const apres = avec(d, definir(composant({ solides: [{ id: "s", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 0.4, depth: 0.4, height: 3 }] })));
    expect(projectionsAInvalider(d, apres).ids).toEqual(["q0", "q1", "q2"]);
    // Maillage incrémental : seules les occurrences sont remaillées, et le résultat est celui du maillage complet.
    const premier = studioMesh3dIncremental(d, null);
    const suivant = studioMesh3dIncremental(apres, premier.cache);
    expect(suivant.remailles).toEqual(["q0", "q1", "q2"]);
    expect(suivant.mesh).toEqual(studioMesh3d(apres));
    expect(premier.mesh).toEqual(studioMesh3d(d));
    const e = studioEffetsCommande(d, apres, [], { revisionBase: "r1", revisionSortie: "r2", source: "test", auteurId: "u", requestId: null });
    expect(e.modifies).toEqual(["k1"]);
    expect(e.domainesInvalides).toEqual(expect.arrayContaining(["maillage-3d", "quantites", "exports"]));
    const avant = studioEffetsCommande(newStudioDocument("w3b"), d, [], { revisionBase: null, revisionSortie: "r1", source: "test", auteurId: "u", requestId: null });
    expect(avant.references.ajoutees).toEqual(expect.arrayContaining([{ de: "q0", vers: "k1", nature: "definition" }, { de: "p1", vers: "n1", nature: "niveau" }]));
  });

  it("copie indépendante : niveaux, définitions et occurrences renumérotés, références niveauId / composantId reportées ; comparaison par famille", () => {
    const d = immeuble();
    const c = studioCopieIndependante(d, "copie", "v2");
    expect(c.document.niveaux!.map((n) => n.id)).toEqual(["n0~v2", "n1~v2"]);
    expect(c.document.occurrences![0]).toMatchObject({ id: "q0~v2", composantId: "k1~v2", niveauId: "n0~v2" });
    expect((c.document.architecture!.find((x) => x.id === "p1~v2") as StudioColumn).niveauId).toBe("n1~v2");
    const cmp = comparerElementsStudio(d, avec(d, niveau("n1", "R+1", 3.2), placer(occurrence("q2", 10))));
    expect(cmp.resume.niveaux).toMatchObject({ modifie: 1 });
    expect(cmp.resume.occurrences).toMatchObject({ modifie: 1 });
    expect(cmp.elements.find((e) => e.id === "n1")!.proprietes).toEqual(["attributs"]);
  });
});
