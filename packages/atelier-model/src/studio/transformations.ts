import { studioAngleNormal, studioShapeAnchors } from "./courbes.js";
import type { StudioAnchor } from "./noyau/ancres.js";
import type { StudioPoint, StudioShape } from "./noyau/types.js";
import type { StudioDimension } from "./objets/cote.js";
import type { StudioAngularDimension } from "./objets/cote-angulaire.js";
import type { StudioText } from "./objets/texte.js";
import type { StudioSolid } from "./objets-3d/solides.js";
import { studioAnchorPoint } from "./objets/index.js";

/**
 * Transformations planes de Studio (Copier, Rotation, Symétrie, Échelle) : similitudes du repère `local-2d` (mètres),
 * pures, sans React ni DOM. Une similitude garde la nature de chaque objet :
 * - ligne et polyligne : sommets transformés ; une symétrie inverse le sens des renflements (`bulges` opposés) ;
 * - cercle et arc : restent des cercles et des arcs **exacts** (centre transformé, rayon multiplié par le facteur,
 *   angles tournés ; une symétrie échange début et fin, le parcours restant trigonométrique) ;
 * - rectangle : reste un rectangle quand la transformation garde les axes (quart de tour exact, symétrie d'axe
 *   horizontal, vertical ou diagonal à 45°, translation, échelle) ; sinon il devient une **polyligne fermée** de ses
 *   quatre coins (origine, largeur, opposé, hauteur), même identifiant, même extrusion — aucun rectangle tourné n'existe
 *   dans `studio-document/1`.
 * Les quarts de tour et les symétries d'axe horizontal, vertical ou à 45° sont calculés sans trigonométrie (résultat
 * exact au flottant près des seules soustractions) ; les autres angles passent par cos / sin.
 * L'extrusion déclarée est conservée telle quelle (base, hauteur, épaisseur), sauf pour l'échelle avec l'option
 * « volumes aussi » qui multiplie base, hauteur et épaisseur par le facteur.
 */
export interface StudioTransformation {
  point(p: StudioPoint): StudioPoint;
  /** Image d'une direction angulaire (radians) par la partie linéaire. */
  angle(a: number): number;
  /** La transformation renverse l'orientation (symétrie). */
  miroir: boolean;
  /** Facteur d'échelle uniforme (> 0). */
  facteur: number;
  /** Les axes x et y sont envoyés sur les axes (un rectangle reste un rectangle). */
  gardeAxes: boolean;
  /** Le rectangle échange largeur et hauteur (quart de tour impair, symétrie à 45°). */
  echangeAxes: boolean;
  /** Extrusions multipliées par le facteur (échelle « volumes aussi »). */
  volumes: boolean;
}

const pur = (v: number) => (Object.is(v, -0) ? 0 : v);
const P = (x: number, y: number): StudioPoint => ({ x: pur(x), y: pur(y) });

export function studioTranslation(dx: number, dy: number): StudioTransformation {
  return { point: (p) => P(p.x + dx, p.y + dy), angle: (a) => a, miroir: false, facteur: 1, gardeAxes: true, echangeAxes: false, volumes: false };
}

/** Rotation de `angle` radians (sens trigonométrique) autour de `c` ; un multiple de π/2 est un quart de tour exact. */
export function studioRotation(c: StudioPoint, angle: number): StudioTransformation {
  const quarts = angle / (Math.PI / 2);
  const k = Math.round(quarts);
  const exact = Math.abs(quarts - k) < 1e-12;
  if (exact) {
    const q = ((k % 4) + 4) % 4;
    const point = (p: StudioPoint): StudioPoint => {
      const x = p.x - c.x, y = p.y - c.y;
      switch (q) {
        case 0: return P(p.x, p.y);
        case 1: return P(c.x - y, c.y + x);
        case 2: return P(c.x - x, c.y - y);
        default: return P(c.x + y, c.y - x);
      }
    };
    return { point, angle: (a) => a + (q * Math.PI) / 2, miroir: false, facteur: 1, gardeAxes: true, echangeAxes: q % 2 === 1, volumes: false };
  }
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return {
    point: (p) => { const x = p.x - c.x, y = p.y - c.y; return P(c.x + cos * x - sin * y, c.y + sin * x + cos * y); },
    angle: (a) => a + angle, miroir: false, facteur: 1, gardeAxes: false, echangeAxes: false, volumes: false,
  };
}

