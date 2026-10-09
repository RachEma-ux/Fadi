/**
 * Étirer par fenêtre polygonale (D-116, DA-02-06) : les sommets des objets d'un niveau compris dans une fenêtre
 * tracée au lasso libre sont déplacés de (dx, dy), les autres restent. Un objet entièrement compris est déplacé ;
 * un objet partiellement compris est étiré (extrémité de mur ou d'escalier, sommets de polyligne, de polygone, de
 * contour de dalle ou de pièce, de garde-corps). Les objets à position unique (poteau, bloc, texte) se déplacent si
 * leur point est dans la fenêtre ; arcs, cercles et ellipses si leur centre l'est. Les ouvertures suivent leur mur
 * (distance à l'extrémité fixe conservée, comme `transformer.etirer`) ; hachures et solides associés suivent leur
 * source. Objets verrouillés, sur calque verrouillé ou gelé : laissés (la fenêtre ne les saisit pas). Le résultat de
 * chaque objet étiré est revalidé (contour croisé, longueur nulle : refus motivé), un seul lot.
 */
import { distance, intersectionSegments, pointDansPolygone } from "../geometrie.js";
import type { ModeleAtelier, OccurrenceQuelconque } from "../modele.js";
import { estOuverture } from "../ontologie.js";
import { pt, TOLERANCE_REDUCTEUR, type Point2 } from "../unites.js";
import { ErreurCommande, effetsVides, fusionnerEffets, lire, type ContexteCommande, type ResultatCommande } from "./base.js";
import { reducteursTransformer, transformerOccurrence } from "./transformer.js";
import { validerParams } from "./validation.js";
import { raisonVerrou } from "./verrous.js";

type Brut = Record<string, unknown>;
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;

function lireFenetre(p: Brut): Point2[] {
  const brut = p["fenetre"];
  if (!Array.isArray(brut) || brut.length < 3) throw new ErreurCommande("invalide", "fenetre", "fenêtre : un polygone d'au moins trois sommets");
  return brut.map((q, i) => {
    const v = q as { x?: unknown; y?: unknown };
    if (typeof v.x !== "number" || typeof v.y !== "number" || !Number.isFinite(v.x) || !Number.isFinite(v.y)) throw new ErreurCommande("invalide", `fenetre[${i}]`, "point { x, y } en mètres");
    return pt(v.x, v.y);
  });
}

/** Ce que la fenêtre fait d'un objet : rien, le déplacer entier, ou l'étirer (nouveaux paramètres bruts). */
type Effet = { type: "aucun" } | { type: "deplacer" } | { type: "etirer"; params: Brut } | { type: "extremite"; extremite: "a" | "b" } ;

export function effetFenetre(o: OccurrenceQuelconque, dedans: (q: Point2) => boolean, dx: number, dy: number): Effet {
  const D = (q: Point2) => (dedans(q) ? pt(r9(q.x + dx), r9(q.y + dy)) : q);
  const parPoints = (pts: readonly Point2[]): "tous" | "aucun" | "certains" => {
    const n = pts.filter(dedans).length;
    return n === 0 ? "aucun" : n === pts.length ? "tous" : "certains";
  };
  switch (o.classe) {
    case "mur":
    case "escalier":
    case "cotation": {
      const k = parPoints([o.params.a, o.params.b]);
      if (k === "aucun") return { type: "aucun" };
      if (k === "tous") return { type: "deplacer" };
      return { type: "extremite", extremite: dedans(o.params.a) ? "a" : "b" };
    }
    case "poteau":
      return dedans(o.params.point) ? { type: "deplacer" } : { type: "aucun" };
    case "texte":
    case "etiquette":
    case "annotation-fabrication":
    case "bloc-occurrence":
      return dedans(o.params.position) ? { type: "deplacer" } : { type: "aucun" };
    case "garde-corps": {
      const k = parPoints(o.params.points);
      return k === "aucun" ? { type: "aucun" } : k === "tous" ? { type: "deplacer" } : { type: "etirer", params: { ...(o.params as unknown as Brut), points: o.params.points.map(D) } };
    }
    case "objet-importe":
      return parPoints(o.params.empreinte) === "tous" ? { type: "deplacer" } : { type: "aucun" };
    case "solide-exact":
      return parPoints(o.params.emprise) === "tous" ? { type: "deplacer" } : { type: "aucun" };
    case "espace": {
      const tous = o.params.polygones.flatMap((c) => [...c.contour, ...c.trous.flat()]);
      return parPoints(tous) === "tous" ? { type: "deplacer" } : { type: "aucun" };
    }
    case "solide":
    case "dalle":
    case "toiture":
    case "zone":
    case "piece":
    case "reference-plan": {
      if (o.classe === "solide" && o.params.sourceId) return { type: "aucun" }; // suit son esquisse
      const q = o.params as unknown as { contour: Point2[]; trous: Point2[][]; etiquette?: Point2 | null };
      const k = parPoints([...q.contour, ...q.trous.flat()]);
      if (k === "aucun") return { type: "aucun" };
      if (k === "tous") return { type: "deplacer" };
      return { type: "etirer", params: { ...(o.params as unknown as Brut), contour: q.contour.map(D), trous: q.trous.map((h) => h.map(D)), ...(q.etiquette ? { etiquette: D(q.etiquette) } : {}) } };
    }
    case "esquisse": {
      const q = o.params;
      if (q.forme === "hachure" && q.sourceId) return { type: "aucun" };
      if ((q.forme === "arc" || q.forme === "cercle" || q.forme === "ellipse") && q.centre) return dedans(q.centre) ? { type: "deplacer" } : { type: "aucun" };
      const k = parPoints(q.points);
      if (k === "aucun") return { type: "aucun" };
      if (k === "tous") return { type: "deplacer" };
      // Un rectangle (deux coins) partiellement étiré devient un polygone de quatre sommets.
      if (q.forme === "rectangle" && q.points.length === 2) {
        const [a, b] = q.points as [Point2, Point2];
        const coins = [pt(a.x, a.y), pt(b.x, a.y), pt(b.x, b.y), pt(a.x, b.y)];
        return { type: "etirer", params: { ...(q as unknown as Brut), forme: "polygone", ferme: true, points: coins.map(D) } };
      }
      return { type: "etirer", params: { ...(q as unknown as Brut), points: q.points.map(D) } };
    }
    default:
      return { type: "aucun" };
  }
}

