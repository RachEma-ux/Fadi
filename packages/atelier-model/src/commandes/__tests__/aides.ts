/**
 * Aides des tests de commandes (non exportées par le paquet) : construction d'enveloppes, projet de base,
 * contrôle « application puis inverse = état initial ».
 */
import { expect } from "vitest";
import type { Commande, CommandeDeType, TypeCommande } from "../../contrats/commandes.js";
import { CONTRAT_COMMANDES, type EnveloppeCommandes } from "../../contrats/enveloppe.js";
import type { EtatModele } from "../../contrats/etat.js";
import type { ResultatLot } from "../../contrats/reducteurs.js";
import { VERSION_ONTOLOGIE } from "../../ontologie/descripteurs.js";
import { pointLocal } from "../../ontologie/reperes.js";
import { angle, longueur } from "../../ontologie/unites.js";
import { jsonCanonique } from "../empreinte.js";
import { appliquerLot, etatVide } from "../moteur.js";

export const P = (x: number, y: number) => pointLocal(x, y);
export const m = longueur;
export const deg = angle;

export function cmd<T extends TypeCommande>(type: T, params: CommandeDeType<T>["params"], cibles: readonly string[] = []): Commande {
  return { type, params, cibles } as unknown as Commande;
}

let compteur = 0;
export function enveloppe(etat: EtatModele, commands: readonly Commande[], label = "Essai"): EnveloppeCommandes {
  return { requestId: `req-${++compteur}`, baseRevision: etat.revision, contract: CONTRAT_COMMANDES, label, commands };
}

export function lot(etat: EtatModele, ...commands: Commande[]): ResultatLot {
  return appliquerLot(etat, enveloppe(etat, commands));
}

/** Applique et exige le succès. */
export function ok(etat: EtatModele, ...commands: Commande[]): Extract<ResultatLot, { ok: true }> {
  const r = lot(etat, ...commands);
  if (!r.ok) throw new Error(`lot refusé : ${JSON.stringify(r.erreurs, null, 1)}`);
  return r;
}

/** Applique et exige le refus ; retourne les erreurs. */
export function refus(etat: EtatModele, ...commands: Commande[]) {
  const r = lot(etat, ...commands);
  if (r.ok) throw new Error("lot accepté alors qu'un refus était attendu");
  return r.erreurs;
}

const relationsTriees = (e: EtatModele) => e.relations.map((r) => jsonCanonique(r)).sort();

/**
 * Applique le lot, puis son inverse : l'état revient exactement (empreinte, objets, relations, traces, catalogue).
 * Puis rétablit le lot (rejeu) : même empreinte qu'après la première application.
 */
export function allerRetour(etat: EtatModele, ...commands: Commande[]): Extract<ResultatLot, { ok: true }> {
  const r = ok(etat, ...commands);
  expect(r.etat.revision).toBe(etat.revision + 1);
  expect(r.etat.empreinte).not.toBe(etat.empreinte);
  const retour = ok(r.etat, ...r.inverse);
  expect(retour.etat.empreinte).toBe(etat.empreinte);
  expect(jsonCanonique(retour.etat.objets)).toBe(jsonCanonique(etat.objets));
  expect(relationsTriees(retour.etat)).toEqual(relationsTriees(etat));
  expect([...retour.etat.supprimes].sort()).toEqual([...etat.supprimes].sort());
  expect(jsonCanonique(retour.etat.catalogue)).toBe(jsonCanonique(etat.catalogue));
  const retabli = ok(retour.etat, ...commands);
  expect(retabli.etat.empreinte).toBe(r.etat.empreinte);
  return r;
}

/**
 * Projet de base : niveaux `rdc` (0 m, 3 m) et `r1` (3 m, 3 m), calques `C1` et `CV` (verrouillé),
 * mur `M1` (0,0)→(6,0) avec porte `P1` (t = 0,25), dalle `D1`.
 */
export function projetDeBase(): EtatModele {
  const e = etatVide("p", VERSION_ONTOLOGIE);
  const r = ok(
    e,
    cmd("niveau.creer", { id: "rdc", nom: "Rez", elevation: m(0), hauteur: m(3), ordre: 0 }),
    cmd("niveau.creer", { id: "r1", nom: "Étage", elevation: m(3), hauteur: m(3), ordre: 1 }),
    cmd("calque.creer", { id: "C1", nom: "Murs", couleur: "#336699", visible: true, verrouille: false, ordre: 0 }),
    cmd("calque.creer", { id: "CV", nom: "Verrouillé", couleur: "#999999", visible: true, verrouille: false, ordre: 1 }),
    cmd("mur.tracer", { id: "M1", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(6, 0), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true }),
    cmd("ouverture.poser", { id: "P1", niveauId: "rdc", calqueId: "C1", classe: "porte", murHoteId: "M1", position: { t: 0.25 }, largeur: m(0.9), hauteur: m(2.1), allege: m(0), typeId: "non-type" }),
    cmd("dalle.creer", { id: "D1", niveauId: "rdc", calqueId: "C1", contour: [P(0, 0), P(6, 0), P(6, 4), P(0, 4)], trous: [], epaisseur: m(0.25), decalageBase: m(-0.25) }),
    cmd("mur.tracer", { id: "MV", niveauId: "rdc", calqueId: "CV", a: P(0, 4), b: P(6, 4), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true }),
    cmd("calque.modifier", { modifications: { verrouille: true } }, ["CV"]),
  );
  return r.etat;
}
