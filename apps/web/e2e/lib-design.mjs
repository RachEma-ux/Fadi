/**
 * Contrôles communs des recettes du chantier Design (docs/workstreams/design, lot L0, recettes N1).
 * Chaque fonction mesure et RENVOIE un résultat ; la recette décide si l'écart bloque (mode bloquant) ou s'il est
 * seulement relevé. Aucune fonction ne modifie la page.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const AXE = require.resolve("axe-core/axe.min.js");
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Largeurs fixées une fois (plan de recette Design, D-2) : L1 Android Pixel 7, L2 bureau, L0 320 px tactile. */
export const LARGEURS = {
  L1: { nom: "android", viewport: { width: 412, height: 839 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  L2: { nom: "bureau", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  L0: { nom: "320", viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** Exceptions axe datées (arbitrage 7) : liste qui ne peut que se réduire. */
export function lireExceptions() {
  return JSON.parse(readFileSync(join(WEB, "design-exceptions.json"), "utf8")).exceptions;
}

/** axe-core, balises WCAG 2.0 à 2.2 A et AA (mêmes balises que les recettes existantes). */
export async function axe(page, racine = "body") {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (sel) => (await window.axe.run(document.querySelector(sel) ?? document, {
    iframes: false, runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, cibles: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) })), racine);
}

/** Violations critiques ou graves qui ne figurent pas dans la liste d'exceptions pour cet écran. */
export function nouvellesGraves(violations, ecran, exceptions = lireExceptions()) {
  return violations.filter((v) => ["critical", "serious"].includes(v.impact)
    && !exceptions.some((e) => e.regle === v.id && (e.ecran === ecran || e.ecran === "*")));
}

/**
 * Reflow (1.4.10) : débordement horizontal du document (px CSS, 0 attendu) et éléments visibles qui dépassent le bord
 * droit de la fenêtre sans être dans un conteneur défilant (débordement masqué par un `overflow: hidden` parent).
 */
export function reflow(page) {
  return page.evaluate(() => {
    const document_ = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    const defile = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return true; } return false; };
    const hors = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest("canvas,svg,.maplibregl-map") && el.tagName !== "CANVAS") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= window.innerWidth + 1 || r.left >= window.innerWidth) continue;
      if (getComputedStyle(el).visibility === "hidden" || defile(el)) continue;
      if ([...el.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 1)) continue; // le plus profond seulement
      hors.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : ""} +${Math.round(r.right - window.innerWidth)} px`);
    }
    // Conteneurs qui défilent horizontalement (zone principale comprise) : un défilement horizontal du contenu courant
    // est un échec 1.4.10, sauf exceptions X (canevas, grilles à deux axes) déclarées dans la recette du lot.
    const defilants = [...document.body.querySelectorAll("*")].filter((el) => {
      const o = getComputedStyle(el).overflowX;
      return (o === "auto" || o === "scroll") && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !el.closest(".maplibregl-map");
    }).map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : ""} ${el.scrollWidth}/${el.clientWidth}`);
    return { document: document_, horsFenetre: hors.length, defilantsH: defilants.length, exemples: [...hors, ...defilants].slice(0, 5) };
  });
}

/**
 * Cibles (2.5.8) : commandes visibles dont la boîte fait moins de 24 px dans une dimension, hors liens dans une phrase
 * (exception « en ligne ») ; relève aussi les cibles sous 48 px (recommandation Android, arbitrage 7).
 */
export function cibles(page) {
  return page.evaluate(() => {
    const sel = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch]";
    const res = { sous24: [], sous48: 0, total: 0 };
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect(), st = getComputedStyle(el);
      if (!r.width || !r.height || st.visibility === "hidden" || st.display === "none") continue;
      if (el.tagName === "A" && st.display === "inline" && el.closest("p,li,td,dd")) continue;
      res.total++;
      const petit = Math.min(r.width, r.height);
      if (petit < 48) res.sous48++;
      if (petit < 24) res.sous24.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} ${Math.round(r.width)}×${Math.round(r.height)} « ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)} »`);
    }
    return res;
  });
}

/** Rapport de contraste WCAG entre deux couleurs calculées `rgb()` opaques. */
export function contraste(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
