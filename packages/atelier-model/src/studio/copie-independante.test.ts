import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { quantitesStudio } from "./quantites.js";
import { studioCopieIndependante, studioIdentitesDocument, studioIdentitesReutilisees } from "./copie-independante.js";

/**
 * TR-EX-013 / TR-INV-003 (ADR-STUDIO-PILOTE-01, P-12) : dérivation d'une variante en copie indépendante — nouvelles
 * identités et provenance, aucune propagation dans un sens ni dans l'autre ; une identité réutilisée est détectée.
 */
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map((c) => c as StudioCommand));
const gele = <T>(v: T): T => { if (v && typeof v === "object") { for (const x of Object.values(v)) gele(x); Object.freeze(v); } return v; };

/** Document de toutes les familles référencées : calque, ligne cotée, mur et ouverture, propriété, solide, scène, apparences. */
const modele = (): StudioDocument => avec(newStudioDocument("src"),
  { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 0.5, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", layerId: "murs", axis: [{ x: 0, y: 4 }, { x: 6, y: 4 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
  { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 } },
  { toolId: "studio.propriete.definir", params: { cibleId: "m1", nom: "Matériau", valeur: "Béton", source: "Saisie d'essai" } },
  { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 8, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } },
  { toolId: "studio.scene.creer", params: { id: "sc1", type: "scene", frame: "local-3d", name: "Vue", camera: { projection: "perspective", position: { x: 10, y: -12, z: 8 }, target: { x: 3, y: 1, z: 1.5 }, fov: 45 }, visibleLayers: ["default", "murs"], displayMode: "shaded-edges" } },
  { toolId: "studio.apparence.definir", params: { id: "ap1", type: "appearance", target: { kind: "object", id: "m1" }, color: "#c0392b" } },
  { toolId: "studio.apparence.definir", params: { id: "ap2", type: "appearance", target: { kind: "layer", id: "murs" }, color: "#2980b9" } },
);

describe("TR-EX-013 / TR-INV-003 — dérivation en copie indépendante : nouvelles identités, provenance, aucune propagation", () => {
  it("TR-INV-003 [+] copie indépendante : chaque élément reçoit une nouvelle identité, la provenance pointe vers sa source, les références internes suivent", () => {
    const source = gele(modele());
    const { document: copie, identites } = studioCopieIndependante(source, "doc-copie", "k7");
    expect(copie.id).toBe("doc-copie");
    expect(studioIdentitesReutilisees(source, copie)).toEqual([]);
    expect(Object.values(identites).sort()).toEqual(studioIdentitesDocument(source).sort());
    for (const [nouveau, ancien] of Object.entries(identites)) expect(nouveau).toBe(`${ancien}~k7`);
    // Références reportées sur les nouvelles identités ; calques inchangés.
    expect(copie.dimensions![0]!.links.start!.objectId).toBe("l1~k7");
    expect(copie.architecture!.find((a) => a.type === "opening")).toMatchObject({ id: "o1~k7", hostId: "m1~k7" });
    expect(copie.proprietes![0]).toMatchObject({ cibleId: "m1~k7" });
    expect(copie.scenes!.find((s) => s.id === "ap1~k7")).toMatchObject({ target: { kind: "object", id: "m1~k7" } });
    expect(copie.scenes!.find((s) => s.id === "ap2~k7")).toMatchObject({ target: { kind: "layer", id: "murs" } });
    expect(copie.layers).toEqual(source.layers);
    expect(copie.objects[0]).toMatchObject({ id: "l1~k7", layerId: "murs" });
    // Même géométrie, mêmes quantités, sous les nouvelles identités.
    const q = (d: StudioDocument, id: string) => quantitesStudio(d).objets.find((o) => o.objetId === id)?.valeurs;
    expect(q(copie, "m1~k7")).toEqual(q(source, "m1"));
    expect(validateStudioDocument(copie)).toEqual(copie);
  });

  it("TR-EX-013 [+] modifier la copie laisse la source inchangée, modifier la source laisse la copie inchangée (aucune propagation)", () => {
    const source = gele(modele());
    const avant = structuredClone(source);
    const { document: copie } = studioCopieIndependante(source, "doc-copie", "k7");
    const copieGelee = structuredClone(copie);
    const copieModifiee = avec(copie, { toolId: "studio.architecture.modifier", params: { ...copie.architecture!.find((a) => a.id === "o1~k7")!, width: 0.8 } }, { toolId: "studio.dessin.supprimer", params: { ids: ["l1~k7"] } });
    expect(source).toEqual(avant);
    expect(copieModifiee.architecture!.find((a) => a.id === "o1~k7")).toMatchObject({ width: 0.8 });
    const sourceModifiee = avec(source, { toolId: "studio.architecture.modifier", params: { ...source.architecture!.find((a) => a.id === "o1")!, width: 1.2 } });
    expect(copie).toEqual(copieGelee);
    expect(sourceModifiee.architecture!.find((a) => a.id === "o1")).toMatchObject({ width: 1.2 });
    // Une commande visant l'ancienne identité est sans prise sur la copie : l'identifiant n'y existe pas.
    expect(() => avec(copie, { toolId: "studio.dessin.supprimer", params: { ids: ["l1"] } })).toThrow();
  });

  it("TR-INV-003 [−] une copie qui réutilise un ancien identifiant dans le nouveau propriétaire est détectée ; un suffixe invalide est refusé", () => {
    const source = modele();
    const fausse = { ...structuredClone(source), id: "doc-fausse" } as StudioDocument;
    expect(studioIdentitesReutilisees(source, fausse).sort()).toEqual(studioIdentitesDocument(source).sort());
    const { document: copie } = studioCopieIndependante(source, "doc-copie", "k7");
    const partielle = { ...copie, objects: [...copie.objects, { ...source.objects[0]! }] } as StudioDocument;
    expect(studioIdentitesReutilisees(source, partielle)).toEqual(["l1"]);
    expect(() => studioCopieIndependante(source, "x", "a b")).toThrow(/suffixe/);
  });

  it("TR-INV-003 [+] une identité nouvelle ne heurte jamais une identité déjà prise (départage), et reste dans la limite de 128 caractères", () => {
    const d = avec(newStudioDocument("d"),
      { toolId: "studio.dessin.ligne", params: { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } },
      { toolId: "studio.dessin.ligne", params: { id: "a~s", type: "line", start: { x: 0, y: 1 }, end: { x: 1, y: 1 } } },
      { toolId: "studio.dessin.ligne", params: { id: "x".repeat(128), type: "line", start: { x: 0, y: 2 }, end: { x: 1, y: 2 } } },
    );
    const { document: copie, identites } = studioCopieIndependante(d, "d2", "s");
    const ids = copie.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id.length <= 128)).toBe(true);
    expect(studioIdentitesReutilisees(d, copie)).toEqual([]);
    expect(Object.keys(identites)).toEqual(ids);
  });
});
