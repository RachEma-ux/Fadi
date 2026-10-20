/**
 * Curseur propre à chaque outil (lot 4, disposition proche de SketchUp) : une petite croix au point actif, et le
 * pictogramme de l'outil à côté, à sa teinte, détouré de blanc pour rester lisible sur le dessin. Pur : une chaîne CSS
 * `cursor` (image SVG en data URI, repli `crosshair`). Sélection et Lasso gardent la flèche du système, comme SketchUp.
 */
import { clePictogramme, type Pictogramme } from "@parcours/sandbox-planche-model";
import { PICTOGRAMMES } from "./donnees";
import type { Noeud } from "./construction";

/** Teintes claires validées (20 octobre 2026), reprises de `sandbox.css`. */
const TEINTES: Readonly<Record<Pictogramme["teinte"], string>> = {
  dessin: "#1f6fd1",
  modification: "#d23b2c",
  mesure: "#b5730a",
  materiau: "#c2410c",
  camera: "#1e8a5a",
  objets: "#3f5c7a",
  info: "#5b6672",
};

const kebab = (a: string) => a.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
const echapper = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const element = ([balise, attributs]: Noeud) => `<${balise} ${Object.entries(attributs).map(([k, v]) => `${kebab(k)}="${echapper(v)}"`).join(" ")}/>`;

/** Outils qui gardent le curseur du système (flèche). */
const FLECHE: ReadonlySet<string> = new Set(["selection", "lasso"]);

/** Valeur CSS `cursor` de l'outil : image 32 × 32, point actif en (4, 4), repli `crosshair`. */
export function curseurOutil(id: string, picto: Pictogramme): string {
  if (FLECHE.has(id)) return "default";
  const donnees = PICTOGRAMMES[clePictogramme(picto)];
  if (!donnees) return "crosshair";
  const corps = donnees.trait.map(element).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<path d="M4 0v8M0 4h8" stroke="#fff" stroke-width="3"/><path d="M4 0v8M0 4h8" stroke="#183d32" stroke-width="1"/>` +
    `<g transform="translate(9 9) scale(0.9)" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<g stroke="#fff" stroke-width="4">${corps}</g><g stroke="${TEINTES[picto.teinte]}" stroke-width="2">${corps}</g></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 4, crosshair`;
}
