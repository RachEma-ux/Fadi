/**
 * Conversion d'esquisses (D-054, fiches DA-01-05, DA-02-13) — pur.
 *
 * `esquisse.convertir` { id, forme, segments?, tolerance? } :
 * - vers « spline » depuis une ligne, une polyligne ou un polygone : la courbe passe par les sommets (Catmull-Rom
 *   centripète, D-012). Avec `tolerance` (m), ajustement : seuls les sommets nécessaires sont gardés, tant que tous
 *   les sommets d'origine restent à moins de la tolérance de la courbe (écart maximal rendu) ;
 * - vers « polyligne » depuis une spline, un arc, un cercle ou une ellipse : approximation par `segments` segments
 *   (par travée de spline, ou sur la courbe entière), dite comme telle — le nombre de segments est une donnée de
 *   la commande, jamais deviné.
 * Une esquisse contrainte ou visée par une cote associative est refusée (indices de sommets changés) : détacher
 * d'abord. Calque, niveau, groupe, phase et propriétés sont gardés.
 */
import { ErreurCommande, effetsVides, lire, type ResultatCommande } from "../commandes/base.js";
import { validerParams } from "../commandes/validation.js";
import { distance, pointsArc, pointsEllipse, pointsSpline, projectionSurSegment, type Vec } from "../geometrie.js";
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque, ParamsEsquisse } from "../modele.js";
import { pt, type Point2 } from "../unites.js";

type Brut = Record<string, unknown>;

const VERS_SPLINE = ["ligne", "polyligne", "polygone"] as const;
const VERS_POLYLIGNE = ["spline", "arc", "cercle", "ellipse"] as const;

/** Écart maximal des points `pts` à la polyligne échantillonnée `courbe`. */
function ecartMax(pts: readonly Vec[], courbe: readonly Vec[], ferme: boolean): number {
  let max = 0;
  for (const p of pts) {
    let d = Infinity;
    const n = courbe.length;
    for (let i = 0; i + (ferme ? 0 : 1) < n; i++) d = Math.min(d, projectionSurSegment(p, courbe[i]!, courbe[(i + 1) % n]!).distance);
    max = Math.max(max, d);
  }
  return max;
}

/**
 * Sous-ensemble de sommets dont la spline reste à moins de `tolerance` de tous les sommets d'origine : on part des
 * extrémités (ou de quatre sommets répartis si fermé) et on ajoute à chaque tour le sommet le plus éloigné.
 */
export function ajusterSpline(points: readonly Vec[], ferme: boolean, tolerance: number): { points: Point2[]; ecart: number } {
  const n = points.length;
  const gardes = new Set<number>(ferme ? Array.from({ length: Math.min(n, 4) }, (_, k) => Math.floor((k * n) / Math.min(n, 4))) : [0, n - 1]);
  const courbeDe = () => {
    const sel = [...gardes].sort((a, b) => a - b).map((i) => points[i]!);
    return { sel, courbe: pointsSpline(sel, 16, ferme) };
  };
  for (;;) {
    const { sel, courbe } = courbeDe();
    let pire = -1;
    let dPire = 0;
    points.forEach((p, i) => {
      if (gardes.has(i)) return;
      const d = ecartMax([p], courbe, ferme);
      if (d > dPire) {
        dPire = d;
        pire = i;
      }
    });
    if (pire < 0 || dPire <= tolerance || gardes.size >= n) {
      return { points: sel.map((q) => pt(q.x, q.y)), ecart: Math.round(ecartMax(points, courbe, ferme) * 1e6) / 1e6 };
    }
    gardes.add(pire);
  }
}

/** Retire les sommets consécutifs confondus (et la fermeture répétée d'un contour fermé). */
function sansDoublons(pts: Point2[], ferme: boolean): Point2[] {
  const out: Point2[] = [];
  for (const p of pts) if (!out.length || distance(out[out.length - 1]!, p) > 1e-9) out.push(p);
  if (ferme && out.length > 1 && distance(out[0]!, out[out.length - 1]!) <= 1e-9) out.pop();
  return out.map((p) => pt(Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6));
}

