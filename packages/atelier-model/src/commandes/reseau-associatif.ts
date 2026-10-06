/**
 * Réseau associatif (D-115, DA-02-12) : un réseau rectangulaire (pas dx, dy) ou polaire (centre, angle) créé avec
 * `associatif` garde ses paramètres dans un groupe qui réunit ses copies ; `reseau.modifier` change le nombre ou le
 * pas et recalcule les copies depuis l'état courant des sources (anciennes copies supprimées, nouvelles créées, un
 * lot) ; `reseau.dissocier` retire les paramètres (les copies restent, groupées). Une source supprimée rend le réseau
 * non recalculable (refus motivé), jamais réinventé.
 */
import type { Groupe, ModeleAtelier, OccurrenceQuelconque, ParametresReseau } from "../modele.js";
import type { Transformation } from "../geometrie.js";
import { ErreurCommande, effetsVides, fusionnerEffets, lire, type ContexteCommande, type Effets, type ResultatCommande } from "./base.js";
import { supprimerIds } from "./objets.js";

type Brut = Record<string, unknown>;
type Copier = (etat: ModeleAtelier, sel: OccurrenceQuelconque[], t: Transformation, ctx: ContexteCommande) => ResultatCommande;

/** Copies d'un réseau selon ses paramètres, depuis l'état courant des sources. */
export function genererReseau(etat: ModeleAtelier, r: ParametresReseau, ctx: ContexteCommande, copier: Copier): { etat: ModeleAtelier; effets: Effets; copies: string[] } {
  const sel = r.sources.map((id) => etat.objets[id]);
  const absente = r.sources.find((_, i) => !sel[i]);
  if (absente) throw new ErreurCommande("precondition", "groupeId", `source du réseau supprimée (${absente}) : réseau non recalculable, le dissocier`);
  let courant = etat;
  let effets = effetsVides();
  for (let i = 1; i <= r.nombre; i++) {
    const t: Transformation = r.centre ? { type: "rotation", centre: r.centre, angleDeg: (r.angle ?? 0) * i } : { type: "translation", dx: (r.dx ?? 0) * i, dy: (r.dy ?? 0) * i };
    const x = copier(courant, sel as OccurrenceQuelconque[], t, ctx);
    courant = x.etat;
    effets = fusionnerEffets(effets, x.effets);
  }
  return { etat: courant, effets, copies: [...effets.crees] };
}

/** Rattache les copies au groupe du réseau (créé ou mis à jour). */
export function grouperReseau(etat: ModeleAtelier, groupe: Groupe, copies: readonly string[]): ModeleAtelier {
  const objets = { ...etat.objets };
  for (const id of copies) if (objets[id]) objets[id] = { ...objets[id]!, groupeId: groupe.id } as OccurrenceQuelconque;
  return { ...etat, objets, groupes: { ...etat.groupes, [groupe.id]: groupe } };
}

export function lireParametresReseau(p: Brut, sources: string[], base?: ParametresReseau): ParametresReseau {
  const nombre = p["nombre"] === undefined && base ? base.nombre : lire.nombre(p, "nombre", { entier: true, min: 1, max: 500 })!;
  const centre = p["centre"] === undefined ? (base?.centre ?? null) : lire.point(p, "centre", { optionnel: true });
  if (centre) {
    const angle = p["angle"] === undefined && base?.angle !== undefined ? base.angle : lire.angle(p, "angle")!.value;
    return { sources, nombre, centre, angle };
  }
  const dx = p["dx"] === undefined && base?.dx !== undefined ? base.dx : lire.nombre(p, "dx")!;
  const dy = p["dy"] === undefined && base?.dy !== undefined ? base.dy : lire.nombre(p, "dy")!;
  if (Math.hypot(dx, dy) < 1e-9) throw new ErreurCommande("invalide", "dx", "pas nul : les copies se superposeraient");
  return { sources, nombre, dx, dy };
}

export function modifierReseau(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, copier: Copier): ResultatCommande {
  const id = lire.chaine(p, "groupeId");
  const g = etat.groupes[id];
  if (!g?.reseau) throw new ErreurCommande("precondition", "groupeId", `groupe ${id} : pas un réseau associatif`);
  if (g.verrouille) throw new ErreurCommande("precondition", "groupeId", `réseau « ${g.nom} » verrouillé`);
  const params = lireParametresReseau(p, g.reseau.sources, g.reseau);
  // Anciennes copies retirées (celles qui existent encore), puis nouvelles copies depuis les sources actuelles.
  const anciennes = g.reseau.copies.filter((c) => etat.objets[c]);
  let courant = etat;
  let effets = effetsVides();
  if (anciennes.length) {
    const r = supprimerIds(courant, anciennes, ctx);
    courant = r.etat;
    effets = fusionnerEffets(effets, r.effets);
  }
  const gen = genererReseau(courant, params, ctx, copier);
  const groupe: Groupe = { ...g, nom: nomReseau(params), reseau: { ...params, copies: gen.copies } };
  courant = grouperReseau(gen.etat, groupe, gen.copies);
  effets = fusionnerEffets(effets, gen.effets);
  effets.modifies.push(id);
  return { etat: courant, effets };
}

export function dissocierReseau(etat: ModeleAtelier, p: Brut): ResultatCommande {
  const id = lire.chaine(p, "groupeId");
  const g = etat.groupes[id];
  if (!g?.reseau) throw new ErreurCommande("precondition", "groupeId", `groupe ${id} : pas un réseau associatif`);
  const { reseau: _r, ...reste } = g;
  void _r;
  const effets = effetsVides();
  effets.modifies.push(id);
  return { etat: { ...etat, groupes: { ...etat.groupes, [id]: reste } }, effets };
}

export const nomReseau = (r: ParametresReseau): string =>
  r.centre ? `Réseau polaire (${r.nombre} × ${String(r.angle).replace(".", ",")}°)` : `Réseau (${r.nombre} × ${String(r.dx).replace(".", ",")} ; ${String(r.dy).replace(".", ",")} m)`;
