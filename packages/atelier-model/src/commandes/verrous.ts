/**
 * Verrous d'objets et de groupes (D-052, fiches DA-05-05, DA-05-12) — pur.
 *
 * - `objet.verrouiller` { ids, verrouille } : verrouille ou libère des objets (aucun objet inconnu accepté).
 * - Après toute autre commande, un objet verrouillé — ou membre d'un groupe verrouillé — qui aurait été modifié ou
 *   supprimé fait refuser la commande, en le nommant : rien n'est appliqué (lot atomique). Une commande qui ne
 *   touche pas l'objet (copie, sélection, objets voisins) reste permise. Les commandes internes (annuler,
 *   rétablir, reprise) ne sont pas concernées : elles restaurent un état déjà validé.
 */
import type { ModeleAtelier, OccurrenceQuelconque } from "../modele.js";
import { ErreurCommande, effetsVides, lire, type ResultatCommande } from "./base.js";

type Brut = Record<string, unknown>;

export function verrouillerObjets(etat: ModeleAtelier, p: Brut): ResultatCommande {
  const ids = p["ids"];
  if (!Array.isArray(ids) || !ids.length || !ids.every((x) => typeof x === "string")) throw new ErreurCommande("invalide", "ids", "« ids » : liste d'identifiants d'objets non vide");
  const verrou = lire.booleen(p, "verrouille", true);
  const objets = { ...etat.objets };
  const effets = effetsVides();
  for (const id of new Set(ids as string[])) {
    const o = objets[id];
    if (!o) throw new ErreurCommande("precondition", "ids", `objet inconnu : ${id}`);
    if ((o.verrouille === true) === verrou) continue;
    const { verrouille: _v, ...reste } = o;
    void _v;
    objets[id] = (verrou ? { ...reste, verrouille: true } : reste) as OccurrenceQuelconque;
    effets.modifies.push(id);
  }
  return { etat: { ...etat, objets }, effets };
}

/** Raison du verrou d'un objet (objet ou groupe), sinon null. */
export function raisonVerrou(etat: ModeleAtelier, o: OccurrenceQuelconque): string | null {
  if (o.verrouille) return "objet verrouillé";
  const g = o.groupeId ? etat.groupes[o.groupeId] : null;
  if (g?.verrouille) return `membre du groupe verrouillé « ${g.nom} »`;
  // Calque gelé (D-103) : ses objets ne se modifient plus tant qu'il n'est pas dégelé.
  const c = o.calqueId ? etat.calques[o.calqueId] : null;
  return c?.gele ? `sur le calque gelé « ${c.nom} »` : null;
}

const egaux = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function controlerVerrous(avant: ModeleAtelier, apres: ModeleAtelier, type: string): void {
  if (type === "objet.verrouiller" || type.startsWith("interne.")) return;
  if (avant.objets === apres.objets) return;
  const groupesVerrouilles = Object.values(avant.groupes).some((g) => g.verrouille);
  const calquesGeles = Object.values(avant.calques).some((c) => c.gele);
  for (const o of Object.values(avant.objets)) {
    if (!o.verrouille && !(groupesVerrouilles && o.groupeId && avant.groupes[o.groupeId]?.verrouille) && !(calquesGeles && o.calqueId && avant.calques[o.calqueId]?.gele)) continue;
    const n = apres.objets[o.id];
    if (n === o || (n && egaux(n, o))) continue;
    const raison = raisonVerrou(avant, o)!;
    throw new ErreurCommande("precondition", "id", `${o.id} : ${raison} — ${n ? "modification" : "suppression"} refusée, ${avant.calques[o.calqueId ?? ""]?.gele && !o.verrouille ? "dégeler le calque" : "le déverrouiller"} d'abord`);
  }
}
