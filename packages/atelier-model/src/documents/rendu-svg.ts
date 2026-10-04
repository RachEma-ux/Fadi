/**
 * Rendu SVG des documents dérivés : une vue seule (à son échelle, en millimètres) ou une feuille complète.
 * Pur et reproductible : mêmes primitives, mêmes octets (coordonnées arrondies au centième de millimètre).
 */
import type { Vec } from "../geometrie.js";
import { EPAISSEUR_MM, GRIS_REMPLISSAGE, GRIS_TRAIT, ROUGE_A_REPARER, TIRETS_MM, type Primitive, type Trait } from "./dessin.js";
import type { VueGeneree } from "./vues.js";
import { comparerDessins } from "../versions.js";

const n2 = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) || Math.abs(r) < 0.005 ? "0" : String(r);
};
const gris = (g: number) => {
  const c = Math.round(g * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${c}${c}${c}`;
};
export const echapperXml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const couleurTrait = (t: Trait) => (t === "a-reparer" ? ROUGE_A_REPARER : gris(GRIS_TRAIT[t]));
const styleTrait = (t: Trait) => `stroke="${couleurTrait(t)}" stroke-width="${EPAISSEUR_MM[t]}"${TIRETS_MM[t].length ? ` stroke-dasharray="${TIRETS_MM[t].join(" ")}"` : ""}`;

/** Transformation d'une vue vers la feuille : point du dessin (m) → point de la feuille (mm, y vers le bas). */
export type VersFeuille = (p: Vec) => Vec;

/**
 * Éléments SVG des primitives : remplissages d'abord, puis traits groupés par nature, puis textes (lisibles
 * au-dessus du dessin). Chaque élément porte l'objet dessiné (`data-objet`) pour la sélection depuis l'aperçu.
 */
export function elementsSvg(primitives: readonly Primitive[], vers: VersFeuille): string {
  const remplis: string[] = [];
  const traits = new Map<Trait, string[]>();
  const textes: string[] = [];
  const obj = (id: string | null) => (id ? ` data-objet="${echapperXml(id)}"` : "");
  const chemin = (pts: readonly Vec[], ferme: boolean) => {
    const q = pts.map(vers);
    return `M${q.map((p) => `${n2(p.x)} ${n2(p.y)}`).join("L")}${ferme ? "Z" : ""}`;
  };
  const ajouter = (t: Trait, el: string) => {
    const l = traits.get(t);
    if (l) l.push(el);
    else traits.set(t, [el]);
  };
  for (const p of primitives) {
    switch (p.type) {
      case "ligne": {
        const a = vers(p.a);
        const b = vers(p.b);
        ajouter(p.trait, `<line x1="${n2(a.x)}" y1="${n2(a.y)}" x2="${n2(b.x)}" y2="${n2(b.y)}"${obj(p.objetId)}/>`);
        break;
      }
      case "poly": {
        if (p.remplissage) remplis.push(`<path d="${chemin(p.points, true)}" fill="${gris(GRIS_REMPLISSAGE[p.remplissage])}" stroke="none"${obj(p.objetId)}/>`);
        if (p.trait) ajouter(p.trait, `<path d="${chemin(p.points, p.ferme)}"${obj(p.objetId)}/>`);
        break;
      }
      case "cercle": {
        const c = vers(p.centre);
        const r = Math.hypot(vers({ x: p.centre.x + p.rayon, y: p.centre.y }).x - c.x, vers({ x: p.centre.x + p.rayon, y: p.centre.y }).y - c.y);
        ajouter(p.trait, `<circle cx="${n2(c.x)}" cy="${n2(c.y)}" r="${n2(r)}"${obj(p.objetId)}/>`);
        break;
      }
      case "texte": {
        const q = vers(p.position);
        const ancre = p.ancre === "debut" ? "start" : p.ancre === "fin" ? "end" : "middle";
        const rot = p.angle ? ` transform="rotate(${n2(-p.angle)} ${n2(q.x)} ${n2(q.y)})"` : "";
        textes.push(`<text x="${n2(q.x)}" y="${n2(q.y)}" font-size="${n2(p.hauteurMm)}" text-anchor="${ancre}" fill="${couleurTrait(p.trait)}"${rot}${obj(p.objetId)}>${echapperXml(p.texte)}</text>`);
        break;
      }
    }
  }
  const ordre: Trait[] = ["fin", "cache", "demoli", "vue", "site", "coupe", "annotation", "a-reparer"];
  const groupes = ordre.filter((t) => traits.has(t)).map((t) => `<g class="trait-${t}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${styleTrait(t)}>${traits.get(t)!.join("")}</g>`);
  return `<g class="remplissages">${remplis.join("")}</g>${groupes.join("")}<g class="textes" font-family="Helvetica, Arial, sans-serif">${textes.join("")}</g>`;
}

/** Marge autour du dessin d'une vue seule (mm). */
const MARGE = 10;

/** Dimensions sur la feuille (mm) d'une vue générée à son échelle. */
export function tailleVueMm(vue: VueGeneree): { largeur: number; hauteur: number } {
  if (!vue.bornes) return { largeur: 2 * MARGE, hauteur: 2 * MARGE };
  const k = 1000 / vue.params.echelle;
  return { largeur: (vue.bornes.max.x - vue.bornes.min.x) * k + 2 * MARGE, hauteur: (vue.bornes.max.y - vue.bornes.min.y) * k + 2 * MARGE };
}

/** Vue seule en SVG, à son échelle (1 unité = 1 mm), avec son titre, sa révision et son empreinte. */
export function svgVue(vue: VueGeneree, revision: number): string {
  const { largeur, hauteur } = tailleVueMm(vue);
  const k = 1000 / vue.params.echelle;
  const b = vue.bornes ?? { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const vers: VersFeuille = (p) => ({ x: MARGE + (p.x - b.min.x) * k, y: MARGE + (b.max.y - p.y) * k });
  const H = hauteur + 12;
  const titre = `${vue.params.titre} · 1:${vue.params.echelle} · révision ${revision} · empreinte ${vue.empreinte}`;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(largeur)}mm" height="${n2(H)}mm" viewBox="0 0 ${n2(largeur)} ${n2(H)}" data-revision="${revision}" data-empreinte="${vue.empreinte}">`,
    `<title>${echapperXml(vue.params.titre)}</title>`,
    `<rect x="0" y="0" width="${n2(largeur)}" height="${n2(H)}" fill="#ffffff"/>`,
    elementsSvg(vue.primitives, vers),
    `<text x="${MARGE}" y="${n2(hauteur + 6)}" font-family="Helvetica, Arial, sans-serif" font-size="3" fill="#1a1a1a">${echapperXml(titre)}</text>`,
    `</svg>`,
    "",
  ].join("\n");
}

