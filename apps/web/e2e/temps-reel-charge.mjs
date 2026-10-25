#!/usr/bin/env node
/**
 * Recette de charge et de reprise du temps réel (RTC-5, Issue #283 ; tests TR-T08 et TR-T09 côté canal ; budgets
 * proposés `PLAN.md` § 6) : des clients WebSocket réels (sans navigateur) sur l'API, le canal et la base.
 *
 *   1. SESSIONS sessions × PARTICIPANTS personnes (par défaut 10 × 10 = 100 connexions, 10 comptes membres de chaque
 *      projet ; chaque compte a une connexion par session, sous la borne de 20 par compte).
 *   2. Rafale : chaque participant envoie des pointeurs au plus vite pendant DUREE_S secondes ; le serveur borne à 10
 *      éphémères par seconde et par connexion. Mesures : pointeurs reçus, latence p50 / p95 (horodatage porté par la
 *      coordonnée x), aucune fermeture inattendue, aucun message d'une autre session.
 *   3. Reconnexion en rafale : les 100 prises sont coupées net, puis rouvertes ensemble avec le dernier numéro
 *      d'événement : chacune reçoit l'état, sans resynchronisation (journal de reprise encore valable), présence
 *      retrouvée.
 *   4. L'API répond toujours (`/health`) ; le temps de reprise est mesuré.
 *
 * BASE_URL=http://localhost:3001 SESSIONS=10 PARTICIPANTS=10 DUREE_S=10 node apps/web/e2e/temps-reel-charge.mjs
 */
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