export function convertirEsquisse(etat: ModeleAtelier, p: Brut): ResultatCommande & { ecart?: number } {
  const id = lire.chaine(p, "id");
  const o = etat.objets[id];
  if (!o || o.classe !== "esquisse") throw new ErreurCommande("precondition", "id", `esquisse inconnue : ${id}`);
  const e = o as Occurrence<"esquisse">;
  const forme = lire.enumeration(p, "forme", ["spline", "polyligne"] as const);
  const source = e.params.forme;
  if (Object.values(etat.relations).some((r) => r.kind === "contrainte" && (r.sourceId === id || r.targetId === id))) throw new ErreurCommande("precondition", "id", `${id} porte des contraintes : les supprimer d'abord (les indices de sommets changeraient)`);
  if (Object.values(etat.references).some((r) => r.objetId === id)) throw new ErreurCommande("precondition", "id", `${id} est visée par une cote associative : la détacher d'abord`);
  let params: ParamsEsquisse;
  let ecart: number | undefined;
  const vierge = { centre: null, rayon: null, angleDebut: null, angleFin: null, motif: null, rayonB: null, rotation: null };
  if (forme === "spline") {
    if (!(VERS_SPLINE as readonly string[]).includes(source)) throw new ErreurCommande("precondition", "forme", `une esquisse « ${source} » ne devient pas une spline (lignes, polylignes et polygones seulement)`);
    const ferme = e.params.ferme || source === "polygone";
    const tolerance = lire.nombre(p, "tolerance", { optionnel: true, min: 0, max: 100 });
    let points = e.params.points.map((q) => pt(q.x, q.y));
    if (tolerance !== null && points.length > 2) {
      const a = ajusterSpline(points, ferme, tolerance);
      points = a.points;
      ecart = a.ecart;
    }
    params = { ...e.params, ...vierge, forme: "spline", points, ferme };
  } else {
    if (!(VERS_POLYLIGNE as readonly string[]).includes(source)) throw new ErreurCommande("precondition", "forme", `une esquisse « ${source} » est déjà faite de segments`);
    const segments = lire.nombre(p, "segments", { entier: true, min: 1, max: 2000 });
    if (segments === null) throw new ErreurCommande("invalide", "segments", "nombre de segments requis");
    const q = e.params;
    let points: Point2[];
    let ferme = false;
    if (source === "spline") {
      ferme = q.ferme;
      points = pointsSpline(q.points, segments, q.ferme);
    } else if (source === "arc") {
      if (!q.centre || !q.rayon) throw new ErreurCommande("precondition", "id", "arc sans centre ni rayon");
      points = pointsArc(q.centre, q.rayon.value, q.angleDebut?.value ?? 0, q.angleFin?.value ?? 360, segments);
    } else if (source === "cercle") {
      if (!q.centre || !q.rayon) throw new ErreurCommande("precondition", "id", "cercle sans centre ni rayon");
      if (segments < 3) throw new ErreurCommande("invalide", "segments", "trois segments au moins pour un contour fermé");
      ferme = true;
      points = pointsArc(q.centre, q.rayon.value, 0, 360, segments);
    } else {
      if (!q.centre || !q.rayon || !q.rayonB) throw new ErreurCommande("precondition", "id", "ellipse incomplète");
      if (segments < 3) throw new ErreurCommande("invalide", "segments", "trois segments au moins pour un contour fermé");
      ferme = true;
      points = pointsEllipse(q.centre, q.rayon.value, q.rayonB.value, q.rotation?.value ?? 0, segments);
    }
    params = { ...q, ...vierge, forme: "polyligne", points: sansDoublons(points, ferme), ferme };
  }
  // Clés facultatives absentes plutôt que nulles (ellipse, D-046) : même forme que les esquisses tracées.
  const brut = { ...params } as unknown as Brut;
  delete brut["rayonB"];
  delete brut["rotation"];
  const valides = validerParams(etat, "esquisse", brut);
  const effets = effetsVides();
  effets.modifies.push(id);
  if (e.niveauId) effets.niveauxTouches.push(e.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...e, params: valides } as OccurrenceQuelconque } }, effets, ...(ecart !== undefined ? { ecart } : {}) };
}
