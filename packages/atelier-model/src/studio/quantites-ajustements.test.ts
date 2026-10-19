import { describe, expect, it } from "vitest";
import { newStudioDocument, type StudioDocument } from "./document-2d.js";
import { quantitesStudio } from "./quantites.js";
import {
  appliquerAjustementsEnregistres, controlerSaisieAjustement, etatCibleQuantite, evaluerAjustementsQuantites, jsonCanoniqueQuantites,
  type AjustementQuantiteEnregistre, type CibleAjustementQuantite, type SaisieAjustementQuantite,
} from "./quantites-ajustements.js";
import type { GrandeurQuantite } from "./metre/grandeurs.js";

const doc = (objects: StudioDocument["objects"], patch: Partial<StudioDocument> = {}): StudioDocument => ({ ...newStudioDocument("d"), objects, ...patch });
const ligne = (id: string, x: number, layerId?: string) => ({ id, type: "line" as const, ...(layerId ? { layerId } : {}), start: { x: 0, y: 0 }, end: { x, y: 0 } });
const calques = [{ id: "murs", name: "Murs", visible: true, locked: false }];

let seq = 0;
/** Ajustement tel que le serveur l'enregistre : état de la cible calculé sur la révision `d`. */
function enregistre(d: StudioDocument, cible: CibleAjustementQuantite, grandeur: GrandeurQuantite, valeur: number | null, motif = "Relevé"): AjustementQuantiteEnregistre {
  const q = quantitesStudio(d);
  const e = etatCibleQuantite(d, q, cible, grandeur);
  if ("refus" in e) throw new Error(e.refus);
  seq += 1;
  return { id: `a${seq}`, sequence: seq, revisionId: `r-${d.objects.length}`, cible, grandeur, unite: grandeur === "surface" ? "m2" : "m", valeur, motif, derivee: e.derivee, etatCible: JSON.parse(JSON.stringify(e.etat)), auteur: "u1", auteurEmail: "a@example.test", date: "2026-10-19T10:00:00.000Z" };
}

