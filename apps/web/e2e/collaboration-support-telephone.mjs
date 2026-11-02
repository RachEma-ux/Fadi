#!/usr/bin/env node
/**
 * Collaboration > Accès support sur téléphone (reliquat du chantier organisations-participation, Issue #262) : quand un
 * administrateur de la plateforme au nom et à l'adresse longs existe, la liste de choix du formulaire ne doit pas élargir
 * la page (défaut constaté : 17 px et plus de défilement horizontal). La base (`DATABASE_URL`, locale et jetable) sert à
 * nommer l'administrateur.
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL=postgresql://… node apps/web/e2e/collaboration-support-telephone.mjs
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import pg from "pg";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const dbUrl = process.env.DATABASE_URL ?? "";
if (!["localhost", "127.0.0.1"].includes(new URL(dbUrl).hostname)) throw new Error("DATABASE_URL doit désigner une base locale jetable");
const sql = new pg.Client({ connectionString: dbUrl });
await sql.connect();

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; };

const RUN = randomUUID().slice(0, 8);
const PASSWORD = "Motdepasse-recette-123!";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
try {
  const admin = await browser.newContext();
  const adminEmail = `administratrice-plateforme-adresse-tres-longue-${RUN}@organisation-au-nom-tres-long.test`;
  check("compte administrateur créé", (await admin.request.post(`${BASE}/auth/register`, { data: { email: adminEmail, password: PASSWORD }, headers: { origin: BASE } })).status() === 201);
  await sql.query("UPDATE users SET platform_role = 'admin', display_name = 'Administratrice de la plateforme au nom particulièrement long' WHERE email = $1", [adminEmail]);

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await phone.newPage();
  check("propriétaire créé", (await page.request.post(`${BASE}/auth/register`, { data: { email: `support-tel-${RUN}@example.test`, password: PASSWORD }, headers: { origin: BASE } })).status() === 201);
  const created = await page.request.post(`${BASE}/projects`, { data: { code: `ST_${RUN.slice(0, 4)}`, name: "Accès support sur téléphone (recette synthétique)" }, headers: { origin: BASE } });
  const pid = (await created.json()).id;
  await page.goto(`${BASE}/projets/${pid}?module=collaboration`);
  await page.locator("[data-support-panel] select").waitFor({ timeout: 30000 });
  check("formulaire « Accès support » affiché avec l'administrateur au nom long", (await page.locator("[data-support-panel] select option").allTextContents()).some((t) => t.includes("particulièrement long")));
  const m = await page.evaluate(() => {
    const panel = document.querySelector("[data-support-panel]");
    return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, panel: panel.scrollWidth - panel.clientWidth };
  });
  check("téléphone : aucun défilement horizontal de la page ni du panneau", m.page <= 0 && m.panel <= 0, JSON.stringify(m));
} catch (e) {
  check("déroulé sans erreur inattendue", false, String(e?.stack ?? e).split("\n").slice(0, 2).join(" "));
} finally {
  await browser.close();
  await sql.end();
}
console.log(failures ? `✗ ${failures} contrôle(s) en échec` : "✓ recette de l'accès support sur téléphone conforme");
process.exit(failures ? 1 : 0);