/** Boucles fermées d'un résultat étiré (contours et trous, polygones d'esquisse fermés). */
function bouclesFermees(classe: string, params: Brut): Point2[][] {
  if (classe === "esquisse") return params["ferme"] === true && Array.isArray(params["points"]) && !params["renflements"] ? [params["points"] as Point2[]] : [];
  if (Array.isArray(params["contour"])) return [params["contour"] as Point2[], ...((params["trous"] as Point2[][] | undefined) ?? [])];
  return [];
}

/** Vrai si deux côtés non adjacents d'un polygone fermé se coupent. */
export function seCroise(poly: readonly Point2[]): boolean {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (intersectionSegments(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

export function etirerFenetre(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const niveauId = lire.chaine(p, "niveauId");
  if (!etat.niveaux[niveauId]) throw new ErreurCommande("precondition", "niveauId", `niveau inconnu : ${niveauId}`);
  const fenetre = lireFenetre(p);
  const dx = lire.nombre(p, "dx")!;
  const dy = lire.nombre(p, "dy")!;
  if (Math.hypot(dx, dy) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "dx", "déplacement nul : rien à étirer");
  const dedans = (q: Point2) => pointDansPolygone(q, fenetre);
  let courant = etat;
  let effets = effetsVides();
  let touches = 0;
  for (const o of Object.values(etat.objets)) {
    if (o.niveauId !== niveauId || estOuverture(o.classe) || raisonVerrou(etat, o)) continue;
    const e = effetFenetre(o, dedans, dx, dy);
    if (e.type === "aucun") continue;
    touches++;
    const actuel = courant.objets[o.id]!;
    if (e.type === "deplacer") {
      courant = { ...courant, objets: { ...courant.objets, [o.id]: transformerOccurrence(actuel, { type: "translation", dx, dy }) } };
      effets = fusionnerEffets(effets, { ...effetsVides(), modifies: [o.id], niveauxTouches: [niveauId] });
      continue;
    }
    if (e.type === "extremite") {
      const depart = e.extremite === "a" ? (actuel as { params: { a: Point2 } }).params.a : (actuel as { params: { b: Point2 } }).params.b;
      const point = pt(r9(depart.x + dx), r9(depart.y + dy));
      if (actuel.classe === "cotation") {
        const autre = e.extremite === "a" ? actuel.params.b : actuel.params.a;
        if (distance(point, autre) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "fenetre", `${o.id} : cote de longueur nulle`);
        courant = { ...courant, objets: { ...courant.objets, [o.id]: { ...actuel, params: { ...actuel.params, [e.extremite]: point } } } };
        effets = fusionnerEffets(effets, { ...effetsVides(), modifies: [o.id], niveauxTouches: [niveauId] });
        continue;
      }
      const r = reducteursTransformer.etirer(courant, { id: o.id, extremite: e.extremite, point }, ctx, []);
      courant = r.etat;
      effets = fusionnerEffets(effets, r.effets);
      continue;
    }
    for (const boucle of bouclesFermees(actuel.classe, e.params)) if (seCroise(boucle)) throw new ErreurCommande("precondition", "fenetre", `${o.id} : contour qui se croise après étirement`);
    let params: unknown;
    try {
      params = validerParams(courant, actuel.classe, e.params);
    } catch (err) {
      if (err instanceof ErreurCommande) throw new ErreurCommande(err.code, "fenetre", `${o.id} : ${err.message}`);
      throw err;
    }
    courant = { ...courant, objets: { ...courant.objets, [o.id]: { ...actuel, params } as OccurrenceQuelconque } };
    effets = fusionnerEffets(effets, { ...effetsVides(), modifies: [o.id], niveauxTouches: [niveauId] });
  }
  if (touches === 0) throw new ErreurCommande("precondition", "fenetre", "aucun sommet dans la fenêtre : rien à étirer");
  return { etat: courant, effets };
}
