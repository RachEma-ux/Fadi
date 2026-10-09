/**
 * Recette de l'interface en anglais (D-163) : choix de la langue, parcours des écrans principaux en anglais et
 * relevé des textes restés en français dans l'interface (hors données du projet marquées translate="no", champs de
 * saisie, documents produits). Le relevé est écrit dans OUT/residus-anglais.txt.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/interface-anglais.mjs
 */
import { writeFileSync } from "node:fs";
import { allerEnPlan, basculerCanevas } from "./lib-barre.mjs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const SEUIL = Number(process.env.SEUIL ?? "0.02");
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
const api = async (m, c, data) => {
  const r = await page.request[m](`${BASE}${c}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};

// Langue choisie sur la page d'inscription : la page se recharge en anglais.
await page.goto(`${BASE}/inscription`);
await page.locator("[data-choix-langue]").selectOption("en");
await page.waitForFunction(() => document.documentElement.lang === "en");
check("choix de la langue : la page se recharge en anglais (html lang=en)", await page.evaluate(() => document.documentElement.lang) === "en");
check("inscription : titre en anglais", (await page.locator("h1").textContent())?.trim() === "Create an account");
await page.fill('input[name="email"]', `en-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "english-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "P.118 · EN" })).body.id;

// Données du projet et contenus de référence (jamais traduits) : modèle, réponses saisies, fichiers, programme,
// bibliothèque des bâtiments, noms de projets. Un relevé qui en contient une n'est pas compté comme interface.
const donnees = new Set();
const recolter = (v, cle = "") => {
  if (typeof v === "string") { const t = v.replace(/\s+/g, " ").trim(); if (t.length >= 4 && /[A-Za-zÀ-ÿ]/.test(t)) donnees.add(t); }
  else if (Array.isArray(v)) v.forEach((x) => recolter(x, cle));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) recolter(x, k);
};
recolter((await api("get", `/projects/${pid}/atelier/model`)).body);
for (const st of (await api("get", `/projects/${pid}/steps`)).body ?? []) recolter(st.content?.fields);
recolter((await api("get", `/projects/${pid}/files`)).body);
recolter((await api("get", `/projects/${pid}/programme`)).body);
recolter((await api("get", "/projects")).body);
recolter((await api("get", "/examples")).body);
const bib = (await api("get", "/library/buildings")).body;
recolter({ ...bib, steps: [] });
for (const c of (bib?.cases ?? bib?.items ?? []).slice(0, 40)) recolter((await api("get", `/library/buildings/${encodeURIComponent(c.id)}`)).body);
const estDonnee = (t) => donnees.has(t) || [...donnees].some((d) => d.length >= 8 && t.includes(d)) || (t.length >= 8 && [...donnees].some((d) => d.includes(t)));
console.log(`(${donnees.size} textes de données exclus du relevé)`);

const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|niveau|étape|projet|modèle)\b/i;
const residus = new Map();
let total = 0;
async function releve(nom) {
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const out = [];
    const exclu = (n) => {
      for (let e = n.parentElement; e; e = e.parentElement) {
        if (e.getAttribute("translate") === "no" || ["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "OPTION"].includes(e.tagName)) return true;
        const s = getComputedStyle(e);
        if (s.display === "none" || s.visibility === "hidden") return true;
      }
      return false;
    };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.nodeValue ?? "").replace(/\s+/g, " ").trim();
      if (t.length < 2 || !/[A-Za-zÀ-ÿ]/.test(t) || exclu(n)) continue;
      out.push(t);
    }
    for (const el of document.querySelectorAll("[title],[aria-label],[placeholder]")) {
      if (el.closest('[translate="no"]')) continue;
      for (const a of ["title", "aria-label", "placeholder"]) {
        const v = el.getAttribute(a);
        if (v && /[A-Za-zÀ-ÿ]/.test(v)) out.push(v.trim());
      }
    }
    return out;
  });
  total += r.length;
  for (const t of r) if (FR.test(t) && !estDonnee(t)) residus.set(t, (residus.get(t) ?? new Set()).add(nom));
  return r.length;
}

const ecrans = [
  ["accueil", "/accueil"],
  ["projets", "/projets"],
  ["parametres", "/parametres"],
  ["harmonie", "/harmonie"],
  ["bibliotheque", "/bibliotheque/batiments"],
  ["parcours", `/projets/${pid}?module=parcours`],
  ["etape-03", `/projets/${pid}?module=parcours&etape=3`],
  ["programmation", `/projets/${pid}?module=programmation`],
  ["analyses", `/projets/${pid}?module=analyses`],
  ["documents", `/projets/${pid}?module=documents`],
  ["collaboration", `/projets/${pid}?module=collaboration`],
  ["atelier", `/projets/${pid}?module=atelier`],
];
for (const [nom, url] of ecrans) {
  await page.goto(`${BASE}${url}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  if (nom === "atelier") await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  await releve(nom);
  if (["accueil", "etape-03", "analyses"].includes(nom)) await page.screenshot({ path: `${OUT}/interface-anglais-${nom}.png` });
}
check("accueil : navigation principale en anglais", (await page.locator(".app-nav").textContent())?.includes("My projects"));
// Atelier : disposition Canevas, panneaux, menu, 3D.
await basculerCanevas(page);
for (const p of ["instructeur", "outliner", "affichage", "materiaux", "modele", "navigation", "raccourcis"]) {
  await page.locator(`[data-panneau-icone="${p}"]`).click();
  await releve(`atelier-${p}`);
}
await page.locator("[data-menu-principal] > summary").click();
await releve("atelier-menu");
check("menu principal en anglais", (await page.locator('[data-menu="enregistrer"]').textContent())?.includes("Save now"));
await page.keyboard.press("Escape");
await page.locator('.barre-mode button:has-text("3D")').click();
await page.waitForSelector(".vue3d canvas", { timeout: 30000 });
await releve("atelier-3d");
await page.locator('.barre-mode button:has-text("Documents")').click();
await page.waitForTimeout(1500);
await releve("atelier-documents");
await page.screenshot({ path: `${OUT}/interface-anglais-atelier.png` });
await allerEnPlan(page);
await basculerCanevas(page);

const liste = [...residus].sort((a, b) => b[1].size - a[1].size).map(([t, s]) => `${t}\t${[...s].join(",")}`);
writeFileSync(`${OUT}/residus-anglais.txt`, liste.join("\n"));
const part = residus.size / Math.max(1, total);
check(`textes d'interface restés en français : ${residus.size} distincts sur ${total} relevés (seuil ${SEUIL * 100} %)`, part <= SEUIL, `${(part * 100).toFixed(2)} %`);

// Retour au français.
await page.goto(`${BASE}/parametres`);
await page.locator("[data-settings-langue] [data-choix-langue]").selectOption("fr");
await page.waitForFunction(() => document.documentElement.lang === "fr");
check("retour au français depuis les paramètres", (await page.locator(".app-nav").textContent())?.includes("Mes projets"));
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await browser.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette de l'interface anglaise : tout est vert.");
process.exit(echecs ? 1 : 0);
