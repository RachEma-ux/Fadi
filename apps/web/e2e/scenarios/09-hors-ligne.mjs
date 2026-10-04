/**
 * Scénario de bout en bout · 09-hors-ligne — Hors-ligne : file locale de l'Atelier, file des saisies, conflits, serveur injoignable.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** 6k. Hors-ligne de l'Atelier (file de commandes IndexedDB, conflit de révision, rejeu, cache local). */
export async function atelierHorsLigne(sc) {
  const { BASE, ctx, page, check } = sc;
  const { exampleUrl, rdcWallsOf, atelierUrl, atelierPid } = sc;
  // 6k. Hors-ligne (sur la copie de travail) : file locale (IndexedDB) des lots de commandes du bus de l'Atelier, rejeu au
  // retour du réseau et après rechargement, conflit de révision (409) résolu par « Rejouer mes commandes », ouverture
  // depuis le cache local du modèle. La persistance est lue sur le serveur.
  const entete = page.locator(".project-header .sync-indicator");
  const attente = page.locator('[data-testid="atl-compte-attente"]');
  await page.goto(`${atelierUrl}?module=atelier`);
  await page.waitForSelector('[data-testid="plan2d-toile"]', { timeout: 30000 });
  await page.mouse.move(2, 2);
  const lots = (n) => page.waitForFunction((n) => new RegExp(`^\\s*${n} lot\\(s\\) en attente d'envoi`).test(document.querySelector('[data-testid="atl-compte-attente"]')?.textContent ?? ""), n, { timeout: 20000 });
  await lots(0).catch(() => {});
  const toile = page.locator('[data-testid="plan2d-toile"]');
  const saisie = page.locator('[data-testid="plan2d-precision"] input:not([readonly])');
  const poserPoint = async (x, y) => {
    await toile.focus();
    await page.keyboard.press(String(x)[0]);
    await saisie.waitFor({ state: "visible", timeout: 5000 });
    await saisie.fill(`${x};${y}`);
    await saisie.press("Enter");
    await saisie.waitFor({ state: "detached", timeout: 5000 });
  };
  /** Un mur (raccourci M), deux points exacts dans une zone libre, puis Échap (retour à la sélection). */
  const drawWall = async (y) => {
    await toile.focus();
    await page.keyboard.press("m");
    await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Mur"), null, { timeout: 5000 }).catch(() => null);
    await poserPoint(60, y);
    await poserPoint(64, y);
    await toile.focus();
    await page.keyboard.press("Escape");
  };
  const attendre = async (predicat, delaiMs = 20000) => {
    const fin = Date.now() + delaiMs;
    let v = await rdcWallsOf(atelierPid);
    while (!predicat(v) && Date.now() < fin) {
      await page.waitForTimeout(400);
      v = await rdcWallsOf(atelierPid);
    }
    return v;
  };
  const wallsBeforeOffline = await rdcWallsOf(atelierPid);
  await ctx.setOffline(true);
  await page.waitForFunction(() => /Hors-ligne/.test(document.querySelector(".project-header .sync-indicator")?.textContent || ""), null, { timeout: 5000 }).catch(() => {});
  check("hors-ligne : l'en-tête du projet passe « Hors-ligne »", /^Hors-ligne/.test(await entete.textContent()));
  await drawWall(60);
  await lots(1).catch(() => {});
  const fileLocale = await page.evaluate(() => new Promise((resolve) => { const req = indexedDB.open("fadi-atelier"); req.onsuccess = () => { try { const db = req.result; const nom = [...db.objectStoreNames].find((n) => /file|lots|entrees/i.test(n)) ?? db.objectStoreNames[0]; const all = db.transaction(nom).objectStore(nom).getAll(); all.onsuccess = () => resolve(all.result.length); all.onerror = () => resolve(-1); } catch { resolve(-1); } }; req.onerror = () => resolve(-1); }));
  check("hors-ligne : un mur dessiné → « 1 lot(s) en attente d'envoi », rien sur le serveur", /^\s*1 lot\(s\) en attente d'envoi/.test(await attente.textContent()) && (await rdcWallsOf(atelierPid)).revision === wallsBeforeOffline.revision, `file IndexedDB : ${fileLocale}`);
  await ctx.setOffline(false);
  await lots(0).catch(() => {});
  const wallsAfterOnline = await attendre((v) => v.murs === wallsBeforeOffline.murs + 1);
  check("retour du réseau : synchronisation automatique → file vide, +1 mur et +1 révision sur le serveur, en-tête synchronisé", wallsAfterOnline.murs === wallsBeforeOffline.murs + 1 && wallsAfterOnline.revision === wallsBeforeOffline.revision + 1 && /^\s*0 lot\(s\)/.test(await attente.textContent()), JSON.stringify({ avant: [wallsBeforeOffline.murs, wallsBeforeOffline.revision], apres: [wallsAfterOnline.murs, wallsAfterOnline.revision] }));
  // Conflit de révision : un autre appareil valide un lot pendant la coupure ; au retour, le rejeu est refusé (409), le lot
  // reste en conflit (rien n'est écrasé) et le panneau propose de le rejouer sur l'état courant ou de garder le serveur.
  await ctx.setOffline(true);
  await drawWall(62);
  await lots(1).catch(() => {});
  const m = await (await page.request.get(`${BASE}/projects/${atelierPid}/atelier/model`)).json();
  const niveau = Object.values(m.objets).filter((o) => o.classe === "niveau").sort((x, y) => x.params.ordre - y.params.ordre)[0];
  const calque = Object.values(m.objets).find((o) => o.classe === "calque");
  const pt = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const lg = (v) => ({ value: v, unit: "m" });
  const autre = await page.request.post(`${BASE}/projects/${atelierPid}/atelier/commands`, {
    data: { requestId: `e2e-autre-${Date.now()}`, baseRevision: m.revision, contract: "atelier-commands/1", label: "Autre appareil", commands: [{ type: "mur.tracer", cibles: [], params: { id: `${atelierPid}_E2E-AUTRE`, niveauId: niveau.id, calqueId: calque.id, a: pt(70, 70), b: pt(74, 70), epaisseur: lg(0.2), hauteur: lg(3), alignement: "axe", typeId: "non-type", exterieur: true } }] },
  });
  check("autre appareil : un lot validé pendant la coupure (200, révision avancée)", autre.status() === 200, String(autre.status()));
  await ctx.setOffline(false);
  await page.waitForSelector('.conflict-banner li[data-kind="commandes"]', { timeout: 20000 });
  const conflitTexte = (await page.locator('.conflict-banner li[data-kind="commandes"]').first().textContent()).replace(/\s+/g, " ");
  const wallsDuringConflict = await rdcWallsOf(atelierPid);
  check("retour du réseau : rejeu refusé (409) → lot en conflit listé dans le panneau, rien n'est écrasé (seul le mur de l'autre appareil est sur le serveur)", wallsDuringConflict.murs === wallsAfterOnline.murs + 1 && /Rejouer mes commandes/.test(conflitTexte), conflitTexte.slice(0, 160));
  await page.locator('.conflict-banner li[data-kind="commandes"] button:has-text("Rejouer mes commandes")').first().click();
  const wallsResolved = await attendre((v) => v.murs === wallsAfterOnline.murs + 2);
  await lots(0).catch(() => {});
  check("« Rejouer mes commandes » : le lot est revalidé sur l'état courant et accepté (+1 mur sur celui de l'autre appareil), plus de conflit", wallsResolved.murs === wallsAfterOnline.murs + 2 && (await page.locator('.conflict-banner li[data-kind="commandes"]').count()) === 0, JSON.stringify({ apres: wallsAfterOnline.murs, conflit: wallsDuringConflict.murs, resolu: wallsResolved.murs }));
  // Serveur injoignable (route des commandes bloquée) puis rechargement de la page : la file locale est rejouée à l'ouverture.
  await page.route(/\/atelier\/commands(\?|$)/, (route) => route.abort());
  await drawWall(64);
  await page.waitForTimeout(1500);
  check("serveur injoignable : le lot reste dans la file locale (« 1 lot(s) en attente d'envoi »), rien n'est perdu", /^\s*1 lot\(s\) en attente d'envoi/.test(await attente.textContent()), await attente.textContent());
  await page.unroute(/\/atelier\/commands(\?|$)/);
  await page.reload();
  await page.waitForSelector('[data-testid="plan2d-toile"]', { timeout: 30000 });
  const wallsAfterReload = await attendre((v) => v.murs === wallsResolved.murs + 1);
  check("rechargement : la file locale est rejouée à l'ouverture → +1 mur et +1 révision sur le serveur", wallsAfterReload.murs === wallsResolved.murs + 1 && wallsAfterReload.revision === wallsResolved.revision + 1, JSON.stringify({ resolu: [wallsResolved.murs, wallsResolved.revision], recharge: [wallsAfterReload.murs, wallsAfterReload.revision] }));
  // Rechargement complet hors-ligne : l'enveloppe (service worker) sert l'application, le cache persistant (IndexedDB) relit
  // les étapes déjà lues, l'Atelier s'ouvre depuis le cache local du modèle.
  await page.goto(`${exampleUrl}?module=parcours&etape=2`);
  await page.waitForSelector(".reference-answers");
  await page.waitForTimeout(2500); // le cache des requêtes s'écrit avec un délai de regroupement
  check("hors-ligne : service worker actif et contrôlant la page", await page.evaluate(async () => !!navigator.serviceWorker.controller && !!(await navigator.serviceWorker.getRegistration())?.active));
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector(".reference-answers", { timeout: 20000 });
  check("rechargement hors-ligne : l'étape 02 se relit depuis le cache persistant, bandeau « Lecture hors-ligne : données lues le … »", (await page.locator(".step-detail-title").textContent()) === "Réglementation & constructibilité" && /^Lecture hors-ligne : données lues le/.test(await page.locator(".offline-banner").textContent()) && /^Hors-ligne/.test(await entete.textContent()));
  await page.locator('.module-nav button:has-text("Atelier architectural")').click();
  await page.waitForSelector('[data-testid="plan2d-toile"]', { timeout: 20000 }).catch(() => {});
  const niveauxHorsLigne = await page.locator('[data-testid^="atl-niveau-"]:not([data-testid="atl-niveau-actif"])').count();
  check("rechargement hors-ligne : l'Atelier s'ouvre depuis le cache local du modèle, 6 niveaux", niveauxHorsLigne === 6, `${niveauxHorsLigne} niveaux`);
  await ctx.setOffline(false);
  await page.goto(`${exampleUrl}?module=parcours`);
  await page.waitForSelector(".overview-step");
}

/** 6l. File hors-ligne des saisies (409, résolution assistée, serveur injoignable, session). */
export async function saisiesHorsLigne(sc) {
  const { BASE, OUT, ctx, page, consoleErrors, check, axeCheck } = sc;
  const { projectUrl } = sc;
  // 6l. File hors-ligne des saisies : mutation en pause, persistée et rejouée après rechargement ; refus 409 quand le serveur a avancé (jamais écrasé)
  const testPid = projectUrl.split("/").pop();
  const patchLog = [];
  const logPatch = (r) => { if (r.request().method() === "PATCH") patchLog.push(`${r.status()} ${r.request().postData()?.slice(0, 80)}`); };
  page.on("response", logPatch);
  await page.goto(`${projectUrl}?module=parcours&etape=3`);
  await page.waitForSelector("#biz-f1");
  await page.waitForTimeout(2500); // cache des requêtes persisté
  await ctx.setOffline(true);
  await page.locator("#biz-f1").fill("Demande locale (saisie hors-ligne)");
  await page.locator("#biz-f1").blur();
  await page.waitForSelector(".offline-banner-inline", { timeout: 10000 });
  check("hors-ligne : une saisie d'étape est mise en attente (« 1 envoi(s) de cette étape en attente du réseau »), comptée dans l'en-tête", /^1 envoi\(s\) de cette étape en attente du réseau/.test(await page.locator(".offline-banner-inline").textContent()) && /Hors-ligne · 1 modification/.test(await page.locator(".sync-indicator").textContent()));
  await page.waitForTimeout(2500); // la mutation en pause est persistée avec le cache
  await page.reload();
  await page.waitForSelector("#biz-f1", { timeout: 20000 });
  await page.waitForSelector(".offline-banner-inline", { timeout: 10000 }).catch(() => {});
  check("rechargement hors-ligne : la saisie en attente est restaurée (toujours en pause)", (await page.locator(".offline-banner-inline").count()) === 1);
  // Un autre appareil écrit le même champ pendant la coupure.
  const otherDevice = await page.request.patch(`${BASE}/projects/${testPid}/steps/3`, { data: { fields: { f1: "Demande locale (autre appareil)" } } });
  check("autre appareil : écriture du même champ pendant la coupure (200)", otherDevice.status() === 200);
  await ctx.setOffline(false);
  await page.waitForSelector(".conflict-banner", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("#biz-f1")?.value === "Demande locale (autre appareil)", null, { timeout: 10000 }).catch(() => {});
  const conflictText = (await page.locator(".conflict-banner").textContent()).replace(/\s+/g, " ");
  check("retour du réseau : la saisie rejouée est refusée (409) — bandeau « écriture(s) refusée(s) », valeur courante du serveur affichée, rien d'écrasé", /1 écriture\(s\) refusée\(s\)/.test(conflictText) && /Étape 03 · saisie/.test(conflictText) && /modifié depuis votre lecture/.test(conflictText) && (await page.inputValue("#biz-f1")) === "Demande locale (autre appareil)" && /1 conflit\(s\) à examiner/.test(await page.locator(".sync-indicator").textContent()), conflictText.slice(0, 200));
  const conflictRow = (await page.locator(".conflict-table tbody tr").first().allTextContents()).join(" ").replace(/\s+/g, " ");
  check("résolution assistée : les deux versions côte à côte (champ, valeur du serveur, votre saisie)", /Demande locale \(autre appareil\)/.test(conflictRow) && /Demande locale \(saisie hors-ligne\)/.test(conflictRow) && (await page.locator(".conflict-table tbody tr td").first().textContent()) !== "f1", conflictRow);
  await page.locator(".conflict-banner").screenshot({ path: `${OUT}/conflit-saisie-desktop.png` });
  await axeCheck(page, "bandeau de conflit avec versions côte à côte");
  await page.locator('.conflict-banner button:has-text("Reprendre ma saisie")').first().click();
  await page.waitForFunction(() => document.querySelectorAll(".conflict-banner").length === 0, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector("#biz-f1")?.value === "Demande locale (saisie hors-ligne)", null, { timeout: 10000 }).catch(() => {});
  check("« Reprendre ma saisie » : renvoyée fondée sur la valeur courante → acceptée, bandeau retiré, en-tête synchronisé", (await page.inputValue("#biz-f1")) === "Demande locale (saisie hors-ligne)" && /Synchronisé avec le serveur/.test(await page.locator(".sync-indicator").textContent()));
  // Arbitrage fondé sur une version périmée : un autre appareil arbitre pendant que l'écran garde l'ancienne version.
  await page.goto(`${projectUrl}?module=parcours&etape=3&harmonie=1`);
  await page.waitForSelector(".h7-proposal");
  // L'autre appareil arbitre la proposition B (version 1) ; l'écran, resté sur la version 0, retient B à son tour → refus.
  const otherDecision = await page.request.post(`${BASE}/projects/${testPid}/steps/3/harmonie/H02-B`, { data: { status: "adapted", notes: "Adaptation prise sur un autre appareil", owner: "Autre appareil" } });
  check("autre appareil : arbitrage de la proposition B de l'étape 03 (200)", otherDecision.status() === 200, String(otherDecision.status()));
  await page.locator(".h7-proposal").nth(1).locator('button:has-text("Retenir")').first().click();
  await page.waitForSelector('.conflict-banner li[data-kind="arbitrage"]', { timeout: 15000 });
  const decisionConflict = (await page.locator('.conflict-banner li[data-kind="arbitrage"]').textContent()).replace(/\s+/g, " ");
  check("arbitrage refusé (409) : votre arbitrage (retenue, version 0) face à la version courante du serveur (1), « Réappliquer sur la version courante » proposé", /Étape 03 · arbitrage H02-B/.test(decisionConflict) && /Votre arbitrage : retenue/.test(decisionConflict) && /fondé sur la version 0, le serveur est à la version 1/.test(decisionConflict), decisionConflict.slice(0, 220));
  await page.locator('.conflict-banner button:has-text("Réappliquer sur la version courante")').click();
  await page.waitForFunction(() => document.querySelectorAll(".conflict-banner").length === 0, null, { timeout: 10000 });
  await page.waitForFunction(async (pid) => (await (await fetch(`/projects/${pid}/steps/3`, { credentials: "include" })).json()).content.harmonie.proposals["H02-B"]?.decisionVersion === 2, testPid, { timeout: 10000 }).catch(() => {});
  const bDecision = (await (await page.request.get(`${BASE}/projects/${testPid}/steps/3`)).json()).content.harmonie.proposals["H02-B"];
  check("« Réappliquer » : B retenue sur la version courante (version 2, historique conservé), en-tête synchronisé", bDecision.status === "retained" && bDecision.decisionVersion === 2 && bDecision.history.some((h) => h.status === "adapted") && /Synchronisé avec le serveur/.test(await page.locator(".sync-indicator").textContent()), JSON.stringify({ status: bDecision.status, version: bDecision.decisionVersion, history: bDecision.history.length }));
  await page.goto(`${projectUrl}?module=parcours&etape=3`);
  await page.waitForSelector("#biz-f1");
  // Sans concurrence, la saisie rejouée passe : même scénario, personne n'a écrit entre-temps.
  await ctx.setOffline(true);
  await page.locator("#biz-f2").fill("Offre concurrente (hors-ligne)");
  await page.locator("#biz-f2").blur();
  await page.waitForSelector(".offline-banner-inline", { timeout: 10000 });
  await ctx.setOffline(false);
  await page.waitForFunction(() => !document.querySelector(".offline-banner-inline") && /Synchronisé avec le serveur/.test(document.querySelector(".sync-indicator")?.textContent || ""), null, { timeout: 20000 }).catch(async (err) => {
    console.log(`diagnostic f2 : indicateur « ${await page.locator(".sync-indicator").textContent()} » · bandeau inline « ${(await page.locator(".offline-banner-inline").allTextContents()).join(" | ")} » · conflits « ${(await page.locator(".conflict-banner").allTextContents()).join(" | ").replace(/\s+/g, " ").slice(0, 400)} » · PATCH : ${patchLog.join(" ; ")} · erreurs : ${consoleErrors.join(" | ")}`);
    throw err;
  });
  const readF2 = () => page.evaluate(async (pid) => (await (await fetch(`/projects/${pid}/steps/3`, { credentials: "include" })).json()).content.fields.f2, testPid);
  await page.waitForFunction(async (pid) => (await (await fetch(`/projects/${pid}/steps/3`, { credentials: "include" })).json()).content.fields.f2 === "Offre concurrente (hors-ligne)", testPid, { timeout: 10000 }).catch(() => {});
  const replayed = await readF2();
  page.off("response", logPatch);
  check("retour du réseau sans concurrence : la saisie en attente est enregistrée sur le serveur", replayed === "Offre concurrente (hors-ligne)", `${String(replayed).slice(0, 60)} | PATCH : ${patchLog.join(" ; ")}`);

  // Serveur injoignable alors que le navigateur se croit en ligne (tunnel fermé, API arrêtée, relais en 503) : la saisie
  // attend au lieu d'échouer — « Serveur injoignable » dans l'en-tête, « en attente du serveur » sous l'étape —, puis repart
  // d'elle-même dès que la sonde /health répond (`lib/reachability.ts`).
  const API_PATH = /\/(projects|auth|health|examples|library|notifications)(\/|\?|$)/;
  await page.route(API_PATH, (route) => route.abort("connectionrefused"));
  await page.locator("#biz-f1").fill("Demande locale (serveur injoignable)");
  await page.locator("#biz-f1").blur();
  await page.waitForSelector(".offline-banner-inline", { timeout: 15000 });
  await page.waitForFunction(() => /Serveur injoignable/.test(document.querySelector(".sync-indicator")?.textContent || ""), null, { timeout: 15000 });
  check("serveur injoignable (navigateur en ligne) : la saisie est mise en attente (« en attente du serveur (injoignable pour l’instant) »), en-tête « Serveur injoignable · 1 modification(s) en attente, reprise automatique » avec « Réessayer »", /en attente du serveur \(injoignable pour l’instant\)/.test(await page.locator(".offline-banner-inline").textContent()) && /Serveur injoignable · 1 modification\(s\) en attente, reprise automatique/.test(await page.locator(".sync-indicator").textContent()) && (await page.locator('.sync-indicator button:has-text("Réessayer")').count()) === 1);
  await page.unroute(API_PATH);
  await page.waitForFunction(() => !document.querySelector(".offline-banner-inline") && /Synchronisé avec le serveur/.test(document.querySelector(".sync-indicator")?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(async (pid) => (await (await fetch(`/projects/${pid}/steps/3`, { credentials: "include" })).json()).content.fields.f1 === "Demande locale (serveur injoignable)", testPid, { timeout: 15000 }).catch(() => {});
  check("serveur de nouveau joignable : reprise automatique (sonde /health), saisie enregistrée sur le serveur, en-tête synchronisé", (await page.evaluate(async (pid) => (await (await fetch(`/projects/${pid}/steps/3`, { credentials: "include" })).json()).content.fields.f1, testPid)) === "Demande locale (serveur injoignable)" && /Synchronisé avec le serveur/.test(await page.locator(".sync-indicator").textContent()));

  // Session au démarrage : un serveur en erreur (503) ou limité n'efface pas l'utilisateur mémorisé — l'écran se relit du cache ;
  // seule une réponse 401 ramène à la connexion.
  await page.route(/\/auth\/me(\?|$)/, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) }));
  await page.reload();
  await page.waitForSelector("#biz-f1, .overview-step", { timeout: 20000 });
  check("démarrage avec /auth/me en 503 : l'utilisateur mémorisé est conservé, l'étape se relit (pas de renvoi à la connexion)", !page.url().includes("/connexion") && (await page.locator("#biz-f1").count()) === 1);
  await page.unroute(/\/auth\/me(\?|$)/);
  await page.route(/\/auth\/me(\?|$)/, (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "authentication_required" }) }));
  await page.reload();
  await page.waitForURL(/\/connexion/, { timeout: 20000 });
  check("démarrage avec /auth/me en 401 : renvoi à la connexion (session réellement absente)", page.url().includes("/connexion"));
  await page.unroute(/\/auth\/me(\?|$)/);
  await page.goto(`${projectUrl}?module=parcours&etape=3`);
  await page.waitForSelector("#biz-f1", { timeout: 20000 });
  Object.assign(sc, { testPid });
}
