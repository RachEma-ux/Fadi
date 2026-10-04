/**
 * Commandes de contraintes (`contrainte.ajouter`, `.modifier`, `.supprimer`) et contrôle des contraintes après toute
 * autre commande : une modification d'esquisse est résolue en tenant les sommets déplacés ; une transformation qui
 * violerait une contrainte est refusée ; une contrainte dont un objet disparaît passe « à réparer ».
 */
import {
  appliquerSolution,
  contraintesDe,
  raisonNonContraignable,
  resoudreSysteme,
  sommetsDe,
  systeme,
  TYPES_CONTRAINTE,
  MAX_VARIABLES,
  type ParamsContrainte,
  type TypeContrainte,
} from "../contraintes.js";
import type { ModeleAtelier, Occurrence, Relation } from "../modele.js";
import { effetsVides, ErreurCommande, lire, nouveauProbleme, type ContexteCommande, type Effets, type ResultatCommande } from "./base.js";

type Brut = Record<string, unknown>;

const ELEMENTS: Record<TypeContrainte, ["sommet" | "segment", "sommet" | "segment" | null]> = {
  coincidence: ["sommet", "sommet"],
  horizontal: ["segment", null],
  vertical: ["segment", null],
  parallele: ["segment", "segment"],
  perpendiculaire: ["segment", "segment"],
  distance: ["sommet", "sommet"],
};

/** Esquisses (et sommets) touchées par un ensemble de contraintes : composante liée à la contrainte ajoutée. */
function composante(etat: ModeleAtelier, depart: string[]): (Relation & { params: ParamsContrainte })[] {
  const toutes = contraintesDe(etat);
  const vus = new Set(depart);
  let change = true;
  while (change) {
    change = false;
    for (const r of toutes) {
      if (vus.has(r.sourceId) !== vus.has(r.targetId)) {
        vus.add(r.sourceId);
        vus.add(r.targetId);
        change = true;
      }
    }
  }
  return toutes.filter((r) => vus.has(r.sourceId) || vus.has(r.targetId));
}

function degeneres(etat: ModeleAtelier, ids: Iterable<string>): string | null {
  for (const id of ids) {
    const o = etat.objets[id];
    if (o?.classe !== "esquisse") continue;
    const pts = o.params.points;
    for (let i = 0; i + 1 < pts.length; i++) if (Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y) < 1e-6) return id;
  }
  return null;
}

/** Résout la composante liée à `ids` ; lève une erreur explicite en cas de conflit. */
function resoudre(etat: ModeleAtelier, ids: string[], fixes: { id: string; i: number }[] = []): { etat: ModeleAtelier; modifies: string[]; degresDeLiberte: number } {
  const s = systeme(etat, composante(etat, ids), fixes);
  if (s.x.length > 2 * MAX_VARIABLES) throw new ErreurCommande("precondition", "contraintes", `jeu de contraintes trop grand (${s.x.length / 2} sommets liés, ${MAX_VARIABLES} au plus)`);
  if (!s.equations.length) return { etat, modifies: [], degresDeLiberte: s.x.length };
  const r = resoudreSysteme(s);
  if (!r.converge) throw new ErreurCommande("precondition", "contraintes", "contraintes incompatibles : aucune position ne les respecte toutes (conflit)");
  const res = appliquerSolution(etat, s, r.x);
  const d = degeneres(res.etat, new Set([...s.index.keys()].map((k) => k.split("#")[0]!)));
  if (d) throw new ErreurCommande("precondition", "contraintes", `contraintes incompatibles : elles réduiraient un segment de ${d} à une longueur nulle`);
  return { ...res, degresDeLiberte: r.degresDeLiberte };
}

