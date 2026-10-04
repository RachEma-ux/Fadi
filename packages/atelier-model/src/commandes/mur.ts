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

/**
 * Scission en plusieurs points (D-043) : `positions` (liste de t, 0 < t < 1, sur le mur d'origine) — scissions
 * successives sur le dernier morceau ; les références « à réparer » proposent tous les morceaux.
 */
function scinderMurPlusieurs(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const id = lire.chaine(p, "id");
  murDe(etat, id);
  const brut = p["positions"] as unknown[];
  if (!brut.length || brut.length > 100 || !brut.every((t) => typeof t === "number" && t > 0 && t < 1)) throw new ErreurCommande("invalide", "positions", "positions : de 1 à 100 nombres t, 0 < t < 1");
  const ts = [...new Set(brut as number[])].sort((x, y) => x - y);
  let courant = etat;
  let reste = id;
  let precedent = 0;
  const morceaux: string[] = [];
  let effets = effetsVides();
  for (const t of ts) {
    const tLocal = (t - precedent) / (1 - precedent);
    const r = scinderMur(courant, { id: reste, t: tLocal }, ctx);
    courant = r.etat;
    const [g, d] = r.effets.crees as [string, string];
    morceaux.push(g);
    reste = d;
    precedent = t;
    effets = {
      ...effets,
      crees: [...effets.crees.filter((x) => !r.effets.supprimes.includes(x)), ...r.effets.crees],
      supprimes: [...effets.supprimes, ...r.effets.supprimes.filter((x) => !effets.crees.includes(x))],
      modifies: [...new Set([...effets.modifies, ...r.effets.modifies])],
      niveauxTouches: [...new Set([...effets.niveauxTouches, ...r.effets.niveauxTouches])],
      problemes: [...effets.problemes, ...r.effets.problemes],
      referencesAReparer: [...new Set([...effets.referencesAReparer, ...r.effets.referencesAReparer])],
    };
  }
  morceaux.push(reste);
  // Les références qui visaient le mur d'origine proposent chacun des morceaux.
  let references = courant.references;
  for (const ref of Object.values(courant.references)) {
    if (ref.etat !== "a-reparer" || !ref.propositions.some((x) => morceaux.includes(x.objetId) || x.objetId === id)) continue;
    const caracteristique = ref.propositions[0]?.caracteristique ?? "axe";
    references = { ...references, [ref.id]: { ...ref, propositions: morceaux.map((m) => ({ objetId: m, caracteristique })) } };
  }
  return { etat: { ...courant, references }, effets };
}

export function scinderMur(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  if (Array.isArray(p["positions"])) return scinderMurPlusieurs(etat, p, ctx);
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
