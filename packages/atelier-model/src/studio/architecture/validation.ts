import { array, discriminator, fail, finite, identifier, layerRef, point, record, same } from "../noyau/validation.js";
import { geometrieMur, ouverturesSeChevauchent, placerOuverture, STUDIO_LIMITES_MUR, type GeometrieMur, type OuverturePlacee } from "./geometrie.js";
import { STUDIO_OPENING_KINDS, STUDIO_WALL_JUSTIFICATIONS, type StudioArchitectureItem, type StudioOpening, type StudioOpeningKind, type StudioWall, type StudioWallJustification } from "./types.js";

/**
 * Validation des objets architecturaux : champ par champ (valeurs saisies seulement, aucun défaut), puis compatibilité
 * de chaque ouverture avec son mur hôte sur le document entier. Une incompatibilité (hors du mur, à cheval sur un angle,
 * plus haute que le mur, chevauchement de deux ouvertures, hôte absent) est un **refus** : rien n'est jamais rogné ni
 * déplacé en silence ; appliquée au résultat d'un lot, elle abandonne le lot entier.
 */

/** Borne technique (pas une valeur métier) : dimensions finies, loin de tout débordement flottant. */
const BORNE = 1e6;

function positif(value: unknown, path: string, nom: string): number {
  const v = finite(value, path);
  if (v <= 0) fail(path, `${nom} strictement positive attendue`);
  if (v > BORNE) fail(path, `${nom} de 1 000 000 m au plus`);
  return v;
}
function positifOuNul(value: unknown, path: string, nom: string): number {
  const v = finite(value, path);
  if (v < 0) fail(path, `${nom} positive ou nulle attendue`);
  if (v > BORNE) fail(path, `${nom} de 1 000 000 m au plus`);
  return Object.is(v, -0) ? 0 : v;
}

export function validerMur(value: unknown, path: string): StudioWall {
  const o = record(value, ["id", "type", "axis", "thickness", "height", "base", "justification"], path, ["layerId"]);
  if (o.type !== "wall") fail(`${path}.type`, "mur attendu");
  const id = identifier(o.id, `${path}.id`);
  const raw = array(o.axis, `${path}.axis`);
  if (raw.length < 2) fail(`${path}.axis`, "deux points au moins attendus");
  if (raw.length > STUDIO_LIMITES_MUR.axePoints) fail(`${path}.axis`, `mur ${id} : axe de ${STUDIO_LIMITES_MUR.axePoints} points au plus (borne technique de contrôle du mur)`);
  const axis = raw.map((p, i) => point(p, `${path}.axis[${i}]`));
  for (let i = 1; i < axis.length; i++) if (same(axis[i - 1]!, axis[i]!)) fail(`${path}.axis[${i}]`, "deux points consécutifs confondus");
  const thickness = positif(o.thickness, `${path}.thickness`, "épaisseur");
  const height = positif(o.height, `${path}.height`, "hauteur");
  const base = finite(o.base, `${path}.base`);
  finite(base + height, `${path}.height`);
  if (typeof o.justification !== "string" || !STUDIO_WALL_JUSTIFICATIONS.includes(o.justification as StudioWallJustification)) fail(`${path}.justification`, "justification left, center ou right attendue");
  const w: StudioWall = {
    id, type: "wall", ...layerRef(o, path), axis, thickness, height, base: Object.is(base, -0) ? 0 : base,
    justification: o.justification as StudioWallJustification,
  };
  const g = geometrieMur(w);
  if (!g.ok) fail(path, `mur ${w.id} : ${g.raison}`);
  return w;
}

export function validerOuverture(value: unknown, path: string): StudioOpening {
  const o = record(value, ["id", "type", "hostId", "position", "width", "height", "sill"], path, ["kind"]);
  if (o.type !== "opening") fail(`${path}.type`, "ouverture attendue");
  const kind = Object.hasOwn(o, "kind") ? o.kind : undefined;
  if (kind !== undefined && (typeof kind !== "string" || !STUDIO_OPENING_KINDS.includes(kind as StudioOpeningKind))) fail(`${path}.kind`, "type déclaré porte, fenetre ou baie attendu (ou absent)");
  return {
    id: identifier(o.id, `${path}.id`), type: "opening", hostId: identifier(o.hostId, `${path}.hostId`),
    position: positifOuNul(o.position, `${path}.position`, "position"),
    width: positif(o.width, `${path}.width`, "largeur"),
    height: positif(o.height, `${path}.height`, "hauteur"),
    sill: positifOuNul(o.sill, `${path}.sill`, "allège"),
    ...(kind !== undefined ? { kind: kind as StudioOpeningKind } : {}),
  };
}