function lireContrainte(etat: ModeleAtelier, p: Brut): { sourceId: string; targetId: string; params: ParamsContrainte } {
  const type = lire.enumeration(p, "type", TYPES_CONTRAINTE);
  const sourceId = lire.chaine(p, "objetA");
  const targetId = lire.chaineOuNull(p, "objetB") ?? sourceId;
  for (const id of new Set([sourceId, targetId])) {
    const raison = raisonNonContraignable(etat, id);
    if (raison) throw new ErreurCommande("precondition", id === sourceId ? "objetA" : "objetB", raison);
  }
  const a = lire.chaine(p, "a");
  const b = lire.chaineOuNull(p, "b");
  const [ka, kb] = ELEMENTS[type];
  const A = etat.objets[sourceId] as Occurrence<"esquisse">;
  const B = etat.objets[targetId] as Occurrence<"esquisse">;
  // Distance : deux sommets, ou un segment seul (longueur).
  const segmentSeul = type === "distance" && a.startsWith("segment") && b === null;
  if (!segmentSeul && !a.startsWith(ka)) throw new ErreurCommande("invalide", "a", `« ${type} » porte sur ${ka === "sommet" ? "un sommet" : "un segment"} : ${a}`);
  if (!sommetsDe(A, a)) throw new ErreurCommande("precondition", "a", `${a} n'existe pas sur ${sourceId}`);
  if (kb && !segmentSeul) {
    if (!b || !b.startsWith(kb)) throw new ErreurCommande("invalide", "b", `« ${type} » demande un second ${kb}`);
    if (!sommetsDe(B, b)) throw new ErreurCommande("precondition", "b", `${b} n'existe pas sur ${targetId}`);
    if (sourceId === targetId && a === b) throw new ErreurCommande("invalide", "b", "contrainte d'un élément avec lui-même");
  }
  let valeur = null;
  if (type === "distance") {
    const v = p["valeur"];
    if (v && typeof v === "object" && (v as { unit?: string }).unit === "deg") throw new ErreurCommande("invalide", "valeur", "unité « ° » refusée pour une distance (mètres attendus)");
    valeur = lire.longueur(p, "valeur", { strict: true });
  }
  return { sourceId, targetId, params: { type, a, b: segmentSeul ? null : b, valeur, pilotante: lire.booleen(p, "pilotante", true), etat: "ok" } };
}

export const reducteursContrainte = {
  ajouter(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
    const c = lireContrainte(etat, p);
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("contrainte");
    if (etat.relations[id]) throw new ErreurCommande("precondition", "id", `identifiant déjà utilisé : ${id}`);
    const relation: Relation = { id, kind: "contrainte", sourceId: c.sourceId, targetId: c.targetId, params: c.params as unknown as Brut };
    const avec: ModeleAtelier = { ...etat, relations: { ...etat.relations, [id]: relation } };
    const effets = effetsVides();
    effets.crees.push(id);
    if (!c.params.pilotante) return { etat: avec, effets }; // cote de contrôle : géométrie inchangée
    // Redondance : la contrainte n'ajoute aucune équation indépendante et est déjà satisfaite.
    const sans = systeme(etat, composante(etat, [c.sourceId, c.targetId]));
    const avecS = systeme(avec, composante(avec, [c.sourceId, c.targetId]));
    const rSans = sans.equations.length ? resoudreSysteme(sans) : null;
    const rAvec = resoudreSysteme(avecS);
    if (rSans && rAvec.converge && rAvec.rang === rSans.rang) throw new ErreurCommande("precondition", "type", "contrainte redondante : elle découle déjà des contraintes existantes");
    const r = resoudre(avec, [c.sourceId, c.targetId]);
    effets.modifies.push(...r.modifies);
    return { etat: r.etat, effets };
  },
  modifier(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    const rel = etat.relations[id];
    if (!rel || rel.kind !== "contrainte") throw new ErreurCommande("precondition", "id", `contrainte inconnue : ${id}`);
    const ancien = rel.params as unknown as ParamsContrainte;
    const c = lireContrainte(etat, { type: ancien.type, objetA: rel.sourceId, objetB: rel.targetId, a: ancien.a, b: ancien.b, valeur: p["valeur"] ?? ancien.valeur, pilotante: p["pilotante"] ?? ancien.pilotante });
    const avec: ModeleAtelier = { ...etat, relations: { ...etat.relations, [id]: { ...rel, params: c.params as unknown as Brut } } };
    const effets = effetsVides();
    effets.modifies.push(id);
    if (!c.params.pilotante) return { etat: avec, effets };
    const r = resoudre(avec, [rel.sourceId, rel.targetId]);
    effets.modifies.push(...r.modifies);
    return { etat: r.etat, effets };
  },
  supprimer(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    const rel = etat.relations[id];
    if (!rel || rel.kind !== "contrainte") throw new ErreurCommande("precondition", "id", `contrainte inconnue : ${id}`);
    const relations = { ...etat.relations };
    delete relations[id];
    const problemes = Object.fromEntries(Object.entries(etat.problemes).filter(([, pb]) => !(pb.type === "reference-a-reparer" && pb.objetId === id)));
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, relations, problemes }, effets };
  },
};

