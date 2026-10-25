#!/usr/bin/env node
/**
 * Répétition du retour arrière (RTC-5, Issue #283) : `SANS_DRAPEAU` relance l'API sans `FADI_TEMPS_REEL`, puis
 * `AVEC_DRAPEAU` la relance avec. Exigé, drapeau retiré : la liste des sessions répond « inactif » (200, aucune donnée),
 * toute autre route 404, la montée de protocole 404, le Studio s'ouvre sans bandeau ni erreur ; les commentaires Studio
 * (dont les annotations) restent lisibles. Drapeau remis : sessions et annotations sont retrouvées telles quelles.
 * Hors CI (elle redémarre le serveur) : exécutée en local et en préproduction.
 *
 * BASE_URL=… SANS_DRAPEAU="…" AVEC_DRAPEAU="…" node apps/web/e2e/temps-reel-retour-arriere.mjs
 */
import { execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import WebSocket from "ws";

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

const credentials = (n) => ({ email: `trr-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
if (!process.env.SANS_DRAPEAU || !process.env.AVEC_DRAPEAU) { console.log("SANS_DRAPEAU et AVEC_DRAPEAU (commandes shell) sont requises."); process.exit(2); }
const attendreApi = async () => { for (let i = 0; i < 120; i++) { if (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) return true; await pause(500); } return false; };
const hote = client();
const cH = credentials("h");
check("compte créé", (await hote("POST", "/auth/register", cH)).status === 201);
const projet = (await hote("POST", "/projects", { code: `TRR_${randomUUID().slice(0, 6)}`, name: "Retour arrière (recette synthétique)" })).body;
const etude = (await hote("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude" })).body;
const tr = `/projects/${projet.id}/temps-reel`;
const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
const ouverte = await hote("POST", `${tr}/sessions`, { studyId: etude?.study?.id, variantId: etude?.variant?.id, requestId: `trr-${randomUUID()}` });
if (!ouverte.body?.session) { check("session ouverte", false, `${ouverte.status} ${JSON.stringify(ouverte.body)} ${JSON.stringify(etude).slice(0, 200)}`); process.exit(1); }
const sessionId = ouverte.body.session.id;
const note = await hote("POST", `${tr}/sessions/${sessionId}/annotations`, { body: "Annotation à garder", requestId: `trr-${randomUUID()}`, vue: { affichage: "2d", plan: { x: 0, y: 0, w: 5, h: 5 } } });
check("session et annotation enregistrées", note.status === 201);

execSync(process.env.SANS_DRAPEAU, { stdio: "inherit" });
check("API relancée sans le drapeau", await attendreApi());
const liste = await hote("GET", `${tr}/sessions?variantId=${etude.variant.id}`);
check("sans drapeau : liste « inactif » (200, aucune donnée)", liste.status === 200 && liste.body?.actif === false && liste.body.sessions.length === 0, JSON.stringify(liste.body));
check("sans drapeau : détail, annotations et ouverture répondent 404", (await hote("GET", `${tr}/sessions/${sessionId}`)).status === 404
  && (await hote("GET", `${tr}/annotations?variantId=${etude.variant.id}`)).status === 404
  && (await hote("POST", `${tr}/sessions`, { studyId: etude.study.id, variantId: etude.variant.id, requestId: `trr-${randomUUID()}` })).status === 404);
const montee = await canal(hote.cookie());
check("sans drapeau : montée de protocole refusée (404)", montee.statut === 404, String(montee.statut));
const commentaires = (await hote("GET", `${chemin}/comments`)).body?.comments ?? [];
check("sans drapeau : l'annotation reste lisible comme commentaire Studio", commentaires.some((c) => c.id === note.body.annotation.id));

execSync(process.env.AVEC_DRAPEAU, { stdio: "inherit" });
check("API relancée avec le drapeau", await attendreApi());
const retour = (await hote("GET", `${tr}/sessions/${sessionId}`)).body?.session;
const notes = (await hote("GET", `${tr}/annotations?variantId=${etude.variant.id}`)).body?.annotations ?? [];
check("drapeau remis : session et annotation retrouvées telles quelles", retour?.id === sessionId && notes.some((x) => x.commentId === note.body.annotation.id && x.pointDeVue?.plan?.w === 5), JSON.stringify({ retour, notes }).slice(0, 400));
await hote("POST", `${tr}/sessions/${sessionId}/clore`, {});
console.log(echecs ? `\n${echecs} vérification(s) en échec` : "\nRépétition du retour arrière : tout est vert.");
process.exit(echecs ? 1 : 0);