/** Feuille complète en SVG (1 unité = 1 mm, y de la feuille vers le haut converti). */
export function svgFeuille(f: import("./feuilles.js").FeuilleComposee): string {
  const vers: VersFeuille = (p) => ({ x: p.x, y: f.hauteur - p.y });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(f.largeur)}mm" height="${n2(f.hauteur)}mm" viewBox="0 0 ${n2(f.largeur)} ${n2(f.hauteur)}" data-empreinte="${f.empreinte}">`,
    `<title>${echapperXml(`${f.params.numero} · ${f.params.titre}`)}</title>`,
    `<rect x="0" y="0" width="${n2(f.largeur)}" height="${n2(f.hauteur)}" fill="#ffffff"/>`,
    elementsSvg(f.primitives, vers),
    `</svg>`,
    "",
  ].join("\n");
}

/**
 * Comparaison d'une vue entre deux états (lot 7) : le dessin courant en grisé, les traits disparus en rouge, les
 * traits nouveaux en vert, sur les bornes réunies des deux dessins (même repère, même échelle).
 */
export function svgComparaisonVues(avant: VueGeneree, apres: VueGeneree, revision: number, libelleAvant: string): { svg: string; retirees: number; ajoutees: number } {
  const d = comparerDessins(avant, apres);
  const ba = avant.bornes;
  const bb = apres.bornes;
  const bornes = ba && bb ? { min: { x: Math.min(ba.min.x, bb.min.x), y: Math.min(ba.min.y, bb.min.y) }, max: { x: Math.max(ba.max.x, bb.max.x), y: Math.max(ba.max.y, bb.max.y) } } : (ba ?? bb);
  const vue: VueGeneree = { ...apres, bornes };
  const { largeur, hauteur } = tailleVueMm(vue);
  const k = 1000 / vue.params.echelle;
  const b = bornes ?? { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const vers: VersFeuille = (p) => ({ x: MARGE + (p.x - b.min.x) * k, y: MARGE + (b.max.y - p.y) * k });
  const H = hauteur + 12;
  const legende = `Comparaison : ${libelleAvant} → révision ${revision} · ${d.retirees.length} trait(s) retiré(s) en rouge, ${d.ajoutees.length} ajouté(s) en vert`;
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(largeur)}mm" height="${n2(H)}mm" viewBox="0 0 ${n2(largeur)} ${n2(H)}" data-comparaison="${d.retirees.length}:${d.ajoutees.length}">`,
    `<title>${echapperXml(`${vue.params.titre} · comparaison`)}</title>`,
    `<style>.cmp-retire *{stroke:#b3261e!important;stroke-width:0.7!important;fill:none!important}.cmp-retire text{fill:#b3261e!important;stroke:none!important}.cmp-ajoute *{stroke:#1d7a46!important;stroke-width:0.7!important}.cmp-ajoute text{fill:#1d7a46!important;stroke:none!important}</style>`,
    `<rect x="0" y="0" width="${n2(largeur)}" height="${n2(H)}" fill="#ffffff"/>`,
    `<g opacity="0.3">${elementsSvg(apres.primitives, vers)}</g>`,
    `<g class="cmp-retire">${elementsSvg(d.retirees, vers)}</g>`,
    `<g class="cmp-ajoute">${elementsSvg(d.ajoutees, vers)}</g>`,
    `<text x="${MARGE}" y="${n2(hauteur + 6)}" font-family="Helvetica, Arial, sans-serif" font-size="3" fill="#1a1a1a">${echapperXml(legende)}</text>`,
    `</svg>`,
    "",
  ].join("\n");
  return { svg, retirees: d.retirees.length, ajoutees: d.ajoutees.length };
}
