/**
 * Construction des données de pictogrammes du Sandbox (lot 3) : seules les icônes utilisées sont embarquées. Pur (ni
 * DOM, ni React, ni système de fichiers) : le générateur `apps/web/scripts/generer-pictogrammes-sandbox.ts` et le test
 * `pictogrammes.test.ts` lui passent les nœuds Tabler (`@tabler/icons`, version figée) et le texte des dessins sur mesure
 * (`sur-mesure/*.svg`), puis écrivent ou comparent `donnees.ts`.
 */
import { REGISTRE_SANDBOX, clePictogramme } from "@parcours/sandbox-planche-model";
import { ICONES_INTERFACE } from "./interface";

/** Un élément SVG : balise et attributs déjà nommés comme en React (`strokeDasharray`). */
export type Noeud = readonly [string, Readonly<Record<string, string>>];
export interface DonneesPictogramme {
  /** Variante au trait (2 px sur la grille de 24 px). */
  readonly trait: readonly Noeud[];
  /** Variante pleine de Tabler, quand elle existe : elle signale l'outil actif. */
  readonly plein?: readonly Noeud[];
}
export type NoeudsTabler = Readonly<Record<string, readonly (readonly [string, Record<string, string>])[]>>;

/** Clés de tous les pictogrammes utilisés : registre du Sandbox puis icônes de l'interface, sans doublon, triées. */
export function clesUtilisees(): string[] {
  const cles = new Set<string>(REGISTRE_SANDBOX.map((e) => clePictogramme(e.pictogramme)));
  for (const nom of Object.values(ICONES_INTERFACE)) cles.add(clePictogramme({ source: "tabler", nom }));
  return [...cles].sort();
}

const camel = (a: string) => a.replace(/-([a-z])/g, (_, l: string) => l.toUpperCase());
/** Attributs gardés : la géométrie et les styles de trait propres à un élément ; le reste vient du conteneur. */
const ATTRIBUTS = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "transform", "fill-rule", "clip-rule", "opacity"]);

function nettoyer(attributs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attributs)) if (ATTRIBUTS.has(k)) out[camel(k)] = v;
  return out;
}

/** Nœuds Tabler, sans le carré transparent de la grille (`M0 0h24v24H0z`, `stroke="none"`). */
function noeudsTabler(noeuds: readonly (readonly [string, Record<string, string>])[]): Noeud[] {
  return noeuds.filter(([, a]) => !(a.stroke === "none" && a.d === "M0 0h24v24H0z")).map(([tag, a]) => [tag, nettoyer(a)] as const);
}

/**
 * Dessin sur mesure : un SVG 24 × 24 au trait de 2 px (attributs de trait sur la racine ou un `<g>` unique), fait
 * d'éléments simples (path, circle, rect, line, polyline, polygon, ellipse). Tout autre contenu est une erreur.
 */
export function noeudsSurMesure(svg: string, nom: string): Noeud[] {
  if (!/viewBox="0 0 24 24"/.test(svg)) throw new Error(`Pictogramme sur mesure « ${nom} » : viewBox 0 0 24 24 attendu`);
  if (!/stroke-width="2"/.test(svg)) throw new Error(`Pictogramme sur mesure « ${nom} » : trait de 2 px attendu`);
  const noeuds: Noeud[] = [];
  for (const m of svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)\/?>/g)) {
    const attributs: Record<string, string> = {};
    for (const a of m[2]!.matchAll(/([a-z-]+)="([^"]*)"/g)) attributs[a[1]!] = a[2]!;
    noeuds.push([m[1]!, nettoyer(attributs)]);
  }
  if (noeuds.length === 0) throw new Error(`Pictogramme sur mesure « ${nom} » : aucun élément`);
  return noeuds;
}

/** Données de tous les pictogrammes utilisés ; une icône absente de Tabler ou un dessin manquant est une erreur. */
export function construirePictogrammes(trait: NoeudsTabler, plein: NoeudsTabler, surMesure: Readonly<Record<string, string>>): Record<string, DonneesPictogramme> {
  const out: Record<string, DonneesPictogramme> = {};
  for (const cle of clesUtilisees()) {
    const [source, nom] = cle.split(":") as ["tabler" | "fadi", string];
    if (source === "fadi") {
      const svg = surMesure[nom];
      if (svg === undefined) throw new Error(`Pictogramme sur mesure absent : ${nom}.svg`);
      out[cle] = { trait: noeudsSurMesure(svg, nom) };
      continue;
    }
    const t = trait[nom];
    if (!t) throw new Error(`Icône Tabler absente : ${nom}`);
    const p = plein[nom];
    out[cle] = p ? { trait: noeudsTabler(t), plein: noeudsTabler(p) } : { trait: noeudsTabler(t) };
  }
  return out;
}

/** Texte du module généré `donnees.ts` (stable : clés triées, une ligne par pictogramme). */
export function texteDonnees(donnees: Readonly<Record<string, DonneesPictogramme>>, version: string): string {
  const lignes = Object.keys(donnees)
    .sort()
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(donnees[k])},`);
  return `// Fichier généré par apps/web/scripts/generer-pictogrammes-sandbox.ts — ne pas modifier à la main.
// Icônes : Tabler Icons ${version} (licence MIT, voir LICENCE-TABLER-ICONS.txt) et dessins sur mesure de Fadi (sur-mesure/).
// Seules les icônes utilisées par le Sandbox sont embarquées.
import type { DonneesPictogramme } from "./construction";

export const VERSION_TABLER = ${JSON.stringify(version)};

export const PICTOGRAMMES: Readonly<Record<string, DonneesPictogramme>> = {
${lignes.join("\n")}
};
`;
}
