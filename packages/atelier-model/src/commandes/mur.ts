/**
 * Commandes propres aux murs : scission (deux nouveaux murs, ouvertures réaffectées, cotations « à réparer »
 * avec propositions) et jonction (l'extrémité la plus proche est amenée sur l'axe de l'autre mur).
 */
import { add, centreRenflement, distance, intersectionSegments, mul, normalise, projectionSurSegment, sub, type Vec } from "../geometrie.js";
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
  if (murDe(etat, id).params.renflement) throw new ErreurCommande("precondition", "id", `${id} : mur courbe, scission non prise en charge`);
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
  if (mur.params.renflement) throw new ErreurCommande("precondition", "id", `${id} : mur courbe, scission non prise en charge`);
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

/**
 * Jonction avec un mur courbe (D-105) : l'extrémité de `mur` la plus proche est portée sur l'axe de `autre` (droite
 * prolongée, ou cercle entier d'un mur courbe). Un mur droit est prolongé ou raccourci ; un mur courbe glisse le long
 * de son cercle (même centre, même rayon, renflement recalculé ; demi-cercle au plus).
 */
function joindreCourbe(etat: ModeleAtelier, mur: Occurrence<"mur">, autre: Occurrence<"mur">): ResultatCommande {
  type Porteuse = { type: "droite"; p: Vec; u: Vec } | { type: "cercle"; c: Vec; r: number };
  const porteuse = (m: Occurrence<"mur">): Porteuse => {
    if (!m.params.renflement) return { type: "droite", p: m.params.a, u: normalise(sub(m.params.b, m.params.a)) };
    const c = centreRenflement(m.params.a, m.params.b, m.params.renflement);
    return { type: "cercle", c, r: distance(m.params.a, c) };
  };
  const inter = (k1: Porteuse, k2: Porteuse): Vec[] => {
    if (k1.type === "droite" && k2.type === "droite") {
      const den = k1.u.x * k2.u.y - k1.u.y * k2.u.x;
      if (Math.abs(den) < 1e-12) return [];
      const w = sub(k2.p, k1.p);
      return [add(k1.p, mul(k1.u, (w.x * k2.u.y - w.y * k2.u.x) / den))];
    }
    if (k1.type === "cercle" && k2.type === "droite") return inter(k2, k1);
    if (k1.type === "droite" && k2.type === "cercle") {
      const w = sub(k1.p, k2.c);
      const B = w.x * k1.u.x + w.y * k1.u.y;
      const D = B * B - (w.x * w.x + w.y * w.y - k2.r * k2.r);
      if (D < 0) return [];
      return [-B - Math.sqrt(D), -B + Math.sqrt(D)].map((t) => add(k1.p, mul(k1.u, t)));
    }
    const c1 = k1 as { c: Vec; r: number };
    const c2 = k2 as { c: Vec; r: number };
    const d = distance(c1.c, c2.c);
    if (d < 1e-12 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return [];
    const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
    const u = mul(sub(c2.c, c1.c), 1 / d);
    const m0 = add(c1.c, mul(u, a));
    return [add(m0, { x: -u.y * h, y: u.x * h }), add(m0, { x: u.y * h, y: -u.x * h })];
  };
  const candidats = inter(porteuse(mur), porteuse(autre));
  if (!candidats.length) throw new ErreurCommande("precondition", "autreId", "les axes ne se rencontrent pas : aucune jonction possible");
  let choix: { bout: "a" | "b"; x: Vec; d: number } | null = null;
  for (const x of candidats) for (const bout of ["a", "b"] as const) {
    const d = distance(mur.params[bout], x);
    if (!choix || d < choix.d) choix = { bout, x, d };
  }
  const x = pt(Math.round(choix!.x.x * 1e9) / 1e9, Math.round(choix!.x.y * 1e9) / 1e9);
  let params = { ...mur.params, [choix!.bout]: x };
  if (mur.params.renflement) {
    const c = centreRenflement(mur.params.a, mur.params.b, mur.params.renflement);
    const s = Math.sign(4 * Math.atan(mur.params.renflement));
    const ang = (v: Vec) => Math.atan2(v.y - c.y, v.x - c.x);
    const T = 2 * Math.PI;
    const balayage = (de: Vec, vers: Vec) => s * (((((ang(vers) - ang(de)) * s) % T) + T) % T);
    const theta = balayage(params.a, params.b);
    const b = Math.tan(theta / 4);
    if (Math.abs(theta) < 1e-9) throw new ErreurCommande("precondition", "autreId", "la jonction réduirait le mur à une longueur nulle");
    if (Math.abs(b) > 1 + 1e-9) throw new ErreurCommande("precondition", "autreId", "la jonction porterait le mur courbe au-delà d'un demi-cercle");
    params = { ...params, renflement: Math.round(b * 1e12) / 1e12 };
  }
  if (distance(params.a, params.b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "autreId", "la jonction réduirait le mur à une longueur nulle");
  const effets = effetsVides();
  effets.modifies.push(mur.id);
  if (mur.niveauId) effets.niveauxTouches.push(mur.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [mur.id]: { ...mur, params } as Occurrence<"mur"> } }, effets };
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
  if (mur.params.renflement || autre.params.renflement) return joindreCourbe(etat, mur, autre);
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
