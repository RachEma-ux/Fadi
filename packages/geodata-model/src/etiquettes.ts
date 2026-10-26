/**
 * Libellés de la carte (lot C, D-GD-24) : un libellé par entité (son nom) et, pour une couche thématique, la valeur de
 * l'indicateur **abrégée** (« 1,2 M », « 35 k », « 12,5 % »). Une valeur absente n'a pas de valeur affichée — jamais
 * « 0 » —, le nom reste ; la valeur complète est dans la fiche et la table. Les polices de la carte sont hébergées par
 * Fadi et ne couvrent que l'écriture latine (`CARACTERES_ETIQUETTE`) : un caractère hors de ces plages ne peut pas être
 * tracé, il est retiré du libellé de la carte (le nom complet reste dans la fiche).
 */
import { formatNombre } from "./mesures.js";
import type { ValeurIndicateur } from "./valeurs.js";

/** Plages Unicode des glyphes livrés (`apps/web/public/geodata/glyphes/`), par blocs de 256 comme les attend MapLibre. */
export const PLAGES_GLYPHES: readonly (readonly [number, number])[] = [[0, 255], [256, 511], [512, 767], [768, 1023], [7680, 7935], [8192, 8447]];

/** Police unique des libellés (dossier des glyphes). */
export const POLICE_ETIQUETTES = "NotoSans-Regular";

const traceable = (cp: number) => PLAGES_GLYPHES.some(([a, b]) => cp >= a && cp <= b);

/** Le texte peut-il être tracé entièrement avec les glyphes livrés ? */
export const CARACTERES_ETIQUETTE = (texte: string): boolean => [...texte].every((c) => traceable(c.codePointAt(0)!));

/** Garde les seuls caractères traçables ; espaces resserrés. Vide si rien ne reste (le code de l'entité sert alors). */
export function texteTracable(texte: string): string {
  return [...texte].filter((c) => traceable(c.codePointAt(0)!)).join("").replace(/\s+/g, " ").trim();
}

const sans0 = (s: string) => s.replace(/,0+(?=\D|$)/, "");

/**
 * Valeur abrégée pour un libellé de carte : pourcentage à une décimale ; au-delà de 10 000, milliers (k), millions (M)
 * ou milliards (Md) ; sinon le nombre (une décimale au plus). Format français (virgule, espace fine insécable).
 */
export function abregerValeur(x: number, unite: string | null): string {
  if (!Number.isFinite(x)) return "";
  if (unite === "%") return `${sans0(formatNombre(x, 1))} %`;
  const a = Math.abs(x);
  if (a >= 1e9) return `${sans0(formatNombre(x / 1e9, a >= 1e11 ? 0 : 1))} Md`;
  if (a >= 1e6) return `${sans0(formatNombre(x / 1e6, a >= 1e8 ? 0 : 1))} M`;
  if (a >= 1e4) return `${sans0(formatNombre(x / 1e3, a >= 1e5 ? 0 : 1))} k`;
  return sans0(formatNombre(x, Number.isInteger(x) ? 0 : 1));
}

/** Valeur abrégée de chaque entité (code → texte) ; les valeurs absentes n'ont pas d'entrée (aucune valeur affichée). */
export function valeursEtiquettes(valeurs: ReadonlyMap<string, ValeurIndicateur>, unite: string | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const [code, v] of valeurs) if (v.valeur !== null) m.set(code, abregerValeur(v.valeur, unite));
  return m;
}