const TRANSFORMATIONS_RIGIDES = /^transformer\.(deplacer|tourner|miroir|echelle|etirer|ajuster|prolonger|decaler|raccorder|chanfreiner)$/;

/**
 * Après une commande (hors contraintes) : contraintes « à réparer » si un objet a disparu ; esquisse modifiée
 * résolue en tenant ses sommets déplacés ; transformation qui violerait une contrainte refusée.
 */
export function controlerContraintes(avant: ModeleAtelier, apres: ModeleAtelier, type: string, effets: Effets, ctx: ContexteCommande): { etat: ModeleAtelier; effets: Effets } {
  if (type.startsWith("contrainte.") || type === "interne.restaurer") return { etat: apres, effets };
  const toutes = contraintesDe(apres);
  if (!toutes.length) return { etat: apres, effets };
  let etat = apres;
  let eff = effets;
  // Objets disparus (suppression, décomposition, scission) : contrainte à réparer, signalée.
  for (const r of toutes) {
    if (r.params.etat === "a-reparer" || (etat.objets[r.sourceId] && etat.objets[r.targetId])) continue;
    const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", r.id, `contrainte ${r.params.type} : l'esquisse ${etat.objets[r.sourceId] ? r.targetId : r.sourceId} n'existe plus — contrainte à réparer ou à supprimer`);
    etat = { ...etat, relations: { ...etat.relations, [r.id]: { ...r, params: { ...r.params, etat: "a-reparer" } as unknown as Brut } }, problemes: { ...etat.problemes, [pb.id]: pb } };
    eff = { ...eff, modifies: [...eff.modifies, r.id], problemes: [...eff.problemes, pb], referencesAReparer: [...eff.referencesAReparer, r.id] };
  }
  const touchees = new Set(eff.modifies.filter((id) => etat.objets[id]?.classe === "esquisse" && toutes.some((r) => r.params.etat === "ok" && (r.sourceId === id || r.targetId === id))));
  if (!touchees.size) return { etat, effets: eff };
  const s = systeme(etat, composante(etat, [...touchees]));
  const ecart = Math.max(0, ...s.equations.map((e) => Math.abs(e(s.x))));
  if (ecart <= 1e-7) return { etat, effets: eff };
  if (TRANSFORMATIONS_RIGIDES.test(type)) throw new ErreurCommande("precondition", "cibles", `cette transformation violerait les contraintes de l'esquisse (${[...touchees].join(", ")}) : supprimez ou modifiez d'abord les contraintes`);
  // Geste sur les sommets : les sommets déplacés sont tenus, le reste suit.
  const fixes: { id: string; i: number }[] = [];
  for (const id of touchees) {
    const a = avant.objets[id];
    const b = etat.objets[id];
    if (a?.classe !== "esquisse" || b?.classe !== "esquisse") continue;
    b.params.points.forEach((p, i) => {
      const q = a.params.points[i];
      if (!q || q.x !== p.x || q.y !== p.y) fixes.push({ id, i });
    });
  }
  const r = resoudre(etat, [...touchees], fixes);
  return { etat: r.etat, effets: { ...eff, modifies: [...new Set([...eff.modifies, ...r.modifies])] } };
}
