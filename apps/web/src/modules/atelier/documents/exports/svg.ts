/**
 * Export SVG de la vue de plan (DA-14-01-a) : SVG 1.1 autonome (ni script ni ressource externe), fond blanc,
 * 1 m = 100 unités (`viewBox`, comme le prototype), axe y vers le haut du repère local retourné pour l'écran,
 * marge de 1 m autour de l'emprise. Un groupe `<g>` par calque (couleur du calque), textes en nœuds texte
 * échappés (jamais interprétés), arcs facettés (mêmes facettes que la zone de travail). `<title>` et `<metadata>` :
 * projet, niveau, révision, empreinte, date, unités et mention « vue de travail, sans échelle ». Module pur.
 */
import type { DessinPlan, FormeDessin, StyleDessin } from "../../socle";
import { pointsDeForme } from "../../plan2d/dessinateurs";
import type { Vec } from "../../plan2d/geometrie";
import { INTERLIGNE, lignesTexte } from "../annotations";
import { CALQUE_SANS, type CalqueExport, type VueExport } from "./vue";

/** Unités SVG par mètre. */
export const UNITES_PAR_METRE = 100;
/** Marge autour de l'emprise (m). */
export const MARGE = 1;
export const COULEUR_DEFAUT = "#1f2937";
export const COULEUR_ANNOTATION = "#1f4e79";

export const echapperXml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Cadre de la feuille SVG (unités SVG) et conversion repère local → SVG. */
export interface CadreSvg {
  readonly largeur: number;
  readonly hauteur: number;
  vers(p: Vec): Vec;
}

export function cadreSvg(v: Pick<VueExport, "emprise">): CadreSvg {
  const { minX, minY, maxX, maxY } = v.emprise;
  return {
    largeur: (maxX - minX + 2 * MARGE) * UNITES_PAR_METRE,
    hauteur: (maxY - minY + 2 * MARGE) * UNITES_PAR_METRE,
    vers: (p) => ({ x: (p.x - minX + MARGE) * UNITES_PAR_METRE, y: (maxY + MARGE - p.y) * UNITES_PAR_METRE }),
  };
}

const EPAISSEUR: Readonly<Record<StyleDessin, number>> = { trait: 2, plein: 1, hachure: 0.6, fin: 0.8, annotation: 1 };

function forme(f: FormeDessin, c: CadreSvg, couleur: string): string {
  const coul = f.style === "annotation" ? COULEUR_ANNOTATION : couleur;
  const trait = `stroke="${coul}" stroke-width="${EPAISSEUR[f.style]}"`;
  const remplissage = f.style === "plein" ? `fill="${coul}" fill-opacity="0.12"` : `fill="none"`;
  const xy = (p: Vec) => {
    const q = c.vers(p);
    return `${q.x} ${q.y}`;
  };
  switch (f.forme) {
    case "cercle": {
      const q = c.vers(f.centre);
      return `<circle cx="${q.x}" cy="${q.y}" r="${f.rayon * UNITES_PAR_METRE}" ${remplissage} ${trait}/>`;
    }
    case "texte": {
      const q = c.vers(f.position);
      const h = f.hauteur * UNITES_PAR_METRE;
      const lignes = lignesTexte(f.texte).map((l, i) => `<tspan x="${q.x}" dy="${i === 0 ? 0 : h * INTERLIGNE}">${echapperXml(l)}</tspan>`);
      return `<text x="${q.x}" y="${q.y}" font-family="sans-serif" font-size="${h}" fill="${coul}" xml:space="preserve">${lignes.join("")}</text>`;
    }
    default: {
      const { points, ferme } = pointsDeForme(f);
      if (points.length === 0) return "";
      const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${xy(p)}`).join(" ");
      return `<path d="${d}${ferme ? " Z" : ""}" ${ferme ? remplissage : `fill="none"`} ${trait} stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  }
}

/** Dessins regroupés par calque, dans l'ordre de dessin (couche, puis identifiant). */
export function parCalque(v: Pick<VueExport, "dessins" | "calques">): { calque: CalqueExport; dessins: DessinPlan[] }[] {
  const groupes = new Map<string, { calque: CalqueExport; dessins: DessinPlan[] }>();
  for (const d of v.dessins) {
    const calque = v.calques.get(d.objetId) ?? CALQUE_SANS;
    const cle = calque.id ?? "";
    const g = groupes.get(cle) ?? { calque, dessins: [] };
    g.dessins.push(d);
    groupes.set(cle, g);
  }
  return [...groupes.values()];
}

export function construireSvg(v: VueExport): string {
  const c = cadreSvg(v);
  const m = v.meta;
  const titre = `Plan · ${m.niveauNom} · révision ${m.revision}`;
  const meta = [
    ["projet", m.projetId],
    ["niveau", m.niveauNom],
    ["niveauId", m.niveauId],
    ["revision", String(m.revision)],
    ["empreinte", m.empreinte],
    ["date", m.date.toISOString()],
    ["unites", `m (repère local du projet), ${UNITES_PAR_METRE} unités SVG par mètre`],
    ["mention", "vue de travail, sans échelle"],
  ]
    .map(([k, val]) => `<fadi:${k}>${echapperXml(val as string)}</fadi:${k}>`)
    .join("");
  const groupes = parCalque(v)
    .map(({ calque, dessins }) => {
      const couleur = calque.couleur ?? COULEUR_DEFAUT;
      const corps = dessins.map((d) => `<g data-objet="${echapperXml(d.objetId)}">${d.formes.map((f) => forme(f, c, couleur)).join("")}</g>`).join("");
      return `<g data-calque="${echapperXml(calque.nom)}">${corps}</g>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:fadi="https://fadi.app/atelier/export" version="1.1" width="${c.largeur}" height="${c.hauteur}" viewBox="0 0 ${c.largeur} ${c.hauteur}">` +
    `<title>${echapperXml(titre)}</title><metadata>${meta}</metadata>` +
    `<rect x="0" y="0" width="${c.largeur}" height="${c.hauteur}" fill="#ffffff"/>${groupes}</svg>\n`
  );
}
