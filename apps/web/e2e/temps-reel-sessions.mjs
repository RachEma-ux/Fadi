#!/usr/bin/env node
/**
 * Recette du socle Temps réel (RTC-1, Issue #283 ; critères RT-R1, RT-R2, RT-R3, RT-R7 ; tests TR-T01, TR-T02, TR-T06
 * partiel, TR-T07, TR-T17) par l'API, le canal WebSocket et une base réelles. Comptes (propriétaire, éditeur, lecteur,
 * tiers) et projet synthétiques créés par les vraies routes ; drapeau `FADI_TEMPS_REEL=1` côté API.
 *
 *   1. Montée de protocole : sans cookie (401), origine étrangère (403), autre chemin (404) — refusées avant ouverture.
 *   2. Ouverture d'une session sur la tête d'une variante Studio ; rejeu idempotent ; un tiers ne voit ni la session
 *      (HTTP 404) ni rien dans le canal (même réponse qu'une session inexistante).
 *   3. Présence : propriétaire, éditeur et lecteur rejoignent ; vue du présentateur relayée ; le lecteur ne partage pas
 *      sa vue ; sélection forgée réduite aux objets du document épinglé.
 *   4. Nouvelle révision enregistrée : annoncée (« révision disponible »), la session reste sur sa révision.
 *   5. L'hôte n'a aucun droit de plus (RT-R2) : le lecteur hôte n'écrit toujours pas dans le Studio ; un non-hôte ne
 *      désigne pas le présentateur ; un lecteur ne reprend pas l'animation.
 *   6. Révocation : le lecteur retiré du projet est déconnecté (4403) ; l'éditeur déconnecté de son compte l'est aussi
 *      (4401) ; les autres continuent.
 *   7. Clôture : événement annoncé, connexions fermées (4404), journal de session complet.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/temps-reel-sessions.mjs
 */
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

