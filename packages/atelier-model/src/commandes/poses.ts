/**
 * Contraintes verticales (D-155, DA-01-07 « contraintes 3D ») : un objet porté suit l'altitude d'un objet porteur —
 * « posé sur » (sa base au sommet du porteur), « même base », « même sommet ». Relation `pose` (porté → porteur) ;
 * après chaque commande, la base du porté est recalculée (son décalage de base change, rien d'autre) ; le porteur
 * n'est jamais déplacé. Objets portés : dalle (non inclinée), solide fermé à hauteur, toiture plate ; porteurs : en
 * plus, mur et poteau à hauteur connue. Un porté n'a qu'un porteur ; aucun cycle. Un objet supprimé emporte ses
 * contraintes, le porté garde son altitude ; une extrémité absente (relation orpheline) : « à réparer », non suivie.
 */
import { etendueDalle } from "../dalles.js";
import type { ModeleAtelier, OccurrenceQuelconque, Relation } from "../modele.js";
import { etendueMur } from "../projection/maillage.js";
import { effetsVides, ErreurCommande, lire, type ContexteCommande, type Effets, type ResultatCommande } from "./base.js";

export const GENRES_POSE = ["pose-sur", "meme-base", "meme-sommet"] as const;
export type GenrePose = (typeof GENRES_POSE)[number];
type Brut = Record<string, unknown>;

/** Étendue verticale absolue d'un objet et possibilité de le déplacer verticalement (décalage de base). */
export function etendueVerticale(etat: ModeleAtelier, o: OccurrenceQuelconque | undefined): { bas: number; haut: number; mobile: boolean } | null {
  if (!o) return null;
  const z = o.niveauId ? (etat.niveaux[o.niveauId]?.elevation ?? 0) : 0;
  switch (o.classe) {
    case "dalle": {
      if (o.params.pente) return null;
      const e = etendueDalle(o.params);
      return { bas: z + e.bas, haut: z + e.haut, mobile: true };
    }
    case "solide":
      return o.params.ferme && o.params.hauteur ? { bas: z + o.params.decalageBase.value, haut: z + o.params.decalageBase.value + o.params.hauteur.value, mobile: true } : null;
    case "toiture":
      return o.params.type === "plate" ? { bas: z + o.params.decalageBase.value, haut: z + o.params.decalageBase.value + o.params.epaisseur.value, mobile: true } : null;
    case "mur": {
      const e = etendueMur(etat, o);
      return e ? { bas: e[0], haut: e[1], mobile: false } : null;
    }
    case "poteau":
      return o.params.hauteur ? { bas: z, haut: z + o.params.hauteur.value, mobile: false } : null;
    default:
      return null;
  }
}

export const posesDe = (etat: ModeleAtelier) => Object.values(etat.relations).filter((r) => r.kind === "pose");

/** Le porté avec sa base portée à `bas` (absolu) : seul le décalage de base change. */
function avecBase(etat: ModeleAtelier, o: OccurrenceQuelconque, bas: number): OccurrenceQuelconque {
  const z = o.niveauId ? (etat.niveaux[o.niveauId]?.elevation ?? 0) : 0;
  const r9 = (v: number) => Math.round(v * 1e9) / 1e9;
  if (o.classe === "dalle") {
    const ref = o.params.sens === "bas" ? bas - z + o.params.epaisseur.value : bas - z;
    return { ...o, params: { ...o.params, decalageBase: { value: r9(ref), unit: "m" } } };
  }
  if (o.classe === "solide" || o.classe === "toiture") return { ...o, params: { ...o.params, decalageBase: { value: r9(bas - z), unit: "m" } } } as OccurrenceQuelconque;
  return o;
}

/** Base visée du porté selon le genre. */
function baseVisee(genre: GenrePose, porteur: { bas: number; haut: number }, porte: { bas: number; haut: number }): number {
  return genre === "pose-sur" ? porteur.haut : genre === "meme-base" ? porteur.bas : porteur.haut - (porte.haut - porte.bas);
}

