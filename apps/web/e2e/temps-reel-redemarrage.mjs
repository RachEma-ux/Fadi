#!/usr/bin/env node
/**
 * Répétition du redémarrage de l'API (RTC-5, Issue #283 ; TR-T09 « redémarrage » ; retour arrière) : la commande
 * `REDEMARRER` (shell) arrête l'API par SIGTERM puis la relance. Exigé : les clients sont prévenus (fermeture 1001), la
 * session reste ouverte en base, le retour se fait avec un état **resynchronisé** (le journal de reprise en mémoire est
 * perdu, c'est voulu), la présence revient, aucune donnée n'est perdue (annotation enregistrée avant l'arrêt).
 * Hors CI (elle redémarre le serveur) : exécutée en local et en préproduction.
 *
 * BASE_URL=http://localhost:3001 REDEMARRER="systemctl restart fadi-api" node apps/web/e2e/temps-reel-redemarrage.mjs
 */
import { execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import WebSocket from "ws";
import { inviterEtAccepter } from "./lib-invitations.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const WS = BASE.replace(/^http/, "ws");
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const etat = { cookie: "" };
  const appel = async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { "content-type": "application/json", origin: BASE, ...(etat.cookie ? { cookie: etat.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) etat.cookie = set.map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
  appel.cookie = () => etat.cookie;
  return appel;
}

/** Connexion au canal : messages reçus, attente d'un message, code de fermeture. */
function canal(cookie, { origin = BASE, chemin = "/temps-reel" } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS}${chemin}`, { headers: { origin, ...(cookie ? { cookie } : {}) } });
    const recus = [];
    const attentes = [];
    const c = { ws, recus, ferme: null, statut: null };
    ws.on("message", (d) => {
      const m = JSON.parse(String(d));
      recus.push(m);
      for (const a of [...attentes]) if (a.f(m)) { attentes.splice(attentes.indexOf(a), 1); a.r(m); }
    });
    ws.on("close", (code) => { c.ferme = code; for (const a of attentes.splice(0)) a.r(null); });
    ws.on("unexpected-response", (_q, r) => { c.statut = r.statusCode; resolve(c); });
    ws.on("error", () => {});
    ws.on("open", () => resolve(c));
    c.envoyer = (m) => ws.send(JSON.stringify({ v: 1, ...m }));
    c.attendre = (f, ms = 5000) => {
      const deja = recus.find(f);
      if (deja) return Promise.resolve(deja);
      return new Promise((r) => { const a = { f, r }; attentes.push(a); setTimeout(() => { const i = attentes.indexOf(a); if (i >= 0) { attentes.splice(i, 1); r(null); } }, ms); });
    };
    c.fermeture = async (ms = 5000) => { const t0 = Date.now(); while (c.ferme === null && Date.now() - t0 < ms) await pause(25); return c.ferme; };
  });
}

const credentials = (n) => ({ email: `trd-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
if (!process.env.REDEMARRER) { console.log("REDEMARRER (commande shell) est requise."); process.exit(2); }
const hote = client(), lecteur = client();
const cH = credentials("h"), cL = credentials("l");
check("comptes créés", (await hote("POST", "/auth/register", cH)).status === 201 && (await lecteur("POST", "/auth/register", cL)).status === 201);
const projet = (await hote("POST", "/projects", { code: `TRD_${randomUUID().slice(0, 6)}`, name: "Redémarrage (recette synthétique)" })).body;
// Invitation acceptée (Issue #262, phase 3) : plus d'ajout direct d'un compte existant.
check("lecteur ajouté", (await inviterEtAccepter(hote, lecteur, projet.id, cL.email, "lecteur")).ok);
const etude = (await hote("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude" })).body;
const tr = `/projects/${projet.id}/temps-reel`;
const sessionId = (await hote("POST", `${tr}/sessions`, { studyId: etude.study.id, variantId: etude.variant.id, requestId: `trd-${randomUUID()}` })).body.session.id;
const a = await canal(hote.cookie()), b = await canal(lecteur.cookie());
for (const c of [a, b]) c.envoyer({ type: "rejoindre", sessionId });
check("deux personnes en session", !!(await a.attendre((m) => m.type === "etat")) && !!(await b.attendre((m) => m.type === "etat")));
const note = await hote("POST", `${tr}/sessions/${sessionId}/annotations`, { body: "Avant l'arrêt", audience: "projet", requestId: `trd-${randomUUID()}`, vue: { affichage: "2d", plan: { x: 0, y: 0, w: 5, h: 5 } } });
await b.attendre((m) => m.type === "evenement" && m.evenement.nature === "annotation");
const seq = Math.max(...b.recus.filter((m) => m.type === "evenement").map((m) => m.seq));
const t0 = Date.now();
execSync(process.env.REDEMARRER, { stdio: "inherit" });
check("clients prévenus à l'arrêt (1001)", (await a.fermeture(5000)) === 1001 && (await b.fermeture(5000)) === 1001, `${a.ferme}/${b.ferme}`);
let pret = false;
for (let i = 0; i < 120 && !pret; i++) { pret = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false); if (!pret) await pause(500); }
check(`API relancée (${Date.now() - t0} ms)`, pret);
const s = (await hote("GET", `${tr}/sessions/${sessionId}`)).body?.session;
check("la session reste ouverte en base", s?.statut === "ouverte", JSON.stringify(s));
const b2 = await canal(lecteur.cookie()), a2 = await canal(hote.cookie());
b2.envoyer({ type: "rejoindre", sessionId, depuis: seq });
a2.envoyer({ type: "rejoindre", sessionId });
const eb = await b2.attendre((m) => m.type === "etat");
check("retour avec un état resynchronisé (journal de reprise perdu au redémarrage)", eb?.resynchronise === true, JSON.stringify(eb).slice(0, 200));
await a2.attendre((m) => (m.type === "participants" || m.type === "etat") && m.participants.length === 2);
check("présence retrouvée", true);
const lues = (await lecteur("GET", `${tr}/annotations?variantId=${etude.variant.id}`)).body?.annotations ?? [];
check("aucune donnée perdue : l'annotation d'avant l'arrêt est relue", note.status === 201 && lues.some((x) => x.commentId === note.body.annotation.id));
for (const c of [a2, b2]) c.ws.close();
await hote("POST", `${tr}/sessions/${sessionId}/clore`, {});
console.log(echecs ? `\n${echecs} vérification(s) en échec` : "\nRépétition du redémarrage : tout est vert.");
process.exit(echecs ? 1 : 0);