describe("ajustements de quantités enregistrés (E.3-05)", () => {
  const d1 = doc([ligne("l1", 4, "murs"), ligne("l2", 6, "murs"), ligne("l3", 2)], { layers: calques });
  const q1 = quantitesStudio(d1);

  it("saisie : unité cohérente, valeur positive, motif obligatoire, cible objet ou calque existante", () => {
    const ok: SaisieAjustementQuantite = { cible: { type: "objet", id: "l1" }, grandeur: "longueur", unite: "m", valeur: 4.2, motif: "Relevé" };
    expect(controlerSaisieAjustement(d1, q1, ok)).toBeNull();
    expect(controlerSaisieAjustement(d1, q1, { ...ok, unite: "m2" })).toBe("unite-incoherente");
    expect(controlerSaisieAjustement(d1, q1, { ...ok, valeur: -1 })).toBe("valeur-invalide");
    expect(controlerSaisieAjustement(d1, q1, { ...ok, valeur: Number.NaN })).toBe("valeur-invalide");
    expect(controlerSaisieAjustement(d1, q1, { ...ok, motif: "  " })).toBe("motif-obligatoire");
    expect(controlerSaisieAjustement(d1, q1, { ...ok, motif: "x".repeat(2001) })).toBe("motif-trop-long");
    expect(controlerSaisieAjustement(d1, q1, { ...ok, cible: { type: "objet", id: "absent" } })).toBe("objet-inconnu");
    expect(controlerSaisieAjustement(d1, q1, { ...ok, grandeur: "surface", unite: "m2" })).toBe("grandeur-non-applicable");
    expect(controlerSaisieAjustement(d1, q1, { ...ok, cible: { type: "calque", id: "murs" } })).toBeNull();
    expect(controlerSaisieAjustement(d1, q1, { ...ok, cible: { type: "calque", id: "inconnu" } })).toBe("calque-inconnu");
    expect(controlerSaisieAjustement(d1, q1, { ...ok, cible: { type: "calque", id: "murs" }, grandeur: "hauteur" })).toBe("grandeur-non-cumulable");
    expect(controlerSaisieAjustement(d1, q1, { ...ok, valeur: null })).toBeNull();
  });

  it("brute jamais remplacée : brute, écart et ajustée montrés ; totaux retenus", () => {
    const a = enregistre(d1, { type: "objet", id: "l1" }, "longueur", 4.5);
    const r = appliquerAjustementsEnregistres(q1, evaluerAjustementsQuantites(d1, q1, [a]));
    const v = r.objets.find((o) => o.objetId === "l1")!.valeurs[0]!;
    expect(v).toMatchObject({ derivee: 4, valeur: 4, ajustee: 4.5, retenue: 4.5, ecart: 0.5 });
    expect(v.enregistre?.id).toBe(a.id);
    expect(v.ajustement?.auteur).toBe("a@example.test");
    expect(r.calques.find((c) => c.calqueId === "murs")!.totaux.find((t) => t.grandeur === "longueur")).toMatchObject({ valeur: 10, retenue: 10.5, ajustes: 1 });
    expect(r.totaux.find((t) => t.grandeur === "longueur")).toMatchObject({ valeur: 12, retenue: 12.5 });
  });

  it("révision suivante, cible inchangée : toujours en vigueur ; cible modifiée : « à revoir », jamais appliqué", () => {
    const a = enregistre(d1, { type: "objet", id: "l1" }, "longueur", 4.5);
    // Une autre ligne change : l1 reste identique.
    const d2 = doc([ligne("l1", 4, "murs"), ligne("l2", 7, "murs"), ligne("l3", 2)], { layers: calques });
    const e2 = evaluerAjustementsQuantites(d2, quantitesStudio(d2), [a]);
    expect(e2.journal.map((l) => l.statut)).toEqual(["en-vigueur"]);
    // l1 est allongée : l'ajustement saisi sur l'ancienne révision est à revoir.
    const d3 = doc([ligne("l1", 5, "murs"), ligne("l2", 6, "murs"), ligne("l3", 2)], { layers: calques });
    const q3 = quantitesStudio(d3);
    const e3 = evaluerAjustementsQuantites(d3, q3, [a]);
    expect(e3.journal).toEqual([{ ajustement: a, statut: "a-revoir", revue: "cible-modifiee" }]);
    const r3 = appliquerAjustementsEnregistres(q3, e3);
    const v = r3.objets.find((o) => o.objetId === "l1")!.valeurs[0]!;
    expect(v).toMatchObject({ derivee: 5, retenue: 5 });
    expect(v.ajustee).toBeUndefined();
    expect(v.aRevoir?.id).toBe(a.id);
    // Objet déplacé sans changer de longueur : l'objet a changé, l'ajustement est à revoir aussi.
    const d4 = doc([{ ...ligne("l1", 4, "murs"), start: { x: 1, y: 0 }, end: { x: 5, y: 0 } }, ligne("l2", 6, "murs"), ligne("l3", 2)], { layers: calques });
    expect(evaluerAjustementsQuantites(d4, quantitesStudio(d4), [a]).journal[0]!.statut).toBe("a-revoir");
    // Objet supprimé : à revoir (cible absente).
    const d5 = doc([ligne("l2", 6, "murs")], { layers: calques });
    expect(evaluerAjustementsQuantites(d5, quantitesStudio(d5), [a]).journal[0]).toMatchObject({ statut: "a-revoir", revue: "cible-absente" });
  });

  it("le dernier ajustement d'une cible compte ; un plus ancien est remplacé, même si le dernier est à revoir", () => {
    const a1 = enregistre(d1, { type: "objet", id: "l1" }, "longueur", 4.5);
    const d2 = doc([ligne("l1", 5, "murs"), ligne("l2", 6, "murs"), ligne("l3", 2)], { layers: calques });
    const a2 = enregistre(d2, { type: "objet", id: "l1" }, "longueur", 5.5);
    // Sur la révision d'origine de a1, a2 (saisi sur une autre géométrie) est à revoir ; a1 n'est pas réappliqué.
    const e = evaluerAjustementsQuantites(d1, q1, [a2, a1]);
    expect(e.journal.map((l) => [l.ajustement.id, l.statut])).toEqual([[a1.id, "remplace"], [a2.id, "a-revoir"]]);
    expect(e.objets).toEqual([]);
    // Retour à la valeur brute : en vigueur, aucune valeur ajustée.
    const a3 = enregistre(d2, { type: "objet", id: "l1" }, "longueur", null, "Erreur de saisie");
    const r = appliquerAjustementsEnregistres(quantitesStudio(d2), evaluerAjustementsQuantites(d2, quantitesStudio(d2), [a1, a2, a3]));
    const v = r.objets.find((o) => o.objetId === "l1")!.valeurs[0]!;
    expect(v).toMatchObject({ derivee: 5, retenue: 5, ecart: 0 });
    expect(v.ajustee).toBeUndefined();
    expect(v.enregistre?.id).toBe(a3.id);
  });

  it("ajustement d'un total de calque : remplace le total retenu, décale le total général, à revoir si un objet du calque change", () => {
    const a = enregistre(d1, { type: "calque", id: "murs" }, "longueur", 11);
    const e = evaluerAjustementsQuantites(d1, q1, [a]);
    const r = appliquerAjustementsEnregistres(q1, e);
    expect(r.calques.find((c) => c.calqueId === "murs")!.totaux.find((t) => t.grandeur === "longueur")).toMatchObject({ valeur: 10, retenue: 11, ajusteeCalque: 11, ecart: 1 });
    expect(r.totaux.find((t) => t.grandeur === "longueur")).toMatchObject({ valeur: 12, retenue: 13, ecart: 1 });
    // Vue filtrée par nature : un total de calque ne vaut que pour le calque entier.
    const filtre = appliquerAjustementsEnregistres(q1, e, { calques: false });
    expect(filtre.calques.find((c) => c.calqueId === "murs")!.totaux.find((t) => t.grandeur === "longueur")).toMatchObject({ retenue: 10 });
    expect(filtre.calquesAppliques).toBe(false);
    // Un objet hors calque change : toujours en vigueur ; un objet du calque change : à revoir.
    const d2 = doc([ligne("l1", 4, "murs"), ligne("l2", 6, "murs"), ligne("l3", 3)], { layers: calques });
    expect(evaluerAjustementsQuantites(d2, quantitesStudio(d2), [a]).journal[0]!.statut).toBe("en-vigueur");
    const d3 = doc([ligne("l1", 4, "murs"), ligne("l2", 8, "murs"), ligne("l3", 2)], { layers: calques });
    const q3 = quantitesStudio(d3);
    const r3 = appliquerAjustementsEnregistres(q3, evaluerAjustementsQuantites(d3, q3, [a]));
    expect(r3.calques.find((c) => c.calqueId === "murs")!.totaux.find((t) => t.grandeur === "longueur")).toMatchObject({ valeur: 12, retenue: 12 });
    expect(r3.calques.find((c) => c.calqueId === "murs")!.totaux.find((t) => t.grandeur === "longueur")!.aRevoirCalque?.id).toBe(a.id);
    // Le nom du calque ne change aucune quantité : pas à revoir.
    const d4 = doc(d1.objects, { layers: [{ ...calques[0]!, name: "Murs porteurs", visible: false }] });
    expect(evaluerAjustementsQuantites(d4, quantitesStudio(d4), [a]).journal[0]!.statut).toBe("en-vigueur");
  });

  it("brute non évaluée : ajustée retenue, écart non évalué", () => {
    const d = doc([{ ...ligne("v", 4), extrusion: { base: 0, height: 3 } }]);
    const q = quantitesStudio(d);
    const a = enregistre(d, { type: "objet", id: "v" }, "volume", 1.2);
    const v = appliquerAjustementsEnregistres(q, evaluerAjustementsQuantites(d, q, [a])).objets[0]!.valeurs.find((x) => x.grandeur === "volume")!;
    expect(v).toMatchObject({ derivee: null, ajustee: 1.2, retenue: 1.2, ecart: null });
    expect(a.derivee).toBeNull();
  });

  it("état de cible : JSON canonique stable après un aller-retour de stockage (ordre des clés indifférent)", () => {
    const e = etatCibleQuantite(d1, q1, { type: "objet", id: "l1" }, "longueur");
    if ("refus" in e) throw new Error(e.refus);
    const inverse = (v: unknown): unknown => Array.isArray(v) ? v.map(inverse) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, inverse(x)])) : v;
    expect(jsonCanoniqueQuantites(e.etat)).toBe(jsonCanoniqueQuantites(inverse(JSON.parse(JSON.stringify(e.etat)))));
    expect(jsonCanoniqueQuantites({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe('{"a":[2,{"d":3}],"b":1}');
  });
});