/** Symétrie par rapport à la droite (a, b), deux points distincts. */
export function studioSymetrie(a: StudioPoint, b: StudioPoint): StudioTransformation {
  const dx = b.x - a.x, dy = b.y - a.y;
  const phi = Math.atan2(dy, dx);
  const base = { angle: (t: number) => 2 * phi - t, miroir: true, facteur: 1, volumes: false };
  if (dy === 0) return { ...base, point: (p) => P(p.x, a.y - (p.y - a.y)), gardeAxes: true, echangeAxes: false };
  if (dx === 0) return { ...base, point: (p) => P(a.x - (p.x - a.x), p.y), gardeAxes: true, echangeAxes: false };
  if (Math.abs(dx) === Math.abs(dy)) {
    const s = Math.sign(dx) === Math.sign(dy) ? 1 : -1;
    return { ...base, point: (p) => P(a.x + s * (p.y - a.y), a.y + s * (p.x - a.x)), gardeAxes: true, echangeAxes: true };
  }
  const c2 = Math.cos(2 * phi), s2 = Math.sin(2 * phi);
  return {
    ...base, gardeAxes: false, echangeAxes: false,
    point: (p) => { const x = p.x - a.x, y = p.y - a.y; return P(a.x + c2 * x + s2 * y, a.y + s2 * x - c2 * y); },
  };
}

/** Homothétie de centre `c` et de facteur `k` > 0 (uniforme). */
export function studioEchelle(c: StudioPoint, k: number, volumes: boolean): StudioTransformation {
  return { point: (p) => P(c.x + k * (p.x - c.x), c.y + k * (p.y - c.y)), angle: (a) => a, miroir: false, facteur: k, gardeAxes: true, echangeAxes: false, volumes };
}

function extrusion<E extends { base: number; height: number; thickness?: number }>(e: E | undefined, t: StudioTransformation): { extrusion?: E } {
  if (!e) return {};
  if (!t.volumes || t.facteur === 1) return { extrusion: { ...e } };
  return { extrusion: { ...e, base: pur(e.base * t.facteur), height: e.height * t.facteur, ...(e.thickness !== undefined ? { thickness: e.thickness * t.facteur } : {}) } };
}

/**
 * Image d'une forme (non revalidée : le gestionnaire de commande la valide). `id` : identifiant de l'image (copie) ou
 * celui de la source (transformation sur place).
 */
export function studioTransformerForme(o: StudioShape, t: StudioTransformation, id: string = o.id): StudioShape {
  const layer = o.layerId ? { layerId: o.layerId } : {};
  switch (o.type) {
    case "line":
      return { id, type: "line", ...layer, start: t.point(o.start), end: t.point(o.end), ...extrusion(o.extrusion, t) };
    case "circle":
      return { id, type: "circle", ...layer, center: t.point(o.center), radius: o.radius * t.facteur, ...extrusion(o.extrusion, t) };
    case "arc": {
      const a0 = studioAngleNormal(t.angle(o.startAngle)), a1 = studioAngleNormal(t.angle(o.endAngle));
      return { id, type: "arc", ...layer, center: t.point(o.center), radius: o.radius * t.facteur, startAngle: t.miroir ? a1 : a0, endAngle: t.miroir ? a0 : a1, ...extrusion(o.extrusion, t) };
    }
    case "polyline":
      return {
        id, type: "polyline", ...layer, points: o.points.map(t.point), closed: o.closed,
        ...(o.bulges ? { bulges: t.miroir ? o.bulges.map((b) => pur(-b)) : [...o.bulges] } : {}), ...extrusion(o.extrusion, t),
      };
    case "rectangle": {
      const { x, y } = o.origin;
      const coins = [{ x, y }, { x: x + o.width, y }, { x: x + o.width, y: y + o.height }, { x, y: y + o.height }].map(t.point);
      if (t.gardeAxes) {
        const origin = P(Math.min(...coins.map((p) => p.x)), Math.min(...coins.map((p) => p.y)));
        const [w, h] = t.echangeAxes ? [o.height, o.width] : [o.width, o.height];
        return { id, type: "rectangle", ...layer, origin, width: w * t.facteur, height: h * t.facteur, ...extrusion(o.extrusion, t) };
      }
      return { id, type: "polyline", ...layer, points: coins, closed: true, ...extrusion(o.extrusion, t) };
    }
  }
}