const credentials = (n) => ({ email: `trc-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const SESSIONS = Number(process.env.SESSIONS ?? 10), PARTICIPANTS = Number(process.env.PARTICIPANTS ?? 10), DUREE_S = Number(process.env.DUREE_S ?? 10);
const centile = (v, p) => { if (!v.length) return NaN; const t = [...v].sort((a, b) => a - b); return t[Math.min(t.length - 1, Math.floor((p / 100) * t.length))]; };
const horloge = () => Date.now() % 1_000_000;

// 1. Comptes, projets, sessions.
const comptes = [];
for (let i = 0; i < PARTICIPANTS; i++) {
  const c = client();
  const cred = credentials(`c${i}`);
  if ((await c("POST", "/auth/register", cred)).status !== 201) { check(`compte ${i} créé`, false); process.exit(1); }
  comptes.push({ c, email: cred.email });
}
check(`${PARTICIPANTS} comptes créés`, true);
const hote = comptes[0].c;
const salles = [];
for (let s = 0; s < SESSIONS; s++) {
  const projet = (await hote("POST", "/projects", { code: `TRC_${s}_${randomUUID().slice(0, 4)}`, name: `Charge ${s} (recette synthétique)` })).body;
  // Invitation acceptée (Issue #262, phase 3) : plus d'ajout direct d'un compte existant.
  for (const m of comptes.slice(1)) {
    if (!(await inviterEtAccepter(hote, m.c, projet.id, m.email, "lecteur")).ok) { check(`invitation acceptée par ${m.email}`, false); process.exit(1); }
  }
  const etude = (await hote("POST", `/projects/${projet.id}/studio/studies`, { name: `Étude ${s}` })).body;
  const ouverte = await hote("POST", `/projects/${projet.id}/temps-reel/sessions`, { studyId: etude.study.id, variantId: etude.variant.id, requestId: `trc-${randomUUID()}` });
  salles.push({ projet: projet.id, sessionId: ouverte.body?.session?.id });
}
check(`${SESSIONS} sessions ouvertes`, salles.every((s) => !!s.sessionId));

// 2. Connexions et rafale.
const t0 = Date.now();
let prises = [];
for (const s of salles) for (const [i, m] of comptes.entries()) prises.push({ salle: s, i, cookie: m.c.cookie() });
const ouvrir = async (p, depuis) => {
  p.canal = await canal(p.cookie);
  p.canal.envoyer({ type: "rejoindre", sessionId: p.salle.sessionId, ...(depuis !== undefined ? { depuis } : {}) });
  p.etat = await p.canal.attendre((m) => m.type === "etat" || m.type === "erreur", 15_000);
  return p;
};
await Promise.all(prises.map((p) => ouvrir(p)));
const connectes = prises.filter((p) => p.etat?.type === "etat").length;
check(`${prises.length} connexions entrées dans leur session (${Date.now() - t0} ms)`, connectes === prises.length, `${connectes}/${prises.length}`);
const latences = [];
let etrangers = 0;
for (const p of prises) {
  p.recusPointeurs = 0;
  p.canal.ws.on("message", (d) => {
    const m = JSON.parse(String(d));
    if (m.type !== "pointeur") return;
    p.recusPointeurs += 1;
    if (m.y !== p.salle.index) etrangers += 1;
    const l = (horloge() - m.x + 1_000_000) % 1_000_000;
    if (l < 60_000) latences.push(l);
  });
}
salles.forEach((s, k) => { s.index = k; });
let envoyes = 0;
const fin = Date.now() + DUREE_S * 1000;
while (Date.now() < fin) {
  for (const p of prises) { p.canal.envoyer({ type: "pointeur", espace: "plan", x: horloge(), y: p.salle.index }); envoyes += 1; }
  await pause(50);
}
await pause(1500);
const recus = prises.reduce((n, p) => n + p.recusPointeurs, 0);
const fermes = prises.filter((p) => p.canal.ferme !== null).length;
const p50 = centile(latences, 50), p95 = centile(latences, 95);
console.log(`  mesures : ${envoyes} pointeurs proposés, ${recus} reçus, latence p50 ${p50} ms, p95 ${p95} ms`);
// Borne exacte : chaque émetteur relayé au plus 10 fois par seconde (marge d'une seconde de mesure).
const plafond = prises.length * (PARTICIPANTS - 1) * 10 * (DUREE_S + 1.5);
const parReceveur = prises.map((p) => p.recusPointeurs);
check("rafale : chaque participant reçoit les pointeurs des autres", parReceveur.every((n) => n > 0), parReceveur.slice(0, 10).join(","));
check("rafale : débit borné à 10 éphémères / s par connexion (aucun dépassement relayé)", recus <= plafond, `${recus} > ${plafond}`);
check("rafale : aucune fermeture inattendue", fermes === 0, String(fermes));
check("rafale : aucun pointeur d'une autre session", etrangers === 0, String(etrangers));
check("latence p95 sous 1 s (budget proposé : 250 ms sur le profil de référence)", p95 < 1000, `${p95} ms`);

// 3. Reconnexion en rafale.
const seqs = new Map(prises.map((p) => [p, Math.max(p.etat.seq, ...p.canal.recus.filter((m) => m.type === "evenement").map((m) => m.seq))]));
for (const p of prises) p.canal.ws.terminate();
// Attendre que le serveur ait constaté les fermetures (sinon anciennes et nouvelles prises atteindraient ensemble la
// borne de 20 connexions par compte) : plus personne de connecté dans chaque session.
for (let i = 0; i < 100; i++) {
  const restes = await Promise.all(salles.map(async (s) => (await hote("GET", `/projects/${s.projet}/temps-reel/sessions/${s.sessionId}`)).body?.session?.connectes?.length ?? 0));
  if (restes.every((n) => n === 0)) break;
  await pause(100);
}
const t1 = Date.now();
await Promise.all(prises.map((p) => ouvrir(p, seqs.get(p))));
const revenus = prises.filter((p) => p.etat?.type === "etat");
check(`reconnexion en rafale : ${prises.length} retours en ${Date.now() - t1} ms`, revenus.length === prises.length, `${revenus.length}/${prises.length}`);
check("reprise sans resynchronisation (journal de reprise valable)", revenus.every((p) => p.etat.resynchronise === false));
await pause(800);
const presence = await Promise.all(salles.map(async (s) => (await hote("GET", `/projects/${s.projet}/temps-reel/sessions/${s.sessionId}`)).body?.session?.connectes?.length ?? 0));
check(`présence retrouvée : ${PARTICIPANTS} personnes dans chaque session`, presence.every((n) => n === PARTICIPANTS), presence.join(","));
check("l'API répond après la charge (/health)", (await fetch(`${BASE}/health`)).status === 200);

for (const p of prises) p.canal.ws.close();
for (const s of salles) await hote("POST", `/projects/${s.projet}/temps-reel/sessions/${s.sessionId}/clore`, {});
console.log(echecs ? `\n${echecs} vérification(s) en échec` : "\nRecette de charge du temps réel : tout est vert.");
process.exit(echecs ? 1 : 0);