const credentials = (n) => ({ email: `tr-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const proprio = client(), editeur = client(), lecteur = client(), tiers = client();
const cP = credentials("p"), cE = credentials("e"), cL = credentials("l"), cT = credentials("t");
for (const [c, cred] of [[proprio, cP], [editeur, cE], [lecteur, cL], [tiers, cT]]) check(`compte créé (${cred.email.split("-")[1]})`, (await c("POST", "/auth/register", cred)).status === 201);
const idDe = async (c) => { const me = (await c("GET", "/auth/me")).body; return me?.user?.id ?? me?.id; };
const ids = { proprio: await idDe(proprio), editeur: await idDe(editeur), lecteur: await idDe(lecteur) };

const projet = await proprio("POST", "/projects", { code: `TR_${randomUUID().slice(0, 6)}`, name: "Temps réel (recette synthétique)" });
const pid = projet.body?.id;
check("projet créé", projet.status === 201, String(projet.status));
check("éditeur et lecteur ajoutés", (await proprio("POST", `/projects/${pid}/members`, { email: cE.email, role: "editeur" })).status === 201
  && (await proprio("POST", `/projects/${pid}/members`, { email: cL.email, role: "lecteur" })).status === 201);
const etude = await proprio("POST", `/projects/${pid}/studio/studies`, { name: "Étude temps réel" });
const s = { studyId: etude.body?.study?.id, variantId: etude.body?.variant?.id };
const variante = `/projects/${pid}/studio/studies/${s.studyId}/variants/${s.variantId}`;
const r1 = await proprio("POST", `${variante}/commands`, {
  contractVersion: "studio-commands/1", requestId: `tr-${randomUUID()}`, baseRevisionId: etude.body?.revision?.id,
  commands: [{ toolId: "studio.dessin.ligne", params: { id: "mur-1", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } } }],
});
check("étude et première révision enregistrées", etude.status === 201 && r1.status === 200, `${etude.status}/${r1.status}`);
const revision1 = r1.body?.revision?.id;

// 1. Montée de protocole refusée avant ouverture.
check("canal sans cookie : 401", (await canal("")).statut === 401);
check("canal depuis une origine étrangère : 403", (await canal(proprio.cookie(), { origin: "https://evil.example" })).statut === 403);
check("autre chemin : 404", (await canal(proprio.cookie(), { chemin: "/temps-reel-x" })).statut === 404);

// 2. Ouverture, rejeu, tiers.
const sessions = `/projects/${pid}/temps-reel/sessions`;
const requestId = `tr-${randomUUID()}`;
const ouverte = await proprio("POST", sessions, { ...s, requestId, titre: "Revue du plan" });
const sid = ouverte.body?.session?.id;
check("session ouverte sur la tête de la variante", ouverte.status === 201 && ouverte.body.session.revisionId === revision1 && ouverte.body.session.hoteId === ids.proprio, JSON.stringify(ouverte.body).slice(0, 200));
const rejeu = await proprio("POST", sessions, { ...s, requestId, titre: "Revue du plan" });
check("rejeu idempotent : même session, 200", rejeu.status === 200 && rejeu.body.session.id === sid && rejeu.body.rejoue === true);
check("le lecteur liste la session", (await lecteur("GET", `${sessions}?variantId=${s.variantId}`)).body?.sessions?.some((x) => x.id === sid));
check("le tiers ne voit pas le projet ni la session (404)", (await tiers("GET", sessions)).status === 404 && (await tiers("GET", `${sessions}/${sid}`)).status === 404);

const cTiers = await canal(tiers.cookie());
cTiers.envoyer({ type: "rejoindre", sessionId: sid });
const refusTiers = await cTiers.attendre((m) => m.type === "erreur");
const cInexistante = await canal(tiers.cookie());
cInexistante.envoyer({ type: "rejoindre", sessionId: "rtses_inexistante" });
const refusInexistante = await cInexistante.attendre((m) => m.type === "erreur");
check("canal : le tiers reçoit la même réponse qu'une session inexistante", refusTiers?.code === "session-indisponible" && refusInexistante?.code === "session-indisponible" && refusTiers.message === refusInexistante.message
  && !cTiers.recus.some((m) => m.type === "etat"));
cTiers.ws.close(); cInexistante.ws.close();

// 3. Présence, vue, sélection.
const cP1 = await canal(proprio.cookie()), cE1 = await canal(editeur.cookie()), cL1 = await canal(lecteur.cookie());
for (const c of [cP1, cE1, cL1]) c.envoyer({ type: "rejoindre", sessionId: sid });
const etatL = await cL1.attendre((m) => m.type === "etat");
check("le lecteur reçoit l'état de la session (révision épinglée)", etatL?.session?.revisionId === revision1 && etatL.session.presentateurId === ids.proprio);
// Selon l'ordre d'arrivée, la liste complète vient dans l'état (dernier arrivé) ou dans une diffusion « participants ».
const presence = await cL1.attendre((m) => (m.type === "participants" || m.type === "etat") && m.participants.length === 3);
check("présence : trois personnes, hôte et présentateur nommés", !!presence && presence.participants.find((p) => p.userId === ids.proprio)?.roles.join() === "hote,presentateur");
const camera = { projection: "perspective", position: { x: 12, y: -9, z: 7 }, target: { x: 2, y: 0, z: 0 }, fov: 45 };
cP1.envoyer({ type: "vue", affichage: "3d", camera });
const vueRecue = await cL1.attendre((m) => m.type === "vue");
check("vue du présentateur relayée (caméra local-3d)", vueRecue?.de === ids.proprio && vueRecue.camera?.fov === 45);
cL1.envoyer({ type: "vue", affichage: "2d", plan: { x: 0, y: 0, w: 1, h: 1 } });
check("le lecteur, non présentateur, ne partage pas sa vue", (await cL1.attendre((m) => m.type === "erreur" && m.code === "non-presentateur"))?.code === "non-presentateur");
cP1.envoyer({ type: "selection", objectIds: ["objet-invente", "mur-1"] });
const sel = await cE1.attendre((m) => m.type === "selection");
check("sélection forgée réduite aux objets du document épinglé", JSON.stringify(sel?.objectIds) === JSON.stringify(["mur-1"]));
cE1.envoyer({ type: "pointeur", espace: "plan", x: 1.5, y: 2.5 });
check("pointeur relayé, jamais renvoyé à son auteur", (await cP1.attendre((m) => m.type === "pointeur"))?.x === 1.5 && !cE1.recus.some((m) => m.type === "pointeur"));

// 4. Nouvelle révision : annoncée, jamais appliquée en silence.
const r2 = await editeur("POST", `${variante}/commands`, {
  contractVersion: "studio-commands/1", requestId: `tr-${randomUUID()}`, baseRevisionId: revision1,
  commands: [{ toolId: "studio.dessin.ligne", params: { id: "mur-2", type: "line", start: { x: 0, y: 1 }, end: { x: 5, y: 1 } } }],
});
const annonce = await cL1.attendre((m) => m.type === "evenement" && m.evenement.nature === "revision-disponible");
check("nouvelle révision annoncée aux participants", r2.status === 200 && annonce?.evenement?.revisionId === r2.body?.revision?.id);
check("la session reste sur sa révision", (await lecteur("GET", `${sessions}/${sid}`)).body?.session?.revisionId === revision1);

// 5. L'hôte n'a aucun droit de plus (RT-R2).
check("un non-hôte ne désigne pas le présentateur (403)", (await editeur("POST", `${sessions}/${sid}/presentateur`, { userId: ids.editeur })).status === 403);
check("un lecteur ne reprend pas l'animation (403)", (await lecteur("POST", `${sessions}/${sid}/reprendre`)).status === 403);
check("l'hôte transmet l'animation au lecteur", (await proprio("POST", `${sessions}/${sid}/hote`, { userId: ids.lecteur })).status === 200);
check("annonce de l'hôte reçue", (await cE1.attendre((m) => m.type === "evenement" && m.evenement.nature === "hote"))?.evenement?.hoteId === ids.lecteur);
const ecritureLecteurHote = await lecteur("POST", `${variante}/commands`, {
  contractVersion: "studio-commands/1", requestId: `tr-${randomUUID()}`, baseRevisionId: r2.body?.revision?.id,
  commands: [{ toolId: "studio.dessin.ligne", params: { id: "mur-x", type: "line", start: { x: 0, y: 2 }, end: { x: 5, y: 2 } } }],
});
check("le lecteur devenu hôte n'écrit toujours pas dans le Studio (403)", ecritureLecteurHote.status === 403, String(ecritureLecteurHote.status));
check("le lecteur hôte désigne le présentateur", (await lecteur("POST", `${sessions}/${sid}/presentateur`, { userId: ids.lecteur })).status === 200);
check("puis rend l'animation au propriétaire", (await lecteur("POST", `${sessions}/${sid}/hote`, { userId: ids.proprio })).status === 200);

// 6. Révocation.
const t0 = Date.now();
check("le propriétaire retire le lecteur du projet", (await proprio("DELETE", `/projects/${pid}/members/${ids.lecteur}`)).status === 204);
const codeL = await cL1.fermeture(3000);
check("le lecteur retiré est déconnecté (4403) sans attendre", codeL === 4403, `${codeL} après ${Date.now() - t0} ms`);
check("l'éditeur se déconnecte de son compte", (await editeur("POST", "/auth/logout")).status < 300);
check("sa connexion au canal est fermée (4401)", (await cE1.fermeture(3000)) === 4401);
cP1.envoyer({ type: "pointeur", espace: "plan", x: 9, y: 9 });
await pause(200);
check("le propriétaire reste connecté", cP1.ferme === null);

// 7. Clôture et journal.
const close = await proprio("POST", `${sessions}/${sid}/clore`);
check("session close par l'hôte", close.status === 200 && close.body.session.statut === "close");
check("clôture annoncée puis connexion fermée (4404)", (await cP1.attendre((m) => m.type === "evenement" && m.evenement.nature === "session-close")) !== null && (await cP1.fermeture(3000)) === 4404);
const journal = (await proprio("GET", `${sessions}/${sid}`)).body?.journal?.map((e) => e.action) ?? [];
for (const a of ["ouvrir", "rejoindre", "hote", "presentateur", "quitter", "clore"]) check(`journal : « ${a} » consigné`, journal.includes(a), journal.join(","));
check("une session close ne s'ouvre plus au canal", await (async () => {
  const c = await canal(proprio.cookie());
  c.envoyer({ type: "rejoindre", sessionId: sid });
  const r = await c.attendre((m) => m.type === "erreur");
  c.ws.close();
  return r?.code === "session-indisponible";
})());

console.log(echecs ? `\n${echecs} vérification(s) en échec` : "\nRecette du socle Temps réel : tout est vert.");
process.exit(echecs ? 1 : 0);