/**
 * Sommet de l'image `cible` qui correspond au point transformé `q` d'un lien de cote : le sommet confondu (à 10⁻⁹ près,
 * relatif) le plus proche ; à défaut (quadrant d'un cercle tourné d'un angle quelconque), le même nom de sommet, que la
 * cote suit comme pour une modification. `null` si aucun ne convient.
 */
export function studioAncreImage(cible: StudioShape, ancien: StudioAnchor, q: StudioPoint): StudioAnchor | null {
  const tol = 1e-9 * Math.max(1, Math.abs(q.x), Math.abs(q.y));
  let meilleur: StudioAnchor | null = null, distance = Infinity;
  for (const a of studioShapeAnchors(cible)) {
    const p = studioAnchorPoint(cible, a);
    if (!p) continue;
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d <= tol && d < distance) { meilleur = a; distance = d; }
  }
  if (meilleur) return meilleur;
  return studioAnchorPoint(cible, ancien) ? ancien : null;
}

/** Décalage d'une cote transformée avec sa sélection : signe inversé par une symétrie, multiplié par le facteur. */
export const studioDecalageImage = (d: StudioDimension, t: StudioTransformation): number => pur((t.miroir ? -d.offset : d.offset) * t.facteur);

// ——— Annotations et solides libres ———

/**
 * Image d'un texte : point d'insertion transformé, rotation tournée avec la sélection, hauteur multipliée par le facteur.
 * Une symétrie ne retourne pas l'écriture (comme MIRRTEXT = 0 en DAO) : seul le point d'insertion est réfléchi, la
 * rotation est conservée pour que le texte reste lisible.
 */
export function studioTransformerTexte(o: StudioText, t: StudioTransformation, id: string = o.id): StudioText {
  return { ...o, id, position: t.point(o.position), height: o.height * t.facteur, rotation: t.miroir ? o.rotation : studioAngleNormal(t.angle(o.rotation)) };
}

/**
 * Image libre d'une cote angulaire (points transformés, rayon d'arc multiplié par le facteur). Une symétrie renverse
 * l'orientation : les deux rayons (et leurs liens) sont échangés pour mesurer le même angle, pas son complément.
 */
export function studioTransformerCoteAngulaire(o: StudioAngularDimension, t: StudioTransformation, id: string = o.id): StudioAngularDimension {
  const first = t.point(o.first), second = t.point(o.second);
  return {
    ...o, id, vertex: t.point(o.vertex), radius: o.radius * t.facteur,
    ...(t.miroir ? { first: second, second: first, links: { first: o.links.second, second: o.links.first } } : { first, second }),
  };
}

/**
 * Image d'un solide libre (repère `local-3d`, plan xy transformé, z inchangé) : origine transformée, rotation autour de
 * +z tournée. Symétrie : une boîte reste une boîte (origine prise au coin opposé en y local, rotation 2φ − θ) ; un
 * prisme garde son origine réfléchie et son profil retourné (y local opposé). Échelle : seule l'origine se déplace,
 * sauf « volumes aussi » qui multiplie dimensions, profil, hauteur et cote z de l'origine par le facteur.
 */
export function studioTransformerSolide(s: StudioSolid, t: StudioTransformation, id: string = s.id): StudioSolid {
  const k = t.volumes ? t.facteur : 1;
  const { origin, rotation } = s.placement;
  const z = pur(origin.z * k);
  const rot = studioAngleNormal(t.angle(rotation));
  const place = (p: StudioPoint) => { const q = t.point(p); return { x: q.x, y: q.y, z }; };
  if (s.type === "box") {
    const depart = t.miroir ? { x: origin.x - Math.sin(rotation) * s.depth, y: origin.y + Math.cos(rotation) * s.depth } : origin;
    return { ...s, id, placement: { origin: place(depart), rotation: rot }, width: s.width * k, depth: s.depth * k, height: s.height * k };
  }
  const profile = s.profile.map((p) => P(p.x * k, (t.miroir ? -p.y : p.y) * k));
  return { ...s, id, placement: { origin: place(origin), rotation: rot }, profile, height: s.height * k };
}
