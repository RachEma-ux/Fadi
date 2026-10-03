/**
 * Commandes propres aux murs : scission (deux nouveaux murs, ouvertures réaffectées, cotations « à réparer »
 * avec propositions) et jonction (l'extrémité la plus proche est amenée sur l'axe de l'autre mur).
 */
import { add, distance, intersectionSegments, mul, projectionSurSegment, sub } from "../geometrie.js";
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque, Reference } from "../modele.js";
import { ouverturesDuMur, referencesVers } from "../modele.js";
import { pt, TOLERANCE_REDUCTEUR } from "../unites.js";
import { ErreurCommande, effetsVides, lire, nouveauProbleme, type ContexteCommande, type ResultatCommande } from "./base.js";

type Brut = Record<string, unknown>;

function murDe(etat: ModeleAtelier, id: string): Occurrence<"mur"> {
  const o = etat.objets[id];
  if (!o || o.classe !== "mur") throw new ErreurCommande("precondition", "id", `mur inconnu : ${id}`);
  return o;
}

export function scinderMur(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const id = lire.chaine(p, "id");
  const mur = murDe(etat, id);
  const calque = mur.calqueId ? etat.calques[mur.calqueId] : null;
  if (calque?.verrouille) throw new ErreurCommande("precondition", "id", `calque verrouillé : ${calque.nom}`);
  const { a, b } = mur.params;
  const longueur = distance(a, b);
  let t = lire.nombre(p, "t", { optionnel: true, min: 0, max: 1 });
  const point = lire.point(p, "point", { optionnel: true });
  if (t === null) {
    if (!point) throw new ErreurCommande("invalide", "t", "indiquer « t » (0 < t < 1) ou « point » sur l'axe");
    const pr = projectionSurSegment(point, a, b);
    if (pr.distance > TOLERANCE_REDUCTEUR * 10) throw new ErreurCommande("precondition", "point", "le point de scission n'est pas sur l'axe du mur");
    t = pr.t;
  }
  if (t * longueur <= TOLERANCE_REDUCTEUR || (1 - t) * longueur <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "t", "scission trop proche d'une extrémité");
  const ouvertures = ouverturesDuMur(etat, id);
  for (const o of ouvertures) {
    const demi = o.params.largeur.value / 2 / longueur;
    if (t > o.params.position - demi - 1e-9 && t < o.params.position + demi + 1e-9) {
      throw new ErreurCommande("precondition", "t", `le point de scission tombe dans l'emprise de ${o.id}`);
    }
  }
  const milieu = add(a, mul(sub(b, a), t));
  const id1 = lire.chaineOuNull(p, "id1") ?? ctx.ids.nouveau("mur");
  const id2 = lire.chaineOuNull(p, "id2") ?? ctx.ids.nouveau("mur");
  const mur1: Occurrence<"mur"> = { ...mur, id: id1, params: { ...mur.params, b: pt(milieu.x, milieu.y) } };
  const mur2: Occurrence<"mur"> = { ...mur, id: id2, params: { ...mur.params, a: pt(milieu.x, milieu.y) } };
  const objets: Record<string, OccurrenceQuelconque> = { ...etat.objets };
  delete objets[id];
  objets[id1] = mur1;
  objets[id2] = mur2;
  const effets = effetsVides();
  effets.crees.push(id1, id2);
  effets.supprimes.push(id);
  if (mur.niveauId) effets.niveauxTouches.push(mur.niveauId);
  for (const o of ouvertures) {
    const dansPremier = o.params.position < t;
    const position = dansPremier ? o.params.position / t : (o.params.position - t) / (1 - t);
    objets[o.id] = { ...o, params: { ...o.params, murHoteId: dansPremier ? id1 : id2, position } } as OccurrenceQuelconque;
    effets.modifies.push(o.id);
  }
  // Relations qui visaient l'ancien mur : retirées (les relations dérivées se recalculent) ; références → à réparer.
  const relations = Object.fromEntries(Object.entries(etat.relations).filter(([, r]) => r.sourceId !== id && r.targetId !== id));
  let references = etat.references;
  let problemes = etat.problemes;
  for (const ref of referencesVers(etat, id)) {
    const propositions = [
      { objetId: id1, caracteristique: ref.caracteristique ?? "axe" },
      { objetId: id2, caracteristique: ref.caracteristique ?? "axe" },
    ];
    const reparee: Reference = { ...ref, etat: "a-reparer", propositions };
    references = { ...references, [ref.id]: reparee };
    const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", ref.proprietaireId, `référence de ${ref.proprietaireId} vers le mur ${id} scindé : choisir ${id1} ou ${id2}`);
    problemes = { ...problemes, [pb.id]: pb };
    effets.problemes.push(pb);
    effets.referencesAReparer.push(ref.id);
  }
  return { etat: { ...etat, objets, relations, references, problemes }, effets };
}

/** Amène l'extrémité de `id` la plus proche de `autreId` sur l'axe (prolongé) de ce dernier ; refus si parallèles. */
export function joindreMurs(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  void ctx;
  const id = lire.chaine(p, "id");
  const autreId = lire.chaine(p, "autreId");
  const mur = murDe(etat, id);
  const autre = murDe(etat, autreId);
  const calque = mur.calqueId ? etat.calques[mur.calqueId] : null;
  if (calque?.verrouille) throw new ErreurCommande("precondition", "id", `calque verrouillé : ${calque.nom}`);
  // Intersection des droites porteuses (segments prolongés).
  const far = 1e6;
  const dA = sub(mur.params.b, mur.params.a);
  const dB = sub(autre.params.b, autre.params.a);
  const x = intersectionSegments(add(mur.params.a, mul(dA, -far)), add(mur.params.b, mul(dA, far)), add(autre.params.a, mul(dB, -far)), add(autre.params.b, mul(dB, far)), 1e-6);
  if (!x) throw new ErreurCommande("precondition", "autreId", "murs parallèles : aucune jonction possible");
  const distA = distance(mur.params.a, x.point);
  const distB = distance(mur.params.b, x.point);
  const params = distA <= distB ? { ...mur.params, a: pt(x.point.x, x.point.y) } : { ...mur.params, b: pt(x.point.x, x.point.y) };
  if (distance(params.a, params.b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "autreId", "la jonction réduirait le mur à une longueur nulle");
  const suivant: Occurrence<"mur"> = { ...mur, params };
  const effets = effetsVides();
  effets.modifies.push(id);
  if (mur.niveauId) effets.niveauxTouches.push(mur.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [id]: suivant } }, effets };
}
