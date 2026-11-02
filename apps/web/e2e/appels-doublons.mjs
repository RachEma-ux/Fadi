#!/usr/bin/env node
/**
 * Recette « aucun appel API en double » : chaque écran est ouvert dans un vrai navigateur, ses requêtes vers l'API sont
 * relevées jusqu'au repos du réseau, et un même appel (même méthode, même adresse, paramètres compris) émis deux fois
 * pendant ce chargement est un échec. Comptes, projet et étude synthétiques créés par les vraies routes.
 *
 * Causes corrigées (2 novembre 2026) : plusieurs observateurs d'une même clé montés à quelques millisecondes d'écart
 * relançaient la lecture (fenêtre de déduplication de 2 s, `main.tsx`) ; préférences d'outils Studio relues par chaque
 * barre (`CatalogueOutils.tsx`) ; étude Studio invalidée au montage de la variante (`VariantWorkspace.tsx`).
 *
 * Exception déclarée : `GET /projects/:id/parcels` est lu par la page (état de transmission) et par l'outil Parcelle
 * intégré (`public/parcelle/index.html`, extrait tel quel du prototype, sa propre lecture sans cache à l'ouverture).
 *
 * BASE_URL=http://localhost:3001 [CHROMIUM_PATH=…] node apps/web/e2e/appels-doublons.mjs
 */
import { chromium } from "playwright";
import { randomBytes, randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}
/** Appels lus deux fois par conception (voir l'en-tête) : méthode et chemin, identifiants remplacés par « : ». */
const EXCEPTIONS = new Set(["GET /projects/:/parcels"]);
const RESSOURCES = new Set(["document", "script", "stylesheet", "image", "font", "media", "manifest"]);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext();
  const http = ctx.request;
  const cred = { email: `doublons-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") };
  check("compte créé", (await http.post(`${BASE}/auth/register`, { data: cred })).status() === 201);
  const projet = await http.post(`${BASE}/projects`, { data: { code: `DB_${randomUUID().slice(0, 6)}`, name: "Appels en double (recette synthétique)" } });
  check("projet créé", projet.status() === 201, String(projet.status()));
  const pid = (await projet.json()).id;
  const etude = await (await http.post(`${BASE}/projects/${pid}/studio/studies`, { data: { name: "Étude" } })).json();
  check("étude Studio créée", !!etude?.study?.id && !!etude?.variant?.id);

  const page = await ctx.newPage();
  let appels = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin !== BASE || RESSOURCES.has(r.resourceType())) return;
    appels.push(`${r.method()} ${u.pathname}${u.search}`);
  });
  const ecrans = [
    "/accueil", "/projets", `/projets/${pid}`,
    ...["parcours&etape=1", "parcours&etape=2", "atelier", "programmation", "analyses", "documents", "collaboration", "projets-sources"].map((m) => `/projets/${pid}?module=${m}`),
    `/projets/${pid}/pilotage`, `/studio/projets/${pid}/etudes/${etude.study.id}/variantes/${etude.variant.id}`, "/studio",
    "/collaboration", "/boite", "/organisations", "/revues", "/parametres", "/harmonie", "/bibliotheque/batiments", "/geodata",
  ];
  for (const ecran of ecrans) {
    appels = [];
    let erreur = "";
    await page.goto(BASE + ecran, { waitUntil: "networkidle", timeout: 60_000 }).catch((e) => { erreur = String(e.message).split("\n")[0]; });
    await page.waitForTimeout(2_000);
    const n = new Map();
    for (const a of appels) n.set(a, (n.get(a) ?? 0) + 1);
    const generique = (a) => a.split("?")[0].replace(/\/(proj|studio_study|studio_variant)_[0-9a-f-]+/g, "/:");
    const doublons = [...n].filter(([a, c]) => c > 1 && !EXCEPTIONS.has(generique(a))).map(([a, c]) => `${c}× ${a.replaceAll(pid, ":pid")}`);
    const nom = ecran.replaceAll(pid, ":pid").replace(/etudes\/[^/]+\/variantes\/[^/]+/, "etudes/:id/variantes/:id");
    check(`${nom} : aucun appel en double (${appels.length} appels)`, !erreur && doublons.length === 0, erreur || doublons.join(" ; "));
  }
} finally {
  await browser.close();
}
console.log(echecs ? `${echecs} échec(s)` : "Aucun appel API en double.");
process.exit(echecs ? 1 : 0);
