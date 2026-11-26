#!/usr/bin/env node
/**
 * Recette Design — relevé des écrans de niveau A (chantier docs/workstreams/design, lot L0, recettes N1 à N4).
 * Pour chaque écran et chaque largeur (L1 Android 412 px, L2 bureau 1 440 px, L0 320 px) : axe-core, reflow, cibles
 * 2.5.8, et une planche. Mode RELEVÉ par défaut : rien ne bloque, le rapport `releve-design.json` fixe l'état de départ.
 * Mode bloquant (`DESIGN_BLOQUANT=1`) : toute violation axe critique ou grave absente de `design-exceptions.json` échoue.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/design node apps/web/e2e/design-releve.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { LARGEURS, axe, cibles, nouvellesGraves, reflow } from "./lib-design.mjs";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/design";
const BLOQUANT = process.env.DESIGN_BLOQUANT === "1";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => { console.log(`${ok ? "✓" : BLOQUANT ? "✗" : "·"} ${nom}${detail ? ` — ${detail}` : ""}`); if (!ok && BLOQUANT) echecs++; };

const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const amorce = await navigateur.newContext();
const page0 = await amorce.newPage();
const email = `design-${Date.now().toString(36)}@example.com`;
// Inscription par le lien du courriel (#428) : adresse sur /inscription, mot de passe sur la page du lien.
await inscrireDansLaPage(page0, email, "design-recette-123", BASE);
await page0.waitForURL(/\/(accueil|projets)/);
const reponse = await page0.request.post(`${BASE}/projects`, { data: { code: "P.DESIGN", name: "Design — écran témoin" } });
if (!reponse.ok()) throw new Error(`Préparation : POST /projects → ${reponse.status()}`);
const projet = (await reponse.json()).id;
const session = await amorce.storageState();
await amorce.close();

const ECRANS = [
  { cle: "connexion", chemin: "/connexion", public: true, pret: "main.auth-page" },
  { cle: "accueil", chemin: "/accueil", pret: "main.fadi-home" },
  { cle: "projets", chemin: "/projets", pret: "main.projects-page" },
  { cle: "projet", chemin: `/projets/${projet}`, pret: ".dossier-overview" },
  { cle: "parcours", chemin: `/projets/${projet}?module=parcours`, pret: "main.module-content-parcours" },
  { cle: "geodata", chemin: "/geodata", pret: "[data-geodata-page]" },
  { cle: "parametres", chemin: "/parametres", pret: "main.settings-page" },
];

const rapport = { base: BASE, date: new Date().toISOString(), bloquant: BLOQUANT, ecrans: [] };
for (const [code, largeur] of Object.entries(LARGEURS)) {
  for (const ecran of ECRANS) {
    const contexte = await navigateur.newContext({ ...largeur, storageState: ecran.public ? undefined : session });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    // Un écran non chargé n'est jamais audité : l'échec de navigation ou l'absence du repère propre à l'écran arrête la recette
    // (sinon axe et le reflow mesureraient une page vide ou une redirection, et le relevé serait faux sans le dire).
    const reponse = await page.goto(`${BASE}${ecran.chemin}`, { waitUntil: "domcontentloaded" });
    if (!reponse || !reponse.ok()) throw new Error(`${ecran.cle} · ${code} : navigation en échec (${reponse?.status() ?? "aucune réponse"}).`);
    await page.locator(ecran.pret).first().waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => { throw new Error(`${ecran.cle} · ${code} : repère « ${ecran.pret} » absent à ${page.url().replace(BASE, "")}, écran non chargé.`); });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const violations = await axe(page);
    const nouvelles = nouvellesGraves(violations, ecran.cle);
    const deborde = await reflow(page);
    const c = await cibles(page);
    await page.screenshot({ path: join(OUT, `avant-${ecran.cle}-${largeur.nom}.png`) });
    rapport.ecrans.push({ ecran: ecran.cle, largeur: code, url: page.url().replace(BASE, ""), axe: violations, nouvellesGraves: nouvelles.map((v) => v.id), reflowPx: deborde, cibles: c, erreurs });
    check(`${ecran.cle} · ${code} : aucune violation axe critique ou grave hors exceptions`, nouvelles.length === 0, nouvelles.map((v) => `${v.id}×${v.n}`).join(", "));
    console.log(`  reflow ${deborde.document} px, ${deborde.horsFenetre} élément(s) hors fenêtre, ${deborde.defilantsH} défilement(s) horizontal(aux)${deborde.exemples.length ? ` (${deborde.exemples.join(", ")})` : ""} · cibles < 24 px : ${c.sous24.length} / ${c.total} · < 48 px : ${c.sous48}`);
    await contexte.close();
  }
}
writeFileSync(join(OUT, "releve-design.json"), JSON.stringify(rapport, null, 2));
await navigateur.close();
console.log(`\nRelevé écrit : ${join(OUT, "releve-design.json")} (${rapport.ecrans.length} cas, mode ${BLOQUANT ? "bloquant" : "relevé"}).`);
if (echecs) { console.error(`Recette design : ${echecs} écart(s) bloquant(s).`); process.exit(1); }
