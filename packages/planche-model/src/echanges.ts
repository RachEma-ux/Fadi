/**
 * Lot 7, décision P-6 (D-173) : exports OBJ et STL (ASCII) d'une Planche — formats simples, sans dépendance, écrits à
 * partir des maillages de `maillagesPlanche` (coordonnées de la Planche, mètres, Z vers le haut). Texte reproductible :
 * même modèle, mêmes octets. L'OBJ garde un objet (`o`) par maillage ; le STL, un solide unique avec les normales des
 * triangles. Les entités hors géométrie (cotes, textes, guides) ne sont pas exportées.
 */
import type { Contexte, Id, Modele } from "./geometrie-libre.js";
import { maillagesPlanche, type MaillagePlanche } from "./representation.js";

/** Ce que l'export de maillage laisse de côté : arêtes libres (sans face) à tous les niveaux, annotations. */
export interface OmisExport {
  readonly aretesLibres: number;
  readonly annotations: number;
}

function aretesLibresDe(c: Contexte): number {
  const bordees = new Set<string>();
  const cle = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const f of Object.values(c.faces)) for (const b of [f.exterieur, ...f.trous]) for (let i = 0; i < b.length; i++) bordees.add(cle(b[i] as Id, b[(i + 1) % b.length] as Id));
  let n = 0;
  for (const a of Object.values(c.aretes)) if (!bordees.has(cle(a.a, a.b))) n++;
  return n;
}

/** Entités hors maillage : comptées pour prévenir (jamais exportées en silence). */
export function omisExport(m: Modele): OmisExport {
  let aretesLibres = aretesLibresDe(m.racine);
  for (const d of Object.values(m.definitions)) aretesLibres += aretesLibresDe(d.contenu);
  const an = m.annotations;
  const annotations = an ? Object.keys(an.guides ?? {}).length + Object.keys(an.cotes ?? {}).length + Object.keys(an.textes ?? {}).length : 0;
  return { aretesLibres, annotations };
}

const reel = (x: number): string => {
  const s = (Math.abs(x) < 5e-7 ? 0 : x).toFixed(6);
  return s.replace(/\.?0+$/, "") || "0";
};

/** Nom sûr pour `o` / `g` (OBJ) : pas d'espace ni de retour à la ligne. */
const nomObj = (n: string): string => n.replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_.-]/gu, "") || "objet";

export interface ExportMaillage {
  readonly contenu: string;
  /** Maillages écrits (objets et géométrie libre) et triangles. */
  readonly objets: number;
  readonly triangles: number;
  /** Laissé de côté par le format (déclaré à l'utilisateur). */
  readonly omis: OmisExport;
}

/** Wavefront OBJ : sommets `v` (m), faces triangulaires `f` indexées à partir de 1, un `o` par maillage. */
export function exporterObj(m: Modele, nom = "Planche"): ExportMaillage {
  const maillages = maillagesPlanche(m);
  const lignes: string[] = [`# Fadi — Planche « ${nom} » — unités : mètres, Z vers le haut`, "# OBJ écrit par Fadi (planche-model), triangles uniquement"];
  let base = 1;
  let triangles = 0;
  for (const mesh of maillages) {
    lignes.push(`o ${nomObj(`${mesh.id}_${mesh.nom}`)}`);
    for (let i = 0; i < mesh.positions.length; i += 3) lignes.push(`v ${reel(mesh.positions[i]!)} ${reel(mesh.positions[i + 1]!)} ${reel(mesh.positions[i + 2]!)}`);
    for (let k = 0; k < mesh.triangles.length; k += 3) {
      lignes.push(`f ${base + mesh.triangles[k]!} ${base + mesh.triangles[k + 1]!} ${base + mesh.triangles[k + 2]!}`);
      triangles++;
    }
    base += mesh.positions.length / 3;
  }
  return { contenu: lignes.join("\n") + "\n", objets: maillages.length, triangles, omis: omisExport(m) };
}

function normaleTriangle(p: readonly number[], a: number, b: number, c: number): [number, number, number] {
  const ux = p[b * 3]! - p[a * 3]!;
  const uy = p[b * 3 + 1]! - p[a * 3 + 1]!;
  const uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
  const vx = p[c * 3]! - p[a * 3]!;
  const vy = p[c * 3 + 1]! - p[a * 3 + 1]!;
  const vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

/** STL ASCII : un `solid` par Planche, chaque triangle avec sa normale (orientation des faces du maillage). */
export function exporterStl(m: Modele, nom = "Planche"): ExportMaillage {
  const maillages = maillagesPlanche(m);
  const lignes: string[] = [`solid ${nomObj(nom)}`];
  let triangles = 0;
  const ecrire = (mesh: MaillagePlanche) => {
    for (let k = 0; k < mesh.triangles.length; k += 3) {
      const [a, b, c] = [mesh.triangles[k]!, mesh.triangles[k + 1]!, mesh.triangles[k + 2]!];
      const n = normaleTriangle(mesh.positions, a, b, c);
      lignes.push(`  facet normal ${reel(n[0])} ${reel(n[1])} ${reel(n[2])}`, "    outer loop");
      for (const i of [a, b, c]) lignes.push(`      vertex ${reel(mesh.positions[i * 3]!)} ${reel(mesh.positions[i * 3 + 1]!)} ${reel(mesh.positions[i * 3 + 2]!)}`);
      lignes.push("    endloop", "  endfacet");
      triangles++;
    }
  };
  for (const mesh of maillages) ecrire(mesh);
  lignes.push(`endsolid ${nomObj(nom)}`);
  return { contenu: lignes.join("\n") + "\n", objets: maillages.length, triangles, omis: omisExport(m) };
}
