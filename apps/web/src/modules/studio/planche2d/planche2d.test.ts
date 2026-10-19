/** Logique pure de la planche 2D : brouillon (annuler / rétablir, enveloppe), accrochage, cotes, calques, cadrage. */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, measureStudioDimension, newStudioDocument, StudioValidationError, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { annulerBrouillon, appliquerBrouillon, commandesEnAttente, creerBrouillon, documentBrouillon, enveloppeBrouillon, messageRefus, peutAnnuler, peutRetablir, retablirBrouillon } from "./brouillon";
import { commandeReglage, estSelectionnable, estVisible, layerIdPour, listeCalques, prochainNomCalque } from "./calques";
import { accrocher, CADRE_INITIAL, cadrer, emprise, formaterMetres, nouvelleCote, pointsAccroche, sommetExact, traceCote, valeurCote } from "./geometrie-2d";

const ligne = (id: string, x1: number, y1: number, x2: number, y2: number, layerId?: string): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", ...(layerId ? { layerId } : {}), start: { x: x1, y: y1 }, end: { x: x2, y: y2 } } });
const base = (): StudioDocument => newStudioDocument("doc-1");

describe("brouillon local", () => {
  it("applique, annule et rétablit par lots ; les commandes en attente suivent", () => {
    let b = creerBrouillon(base());
    expect(peutAnnuler(b)).toBe(false);
    b = appliquerBrouillon(b, [ligne("l1", 0, 0, 4, 0)]);
    b = appliquerBrouillon(b, [{ toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: 0 } }]);
    expect(commandesEnAttente(b)).toHaveLength(2);
    expect(documentBrouillon(b).objects[0]).toMatchObject({ start: { x: 1, y: 0 } });
    b = annulerBrouillon(b);
    expect(commandesEnAttente(b)).toEqual([ligne("l1", 0, 0, 4, 0)]);
    expect(documentBrouillon(b).objects[0]).toMatchObject({ start: { x: 0, y: 0 } });
    expect(peutRetablir(b)).toBe(true);
    b = retablirBrouillon(b);
    expect(commandesEnAttente(b)).toHaveLength(2);
    // Le document local est exactement celui que le serveur calculera à partir des mêmes commandes.
    expect(applyStudioCommands(base(), commandesEnAttente(b))).toEqual(documentBrouillon(b));
    b = annulerBrouillon(annulerBrouillon(b));
    expect(commandesEnAttente(b)).toEqual([]);
    expect(peutAnnuler(b)).toBe(false);
    expect(annulerBrouillon(b)).toBe(b);
  });

  it("un nouveau lot abandonne le futur ; un lot refusé laisse le brouillon intact", () => {
    let b = appliquerBrouillon(creerBrouillon(base()), [ligne("l1", 0, 0, 4, 0)]);
    b = appliquerBrouillon(annulerBrouillon(b), [ligne("l2", 0, 1, 4, 1)]);
    expect(peutRetablir(b)).toBe(false);
    const avant = b;
    expect(() => appliquerBrouillon(b, [ligne("l2", 0, 0, 1, 1)])).toThrow(StudioValidationError);
    expect(b).toBe(avant);
  });

  it("l'enveloppe porte toutes les commandes en attente sur la tête chargée", () => {
    const b = appliquerBrouillon(appliquerBrouillon(creerBrouillon(base()), [ligne("l1", 0, 0, 4, 0)]), [ligne("l2", 0, 1, 4, 1)]);
    expect(enveloppeBrouillon(b, "rev-1", "req-1")).toEqual({ contractVersion: "studio-commands/1", requestId: "req-1", baseRevisionId: "rev-1", commands: [ligne("l1", 0, 0, 4, 0), ligne("l2", 0, 1, 4, 1)] });
  });

  it("messages de refus lisibles, jamais le message technique", () => {
    expect(messageRefus(new StudioValidationError("commands[0]", "calque verrouillé"))).toBe("Calque verrouillé : modification refusée.");
    expect(messageRefus(new Error("x"))).toBe("Géométrie invalide. Vérifiez les valeurs saisies.");
  });
});