/** Recalage des portés (après chaque commande) : dans l'ordre des chaînes, porteurs d'abord. */
export function suivrePoses(etat: ModeleAtelier, effets: Effets): { etat: ModeleAtelier; effets: Effets } {
  const poses = posesDe(etat);
  if (!poses.length) return { etat, effets };
  let courant = etat;
  const modifies: string[] = [];
  let relations = etat.relations;
  // Au plus autant de passes que de relations : les chaînes se propagent sans cycle (refusé à l'ajout).
  for (let passe = 0; passe <= poses.length; passe++) {
    let change = false;
    for (const r of poses) {
      const porte = courant.objets[r.sourceId];
      const porteur = courant.objets[r.targetId];
      const aReparer = !porte || !porteur;
      if (aReparer !== !!r.params["aReparer"] && relations[r.id]) {
        relations = { ...relations, [r.id]: { ...r, params: { ...r.params, ...(aReparer ? { aReparer: true } : {}) } } };
        if (!aReparer) delete (relations[r.id]!.params as Brut)["aReparer"];
      }
      if (aReparer) continue;
      const ep = etendueVerticale(courant, porteur);
      const ed = etendueVerticale(courant, porte);
      if (!ep || !ed || !ed.mobile) continue;
      const cible = baseVisee(r.params["genre"] as GenrePose, ep, ed);
      if (Math.abs(cible - ed.bas) < 1e-9) continue;
      courant = { ...courant, objets: { ...courant.objets, [porte!.id]: avecBase(courant, porte!, cible) } };
      if (!modifies.includes(porte!.id)) modifies.push(porte!.id);
      change = true;
    }
    if (!change) break;
  }
  if (!modifies.length && relations === etat.relations) return { etat, effets };
  return { etat: { ...courant, relations }, effets: { ...effets, modifies: [...new Set([...effets.modifies, ...modifies])] } };
}

export const reducteursPose = {
  ajouter(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
    const genre = lire.enumeration(p, "genre", GENRES_POSE);
    const porteId = lire.chaine(p, "porteId");
    const porteurId = lire.chaine(p, "porteurId");
    if (porteId === porteurId) throw new ErreurCommande("invalide", "porteurId", "un objet ne se porte pas lui-même");
    const porte = etat.objets[porteId];
    const porteur = etat.objets[porteurId];
    if (!porte) throw new ErreurCommande("precondition", "porteId", `objet inconnu : ${porteId}`);
    if (!porteur) throw new ErreurCommande("precondition", "porteurId", `objet inconnu : ${porteurId}`);
    const ed = etendueVerticale(etat, porte);
    if (!ed?.mobile) throw new ErreurCommande("precondition", "porteId", `${porteId} : seuls une dalle non inclinée, un solide fermé à hauteur ou une toiture plate se recalent en altitude`);
    if (!etendueVerticale(etat, porteur)) throw new ErreurCommande("precondition", "porteurId", `${porteurId} : altitude non évaluée (hauteur absente ou forme non prise en charge)`);
    if (posesDe(etat).some((r) => r.sourceId === porteId)) throw new ErreurCommande("precondition", "porteId", `${porteId} a déjà un porteur : retirer d'abord cette contrainte`);
    // Pas de cycle : en remontant les porteurs depuis le porteur, on ne retrouve jamais le porté.
    const porteurDe = new Map(posesDe(etat).map((r) => [r.sourceId, r.targetId]));
    for (let x: string | undefined = porteurId, garde = 0; x && garde < 1000; x = porteurDe.get(x), garde++) if (x === porteId) throw new ErreurCommande("precondition", "porteurId", "cycle de contraintes verticales refusé");
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("pose");
    if (etat.relations[id]) throw new ErreurCommande("precondition", "id", `relation déjà existante : ${id}`);
    const relation: Relation = { id, kind: "pose", sourceId: porteId, targetId: porteurId, params: { genre } };
    const effets = effetsVides();
    effets.crees.push(id);
    const r = suivrePoses({ ...etat, relations: { ...etat.relations, [id]: relation } }, effets);
    return { etat: r.etat, effets: r.effets };
  },
  supprimer(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    if (etat.relations[id]?.kind !== "pose") throw new ErreurCommande("precondition", "id", `contrainte verticale inconnue : ${id}`);
    const relations = { ...etat.relations };
    delete relations[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, relations }, effets };
  },
};
