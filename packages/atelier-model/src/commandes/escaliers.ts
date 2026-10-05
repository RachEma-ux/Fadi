/**
 * Escalier à volées et paliers (D-084, fiche DA-07-10) : `escalier.volees` { niveauId, points (axe : départ, angles,
 * arrivée), largeur, hauteurAFranchir, contremarches (total), epaisseurPalier, niveauArriveeId?, nom? } crée, en un
 * lot, une volée droite par tronçon de l'axe et un palier carré (côté = largeur) à chaque angle :
 * - les contremarches sont réparties entre les volées au prorata de leur longueur (plus forts restes, au moins une
 *   par volée) ; chaque volée part de la hauteur atteinte par la précédente (`decalageBase`) ;
 * - le palier est une dalle d'usage « dalle isolée », dessus à la hauteur atteinte, de l'épaisseur saisie ;
 * - volées et paliers partagent un `groupe` d'escalier (trémie, quantités) et un groupe nommé.
 * Aucune dimension par défaut (R3) ; aucune règle de confort (giron, hauteur de marche) n'est appliquée.
 */
import { distance, normalise, perp, sub, type Vec } from "../geometrie.js";
import type { ModeleAtelier } from "../modele.js";
import { pt } from "../unites.js";
import { effetsVides, ErreurCommande, fusionnerEffets, lire, type ContexteCommande, type ResultatCommande } from "./base.js";
import { creerOccurrence } from "./objets.js";

type Brut = Record<string, unknown>;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Répartition d'un total entier au prorata de poids positifs (plus forts restes), au moins 1 chacun. */
export function repartirEntier(total: number, poids: readonly number[]): number[] {
  const n = poids.length;
  if (total < n) throw new ErreurCommande("invalide", "contremarches", `au moins une contremarche par volée (${n} volées)`);
  const somme = poids.reduce((s, x) => s + x, 0);
  const brut = poids.map((x) => 1 + ((total - n) * x) / somme);
  const base = brut.map(Math.floor);
  let reste = total - base.reduce((s, x) => s + x, 0);
  const ordre = brut.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((u, v) => v.r - u.r || u.i - v.i);
  for (const { i } of ordre) {
    if (reste <= 0) break;
    base[i]! += 1;
    reste--;
  }
  return base;
}

export function creerEscalierVolees(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const niveauId = lire.chaine(p, "niveauId");
  if (!etat.niveaux[niveauId]) throw new ErreurCommande("precondition", "niveauId", `niveau inconnu : ${niveauId}`);
  const points = lire.points(p, "points", { min: 3 });
  const largeur = lire.longueur(p, "largeur", { strict: true })!.value;
  const H = lire.longueur(p, "hauteurAFranchir", { strict: true })!.value;
  const total = lire.nombre(p, "contremarches", { entier: true, min: 2 })!;
  const epPalier = lire.longueur(p, "epaisseurPalier", { strict: true })!.value;
  if (!(largeur > 0) || !(H > 0) || !(epPalier > 0)) throw new ErreurCommande("invalide", "largeur", "largeur, hauteur à franchir et épaisseur de palier strictement positives");
  const niveauArriveeId = lire.chaineOuNull(p, "niveauArriveeId");
  if (niveauArriveeId !== null && !etat.niveaux[niveauArriveeId]) throw new ErreurCommande("precondition", "niveauArriveeId", `niveau d'arrivée inconnu : ${niveauArriveeId}`);
  const nom = lire.chaineOuNull(p, "nom")?.trim() || `Escalier ${Object.keys(etat.groupes).length + 1}`;
  const k = points.length - 1;
  const dirs = Array.from({ length: k }, (_, i) => normalise(sub(points[i + 1]!, points[i]!)));
  const volees: { a: Vec; b: Vec }[] = [];
  for (let i = 0; i < k; i++) {
    const u = dirs[i]!;
    const a = i === 0 ? points[0]! : { x: points[i]!.x + (u.x * largeur) / 2, y: points[i]!.y + (u.y * largeur) / 2 };
    const b = i === k - 1 ? points[k]! : { x: points[i + 1]!.x - (u.x * largeur) / 2, y: points[i + 1]!.y - (u.y * largeur) / 2 };
    if (distance(a, b) < 0.05 || (b.x - a.x) * u.x + (b.y - a.y) * u.y <= 0) throw new ErreurCommande("precondition", "points", `volée ${i + 1} : trop courte pour la largeur des paliers`);
    volees.push({ a, b });
  }
  const parVolee = repartirEntier(total, volees.map((v) => distance(v.a, v.b)));
  const h = H / total;
  const groupe = `escalier:${ctx.ids.nouveau("groupe")}`;
  const gid = ctx.ids.nouveau("groupe");
  let courant: ModeleAtelier = { ...etat, groupes: { ...etat.groupes, [gid]: { id: gid, nom } } };
  let effets = effetsVides();
  effets.crees.push(gid);
  let cumul = 0;
  for (let i = 0; i < k; i++) {
    const r = parVolee[i]!;
    const v = volees[i]!;
    const res = creerOccurrence(courant, { niveauId, groupeId: gid, params: { a: pt(r6(v.a.x), r6(v.a.y)), b: pt(r6(v.b.x), r6(v.b.y)), largeur: { value: largeur, unit: "m" }, hauteurAFranchir: { value: r6(r * h), unit: "m" }, contremarches: r, decalageBase: { value: r6(cumul * h), unit: "m" }, niveauDepartId: niveauId, niveauArriveeId, groupe, referencePlanSeulement: false, nom: `${nom} · volée ${i + 1}` } }, ctx, "escalier");
    courant = res.etat;
    effets = fusionnerEffets(effets, res.effets);
    cumul += r;
    if (i < k - 1) {
      const u = dirs[i]!;
      const n = perp(u);
      const c = points[i + 1]!;
      const w = largeur / 2;
      const coin = (s: number, t: number) => pt(r6(c.x + u.x * s + n.x * t), r6(c.y + u.y * s + n.y * t));
      const dessus = cumul * h;
      const pal = creerOccurrence(courant, { niveauId, groupeId: gid, params: { contour: [coin(-w, -w), coin(w, -w), coin(w, w), coin(-w, w)], trous: [], epaisseur: { value: epPalier, unit: "m" }, decalageBase: { value: r6(dessus - epPalier), unit: "m" }, usage: "dalle-isolee", nom: `${nom} · palier ${i + 1}` } }, ctx, "dalle");
      courant = pal.etat;
      effets = fusionnerEffets(effets, pal.effets);
    }
  }
  return { etat: courant, effets };
}