describe("accrochage et cotes associatives", () => {
  const doc = applyStudioCommands(base(), [ligne("l1", 0, 0, 4, 0), { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 5, y: 5 }, width: 2, height: 1 } }]);
  const sommets = pointsAccroche(doc.objects, () => true);

  it("sommets nommés : extrémités et milieu de ligne, quatre coins de rectangle", () => {
    expect(sommets).toHaveLength(7);
    expect(accrocher(sommets, { x: 3.95, y: 0.04 }, 0.1)).toMatchObject({ objectId: "l1", anchor: "end", point: { x: 4, y: 0 } });
    expect(accrocher(sommets, { x: 2, y: 0.05 }, 0.1)).toMatchObject({ objectId: "l1", anchor: "mid", point: { x: 2, y: 0 } });
    expect(accrocher(sommets, { x: 1, y: 0 }, 0.1)).toBeNull();
    expect(accrocher(sommets, { x: 7.02, y: 6 }, 0.1)).toMatchObject({ objectId: "r1", anchor: "corner-opposite" });
    expect(sommetExact(sommets, { x: 0, y: 0 })).toMatchObject({ anchor: "start" });
    expect(pointsAccroche(doc.objects, (l) => l !== undefined)).toEqual([]);
  });

  it("une cote accrochée est liée, suit l'objet déplacé et passe « à résoudre » à sa suppression", () => {
    const debut = accrocher(sommets, { x: 0.02, y: 0 }, 0.1), fin = accrocher(sommets, { x: 4, y: 0.03 }, 0.1);
    const cote = nouvelleCote("c1", { point: { x: 0.02, y: 0 }, accroche: debut }, { point: { x: 4, y: 0.03 }, accroche: fin }, 0.5);
    expect(cote).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false });
    let d = applyStudioCommands(doc, [{ toolId: "studio.dessin.cote", params: cote }]);
    expect(valeurCote(d.dimensions![0]!)).toBe(measureStudioDimension(d, "c1")!.value);
    expect(formaterMetres(valeurCote(d.dimensions![0]!)!, "fr-FR")).toBe("4,00 m");
    expect(formaterMetres(1.2345, "en-GB")).toBe("1.235 m");
    d = applyStudioCommands(d, [{ toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: 2 } }]);
    expect(d.dimensions![0]).toMatchObject({ start: { x: 1, y: 2 }, end: { x: 5, y: 2 } });
    d = applyStudioCommands(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["l1"] } }]);
    expect(d.dimensions![0]!.toResolve).toBe(true);
    expect(valeurCote(d.dimensions![0]!)).toBeNull();
    expect(measureStudioDimension(d, "c1")!.value).toBeNull();
  });

  it("une cote libre n'a aucun lien ; le tracé est décalé selon la normale à gauche", () => {
    const cote = nouvelleCote("c2", { point: { x: 1, y: 1 }, accroche: null }, { point: { x: 3, y: 1 }, accroche: null }, 0.5, "calque-a");
    expect(cote.links).toEqual({ start: null, end: null });
    expect(cote.layerId).toBe("calque-a");
    const g = traceCote(cote);
    expect(g.a).toEqual({ x: 1, y: 1.5 });
    expect(g.b).toEqual({ x: 3, y: 1.5 });
    expect(g.angle).toBe(0);
    expect(traceCote({ start: { x: 3, y: 0 }, end: { x: 0, y: 0 }, offset: 0 }).angle).toBe(0);
  });
});

describe("calques", () => {
  it("le calque implicite est listé, matérialisé seulement quand on le règle", () => {
    const doc = base();
    expect(listeCalques(doc)).toEqual([{ id: "default", name: "Calque par défaut", visible: true, locked: false, implicite: true }]);
    const reglage = commandeReglage(doc, { id: "default", name: "Calque par défaut", visible: false, locked: false });
    expect(reglage.toolId).toBe("studio.calque.creer");
    const masque = applyStudioCommands(applyStudioCommands(doc, [ligne("l1", 0, 0, 1, 0)]), [reglage]);
    expect(estVisible(masque, undefined)).toBe(false);
    expect(listeCalques(masque)).toHaveLength(1);
    expect(commandeReglage(masque, { id: "default", name: "Fond", visible: true, locked: false }).toolId).toBe("studio.calque.modifier");
  });

  it("visible, verrouillé, sélectionnable ; nom proposé ; layerId du calque actif", () => {
    const doc = applyStudioCommands(base(), [
      { toolId: "studio.calque.creer", params: { id: "a", name: "Calque 1", visible: true, locked: true } },
      { toolId: "studio.calque.creer", params: { id: "b", name: "Calque 3", visible: false, locked: false } },
    ]);
    expect(estVisible(doc, "a")).toBe(true);
    expect(estSelectionnable(doc, "a")).toBe(false);
    expect(estSelectionnable(doc, "b")).toBe(false);
    expect(estSelectionnable(doc, undefined)).toBe(true);
    expect(estSelectionnable(doc, "inconnu")).toBe(false);
    expect(prochainNomCalque(doc)).toBe("Calque 4");
    expect(layerIdPour("default")).toBeUndefined();
    expect(layerIdPour("a")).toBe("a");
  });
});

describe("cadrage", () => {
  it("cadre l'emprise visible au rapport de la planche, sinon le cadre initial", () => {
    expect(cadrer(null)).toEqual(CADRE_INITIAL);
    const doc = applyStudioCommands(base(), [ligne("l1", 0, 0, 40, 0), { toolId: "studio.calque.creer", params: { id: "m", name: "M", visible: false, locked: false } }, ligne("l2", 100, 100, 200, 100, "m")]);
    const e = emprise(doc, (l) => estVisible(doc, l));
    expect(e).toEqual({ min: { x: 0, y: 0 }, max: { x: 40, y: 0 } });
    const c = cadrer(e);
    expect(c.w / c.h).toBeCloseTo(CADRE_INITIAL.w / CADRE_INITIAL.h);
    expect(c.x).toBeLessThan(0);
    expect(c.x + c.w).toBeGreaterThan(40);
  });
});