export function validerElementArchitectural(value: unknown, path: string): StudioArchitectureItem {
  const t = discriminator(value, path);
  if (t === "wall") return validerMur(value, path);
  if (t === "opening") return validerOuverture(value, path);
  return fail(`${path}.type`, "objet architectural wall ou opening attendu");
}

/** Lecture dérivée du document architectural : géométrie de chaque mur et placement de chaque ouverture. */
export interface ArchitectureLue {
  murs: Map<string, { mur: StudioWall; geometrie: GeometrieMur; ouvertures: OuverturePlacee[] }>;
  ouvertures: Map<string, OuverturePlacee>;
}

/**
 * Compatibilité de l'ensemble (éléments déjà validés) : hôte présent et mur, placement de chaque ouverture, aucun
 * chevauchement deux à deux sur un même mur. Refus au premier motif, avec l'identifiant des objets en cause.
 */
export function controlerArchitecture(items: readonly StudioArchitectureItem[], path: string): ArchitectureLue {
  return controler(items, path, null);
}

/**
 * Contrôle limité aux murs `murIds` et à leurs ouvertures (ce qu'une commande a touché) : les autres murs n'ont pas
 * changé, leur compatibilité tient toujours. Géométrie mémorisée par mur, chevauchements par balayage : le coût d'une
 * commande ne dépend plus de la taille du document (hormis un parcours linéaire sans géométrie).
 */
export function controlerMurs(items: readonly StudioArchitectureItem[], murIds: Iterable<string>, path: string): void {
  const ids = new Set(murIds);
  if (ids.size) controler(items, path, ids);
}

function controler(items: readonly StudioArchitectureItem[], path: string, filtre: Set<string> | null): ArchitectureLue {
  const murs: ArchitectureLue["murs"] = new Map();
  for (const it of items) {
    if (it.type !== "wall" || (filtre && !filtre.has(it.id))) continue;
    const g = geometrieMur(it);
    if (!g.ok) fail(path, `mur ${it.id} : ${g.raison}`);
    murs.set(it.id, { mur: it, geometrie: g.valeur, ouvertures: [] });
  }
  const ouvertures: ArchitectureLue["ouvertures"] = new Map();
  const rang = new Map<string, number>();
  items.forEach((it, i) => {
    if (it.type !== "opening" || (filtre && !filtre.has(it.hostId))) return;
    rang.set(it.id, i);
    const hote = murs.get(it.hostId);
    if (!hote) fail(path, items.some((x) => x.id === it.hostId) ? `ouverture ${it.id} : l’hôte ${it.hostId} n’est pas un mur` : `ouverture ${it.id} : mur hôte ${it.hostId} introuvable`);
    const p = placerOuverture(hote.mur, hote.geometrie, it);
    if (!p.ok) fail(path, `ouverture ${it.id} incompatible avec son mur : ${p.raison}`);
    hote.ouvertures.push(p.valeur);
    ouvertures.set(it.id, p.valeur);
  });
  // Chevauchements deux à deux par mur, par balayage le long de l'axe (ordre du document pour nommer la paire).
  for (const m of murs.values()) {
    const tri = [...m.ouvertures].sort((a, b) => a.ouverture.position - b.ouverture.position);
    const actives: OuverturePlacee[] = [];
    for (const o of tri) {
      for (let k = actives.length - 1; k >= 0; k--) {
        const a = actives[k]!;
        if (a.ouverture.position + a.ouverture.width <= o.ouverture.position + m.geometrie.tolerance) { actives.splice(k, 1); continue; }
        if (ouverturesSeChevauchent(a.ouverture, o.ouverture, m.geometrie.tolerance)) {
          const [x, y] = rang.get(a.ouverture.id)! < rang.get(o.ouverture.id)! ? [a, o] : [o, a];
          fail(path, `ouvertures ${x.ouverture.id} et ${y.ouverture.id} : elles se chevauchent sur le mur hôte ${m.mur.id}`);
        }
      }
      actives.push(o);
    }
  }
  return { murs, ouvertures };
}

/** Lecture tolérante pour les exports et le métré d'un document déjà validé. */
export function lireArchitecture(items: readonly StudioArchitectureItem[] | undefined): ArchitectureLue {
  return controlerArchitecture(items ?? [], "studioDocument.architecture");
}
