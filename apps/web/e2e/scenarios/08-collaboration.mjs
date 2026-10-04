/**
 * Scénario de bout en bout · 08-collaboration — Collaboration : commentaires, journal, partage, notifications, réservation d'édition.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** 6j. Collaboration : commentaires, journal des révisions. */
export async function commentaires(sc) {
  const { OUT, page, check } = sc;
  const { email, exampleUrl } = sc;
  // 6j. Collaboration : commentaire depuis une étape, accès et synchronisation annoncés tels quels, journal des révisions, suppression par l'auteur
  await page.goto(`${exampleUrl}?module=parcours&etape=8`);
  await page.waitForSelector(".step-comments");
  await page.locator(".step-comments > summary").click();
  check("étape 08 : pli « Commentaires (0) » vide", /Commentaires \(0\)/.test(await page.locator(".step-comments > summary").textContent()) && /Aucun commentaire sur cette étape/.test(await page.locator(".step-comments").textContent()));
  await page.locator(".step-comments textarea").fill("Vérifier la hauteur sous plafond avec le BET.");
  await page.locator('.step-comments button:has-text("Publier le commentaire")').click();
  await page.waitForFunction(() => /Commentaires \(1\)/.test(document.querySelector(".step-comments > summary")?.textContent || ""), null, { timeout: 10000 });
  check("étape 08 : « Publier le commentaire » → « Commentaires (1) », auteur et date", (await page.locator(".step-comments .comment-meta").first().textContent()).includes(email) && (await page.locator(".step-comments .comment > p").first().textContent()) === "Vérifier la hauteur sous plafond avec le BET.");
  // Réponse en fil : rattachée au commentaire d'origine, comptée, affichée en retrait.
  await page.locator('.step-comments button:has-text("Répondre")').first().click();
  await page.locator(".step-comments .comment-reply-form textarea").fill("Vu avec le BET : 3,20 m confirmés.");
  await page.locator('.step-comments button:has-text("Publier la réponse")').click();
  await page.waitForFunction(() => document.querySelectorAll(".step-comments .comment-reply").length === 1, null, { timeout: 10000 });
  check("étape 08 : « Répondre » → réponse en fil sous le commentaire d'origine, « Commentaires (2) »", /Commentaires \(2\)/.test(await page.locator(".step-comments > summary").textContent()) && (await page.locator(".step-comments .comment-reply p").textContent()) === "Vu avec le BET : 3,20 m confirmés." && (await page.locator(".step-comments .comment-reply").getAttribute("data-parent")) === (await page.locator(".step-comments li.comment").first().getAttribute("data-comment")));
  await page.goto(`${exampleUrl}?module=collaboration`);
  await page.waitForSelector(".journal-table tbody tr", { timeout: 30000 });
  const collabKpis = (await page.locator(".collaboration-module .biz-kpis").textContent()).replace(/\s+/g, " ");
  check("collaboration : propriétaire = vous, « Votre rôle · propriétaire », partage « 0 membre(s) », hors-ligne « Atelier, saisies, lecture », révision du modèle et dernière écriture", collabKpis.includes(email) && collabKpis.includes("c'est vous") && /Votre rôlepropriétaire/.test(collabKpis) && /Partage0 membre\(s\)/.test(collabKpis) && /Hors-ligneAtelier, saisies, lecture/.test(collabKpis) && /Révision \d+dernière écriture/.test(collabKpis), collabKpis);
  check("collaboration : le commentaire de l'étape 08 et sa réponse apparaissent, avec le lien « étape 08 »", (await page.locator("li.comment").count()) === 2 && (await page.locator(".comment-reply").count()) === 1 && (await page.locator('.comment a:has-text("étape 08")').count()) === 1);
  const journalKinds = new Set(await page.locator(".journal-table tbody tr").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-kind"))));
  check("collaboration : journal des révisions relu des données (projet, Harmonie, programme, modèle, parcelle, revue, documents, commentaire), du plus récent au plus ancien", ["projet", "harmonie", "programme", "modele", "parcelle", "revue", "document", "commentaire"].every((k) => journalKinds.has(k)) && (await page.locator(".journal-table tbody tr").first().getAttribute("data-kind")) === "commentaire");
  await page.locator('.collaboration-module .h7-tabs button:has-text("Document")').click();
  check("collaboration : filtre « Document » → les productions enregistrées sur la référence (archive, dossier complet de l'exemple, KMZ…)", (await page.locator(".journal-table tbody tr").count()) >= 2 && (await page.locator(".journal-table tbody tr").evaluateAll((rows) => rows.every((r) => r.getAttribute("data-kind") === "document"))));
  await page.locator(".collaboration-module .biz-card").first().screenshot({ path: `${OUT}/collaboration-desktop.png` });
  await page.locator(".comment-delete").first().click();
  await page.waitForFunction(() => document.querySelectorAll(".comment").length === 0, null, { timeout: 10000 });
  check("collaboration : « Supprimer » (auteur) le commentaire d'origine → sa réponse part avec lui, plus de commentaire", (await page.locator(".comment").count()) === 0);
}

/** 6m. Partage du projet (lecteur, notifications, réservation d'édition, éditeur, transfert, départ). */
export async function partage(sc) {
  const { BASE, OUT, browser, page, consoleErrors, check, axeCheck } = sc;
  const { email, projectUrl, testPid } = sc;
  // 6m. Partage du projet : invitation par adresse, rôle vérifié côté serveur (lecteur : lecture et commentaires ; éditeur : modifications), départ
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page2 = await ctx2.newPage();
  page2.on("pageerror", (e) => consoleErrors.push(e.message));
  const readerEmail = `lecteur-${Date.now()}@example.com`;
  await page2.goto(`${BASE}/inscription`);
  await page2.fill('input[name="email"]', readerEmail);
  await page2.fill('input[name="password"]', "scenario-pass-123");
  await page2.click('button[type="submit"]');
  await page2.waitForURL(/\/(projets|accueil)/);
  await page2.goto(`${BASE}/projets`);
  await page2.waitForSelector("#project-list-heading");
  check("partage : avant l'invitation, le second compte ne voit aucun projet partagé", (await page2.locator(".shared-projects").count()) === 0);
  check("partage : le second compte n'a pas accès au projet (404)", (await page2.request.get(`${BASE}/projects/${testPid}`)).status() === 404);
  // Le propriétaire invite depuis le module Collaboration.
  await page.goto(`${projectUrl}?module=collaboration`);
  await page.waitForSelector(".members-panel");
  check("collaboration : « Votre rôle · propriétaire », aucun membre invité", (await page.locator(".collab-role").textContent()) === "propriétaire" && /Aucun membre invité/.test(await page.locator(".members-table").textContent()));
  await page.fill('.members-invite input[type="email"]', "personne@example.com");
  await page.locator('.members-invite button:has-text("Inviter")').click();
  await page.waitForSelector(".members-panel .h7-error", { timeout: 10000 });
  check("collaboration : inviter une adresse sans compte → refus expliqué (« Aucun compte Fadi n'a cette adresse »)", /Aucun compte Fadi n’a cette adresse/.test(await page.locator(".members-panel .h7-error").textContent()));
  await page.fill('.members-invite input[type="email"]', readerEmail);
  await page.selectOption(".members-invite select", "lecteur");
  await page.locator('.members-invite button:has-text("Inviter")').click();
  await page.waitForSelector(`.members-table tr[data-member="${readerEmail}"]`, { timeout: 10000 });
  check("collaboration : membre invité listé comme lecteur, invité par le propriétaire", (await page.locator(`.members-table tr[data-member="${readerEmail}"] select`).inputValue()) === "lecteur" && new RegExp(`invité par ${email}`).test(await page.locator(`.members-table tr[data-member="${readerEmail}"]`).textContent()));
  await page.waitForFunction(() => /1 membre\(s\)/.test(document.querySelector(".biz-kpis")?.textContent || ""), null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/collaboration-partage-desktop.png`, fullPage: true });
  // Le lecteur : projet partagé listé, bandeau de lecture seule, formulaires et arbitrages inactifs, commentaire possible, Atelier en lecture seule.
  await page2.goto(`${BASE}/projets`);
  await page2.waitForSelector(".shared-projects", { timeout: 10000 });
  check("partage : « Projets partagés avec vous » — P.TEST, lecteur, partagé par le propriétaire", new RegExp(`P\\.TEST.*lecteur · partagé par ${email}`).test((await page2.locator(".shared-projects").textContent()).replace(/\s+/g, " ")));
  // Notifications dans l'application : l'accès reçu est signalé au second compte (cloche, compteur), consulté à l'ouverture ; aucun courriel.
  await page2.waitForSelector(".notification-count", { timeout: 15000 });
  check("notifications : la cloche du second compte compte 1 non lue (accès reçu)", (await page2.locator(".notification-count").textContent()) === "1" && /1 non lue/.test(await page2.locator(".notification-bell > button").getAttribute("aria-label")));
  await page2.locator(".notification-bell > button").click();
  await page2.waitForSelector(".notification-list li", { timeout: 10000 });
  check("notifications : « X vous a donné accès à P.TEST — Étude test migration (lecteur) », mention « aucun courriel n’est envoyé »", new RegExp(`${email} vous a donné accès à P\\.TEST — Étude test migration \\(lecteur\\)\\.`).test(await page2.locator('.notification-list li[data-kind="acces"]').textContent()) && /aucun courriel n’est envoyé/.test(await page2.locator(".notification-popover").textContent()), await page2.locator(".notification-list").textContent());
  await page2.waitForFunction(() => !document.querySelector(".notification-count"), null, { timeout: 10000 });
  const popoverBox = await page2.locator(".notification-popover").boundingBox();
  if (popoverBox) await page2.screenshot({ path: `${OUT}/notifications-desktop.png`, clip: { x: Math.max(0, popoverBox.x - 60), y: 0, width: Math.min(1280 - Math.max(0, popoverBox.x - 60), popoverBox.width + 120), height: popoverBox.y + popoverBox.height + 16 } });
  check("notifications : consultées → plus de compteur (date de consultation conservée par compte)", (await page2.locator(".notification-count").count()) === 0);
  await page2.keyboard.press("Escape");
  await page2.locator('.shared-projects a:has-text("Étude test migration")').click();
  await page2.waitForSelector(".access-banner", { timeout: 15000 });
  check("lecteur : en-tête « lecteur · partagé par … » et bandeau « Projet partagé en lecture »", new RegExp(`lecteur · partagé par ${email}`).test(await page2.locator(".project-role").textContent()) && /Projet partagé en lecture/.test(await page2.locator(".access-banner").textContent()));
  await page2.goto(`${projectUrl}?module=parcours&etape=2`);
  await page2.waitForSelector("#biz-f1");
  check("lecteur : saisies désactivées (fieldset), « Retenir » inactif, « Marquer terminée » inactif, pas d'import de sources", (await page2.locator("fieldset.biz-grid[disabled]").count()) === 1 && (await page2.locator("#biz-f1").isDisabled()) && (await page2.locator('.h7-proposal button:has-text("Retenir")').first().isDisabled()) && (await page2.locator('button:has-text("Marquer terminée")').isDisabled()) && (await page2.locator('.step-sources button:has-text("Importer des fichiers")').count()) === 0);
  check("lecteur : la valeur saisie par le propriétaire reste lisible", (await page2.inputValue("#biz-f1")).length > 0);
  await axeCheck(page2, "étape 02 en lecture seule (lecteur)");
  await page2.evaluate(() => { document.querySelector(".step-comments").open = true; });
  await page2.fill(".step-comments textarea", "Lecture faite : à confirmer avec le BET.");
  await page2.locator('.step-comments button:has-text("Publier le commentaire")').click();
  await page2.waitForFunction(() => /Lecture faite : à confirmer avec le BET\./.test(document.querySelector(".step-comments")?.textContent || ""), null, { timeout: 10000 });
  check("lecteur : commentaire publié sur l'étape", true);
  // … et signalé au propriétaire dans sa cloche (relue à la navigation).
  await page.goto(`${projectUrl}?module=collaboration`);
  await page.waitForSelector(".notification-count", { timeout: 15000 });
  await page.locator(".notification-bell > button").click();
  await page.waitForSelector(".notification-list li", { timeout: 10000 });
  check("notifications : le propriétaire voit le commentaire du lecteur (« … a commenté P.TEST · étape 02 : « Lecture faite … » »), lien vers l'étape", new RegExp(`${readerEmail} a commenté P\\.TEST · étape 02 : « Lecture faite : à confirmer avec le BET\\. »`).test(await page.locator('.notification-list li[data-kind="commentaire"]').first().textContent()) && /etape=2$/.test((await page.locator('.notification-list li[data-kind="commentaire"] a').first().getAttribute("href")) || ""), await page.locator(".notification-list").textContent());
  await page.keyboard.press("Escape");
  const readerPatch = await page2.request.patch(`${BASE}/projects/${testPid}/steps/2`, { data: { fields: { f1: "tentative lecteur" } } });
  check("lecteur : une écriture forcée est refusée par le serveur (403 avec motif)", readerPatch.status() === 403 && /partagé en lecture/.test(((await readerPatch.json()).message) || ""));
  await page2.screenshot({ path: `${OUT}/partage-lecteur-02-desktop.png`, fullPage: true });
  await page2.goto(`${projectUrl}?module=atelier`);
  await page2.waitForSelector('[data-testid="plan2d-toile"]', { timeout: 30000 });
  // Lecture seule : un outil qui écrit (Mur, raccourci M) est refusé avec le motif du partage ; rien n'est envoyé.
  await page2.locator('[data-testid="plan2d-toile"]').focus();
  await page2.keyboard.press("m");
  await page2.waitForSelector('[data-testid="atl-refus-outil"]', { timeout: 10000 }).catch(() => null);
  check("lecteur : Atelier en lecture seule (outil d'écriture refusé avec le motif, rien n'est enregistré)", /partagé en lecture/.test((await page2.locator('[data-testid="atl-refus-outil"]').textContent().catch(() => "")) || ""));
  // Le propriétaire passe le lecteur éditeur : la saisie devient possible et visible par le propriétaire.
  await page.selectOption(`.members-table tr[data-member="${readerEmail}"] select`, "editeur");
  await page.waitForFunction((e) => /est maintenant éditeur/.test(document.querySelector(".members-notice")?.textContent || ""), null, { timeout: 10000 });
  // Réservation d'édition (verrou optionnel) : le propriétaire réserve, l'éditeur lit et commente seulement (423 côté serveur) ; rendue, l'éditeur écrit.
  await page.goto(`${projectUrl}?module=parcours&etape=2`);
  await page.waitForSelector(".editing-lock-free");
  await page.locator('.editing-lock button:has-text("Réserver l’édition")').click();
  await page.waitForSelector(".editing-lock-mine", { timeout: 10000 });
  check("propriétaire : « Réserver l’édition » → « Édition réservée par vous jusqu’à HH:MM », Prolonger / Rendre la main", /Édition réservée par vous jusqu’à \d{2}:\d{2}/.test(await page.locator(".editing-lock-mine").textContent()) && (await page.locator('.editing-lock button:has-text("Rendre la main")').count()) === 1);
  await page2.goto(`${projectUrl}?module=parcours&etape=2`);
  await page2.waitForSelector(".editing-lock-other", { timeout: 15000 });
  await page2.waitForFunction(() => document.querySelector("#biz-f1")?.disabled, null, { timeout: 10000 }).catch(() => {});
  check("éditeur pendant la réservation : « Édition réservée par … », bandeau, saisies et arbitrages inactifs", new RegExp(`Édition réservée par ${email} jusqu’à`).test(await page2.locator(".editing-lock-other").textContent()) && /Édition réservée par .* lecture et commentaires seulement/.test(await page2.locator(".access-banner").textContent()) && (await page2.locator("#biz-f1").isDisabled()) && (await page2.locator('.h7-proposal button:has-text("Retenir")').first().isDisabled()));
  const lockedPatch = await page2.request.patch(`${BASE}/projects/${testPid}/steps/2`, { data: { fields: { f1: "tentative pendant la réservation" } } });
  check("éditeur pendant la réservation : une écriture forcée est refusée (423, motif et échéance)", lockedPatch.status() === 423 && /^Édition réservée par .* jusqu'à \d{2}:\d{2}/.test(((await lockedPatch.json()).message) || ""), String(lockedPatch.status()));
  await page2.evaluate(() => { document.querySelector(".step-comments").open = true; });
  await page2.fill(".step-comments textarea", "Je relis pendant la réservation.");
  await page2.locator('.step-comments button:has-text("Publier le commentaire")').click();
  await page2.waitForFunction(() => /Je relis pendant la réservation\./.test(document.querySelector(".step-comments")?.textContent || ""), null, { timeout: 10000 });
  check("éditeur pendant la réservation : commentaire toujours possible", true);
  await page2.evaluate(() => window.scrollTo(0, 0));
  await page2.waitForTimeout(300);
  await page2.screenshot({ path: `${OUT}/partage-edition-reservee-desktop.png`, fullPage: false });
  await page.locator('.editing-lock button:has-text("Rendre la main")').click();
  await page.waitForSelector(".editing-lock-free", { timeout: 10000 });
  check("propriétaire : « Rendre la main » → édition libre", true);
  await page2.goto(`${projectUrl}?module=parcours&etape=2`);
  await page2.waitForFunction(() => document.querySelector(".project-role")?.textContent?.startsWith("éditeur") && !document.querySelector("#biz-f1")?.disabled, null, { timeout: 15000 });
  await page2.waitForFunction(() => /Synchronisé avec le serveur/.test(document.querySelector(".sync-indicator")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
  await page2.waitForTimeout(600); // relectures (verrou, étapes) terminées avant la saisie
  const editorPatch = page2.waitForResponse((r) => r.request().method() === "PATCH" && /\/steps\/2$/.test(r.url()), { timeout: 15000 }).catch(() => null);
  await page2.fill("#biz-f1", "Zone UA (saisie de l'éditeur)");
  await page2.locator("#biz-f1").blur();
  const editorPatchResponse = await editorPatch;
  await page.waitForFunction(async (pid) => (await (await fetch(`/projects/${pid}/steps/2`, { credentials: "include" })).json()).content.fields.f1 === "Zone UA (saisie de l'éditeur)", testPid, { timeout: 10000 }).catch(() => {});
  check("éditeur : la saisie est enregistrée sur le projet partagé et lue par le propriétaire", (await (await page.request.get(`${BASE}/projects/${testPid}/steps/2`)).json()).content.fields.f1 === "Zone UA (saisie de l'éditeur)", `PATCH ${editorPatchResponse ? editorPatchResponse.status() : "non vu"} · indicateur « ${await page2.locator(".sync-indicator").textContent()} » · conflits ${await page2.locator(".conflict-banner").count()} · valeur du champ « ${await page2.inputValue("#biz-f1")} »`);
  await page.goto(`${projectUrl}?module=collaboration`);
  await page.waitForFunction((e) => new RegExp(`Commentaire · ${e}`).test(document.querySelector(".journal-table")?.textContent || ""), readerEmail, { timeout: 15000 }).catch(() => {});
  check("journal : le commentaire du lecteur est daté et attribué", new RegExp(`Commentaire · ${readerEmail}`).test(await page.locator(".journal-table").textContent()));
  // L'éditeur quitte le projet : il disparaît de sa liste, le propriétaire ne voit plus de membre.
  await page2.goto(`${projectUrl}?module=collaboration`);
  await page2.waitForSelector(".members-panel");
  check("éditeur : « Votre rôle · éditeur », pas de formulaire d'invitation", (await page2.locator(".collab-role").textContent()) === "éditeur" && (await page2.locator(".members-invite").count()) === 0);
  // Transfert de propriété puis retour : l'éditeur devient propriétaire (il voit le formulaire d'invitation), l'ancien reste éditeur, et inversement.
  await page.goto(`${projectUrl}?module=collaboration`);
  await page.waitForSelector(`.members-table tr[data-member="${readerEmail}"]`);
  page.once("dialog", (d) => d.accept());
  await page.locator(`.members-table tr[data-member="${readerEmail}"] button:has-text("Transférer la propriété")`).click();
  await page.waitForFunction(() => /est maintenant propriétaire/.test(document.querySelector(".members-notice")?.textContent || ""), null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector(".collab-role")?.textContent === "éditeur", null, { timeout: 10000 }).catch(() => {});
  check("transfert de propriété : l'ancien propriétaire devient éditeur (plus de formulaire d'invitation), le membre devient propriétaire", (await page.locator(".collab-role").textContent()) === "éditeur" && (await page.locator(".members-invite").count()) === 0 && new RegExp(readerEmail).test(await page.locator('.members-table tr[data-member="owner"]').textContent()));
  await page2.goto(`${projectUrl}?module=collaboration`);
  await page2.waitForSelector(".members-invite", { timeout: 15000 });
  await page2.waitForFunction(() => document.querySelector(".collab-role")?.textContent === "propriétaire", null, { timeout: 10000 }).catch(() => {}); // cache persistant relu
  check("nouveau propriétaire : « Votre rôle · propriétaire », formulaire d'invitation, ancien propriétaire listé éditeur", (await page2.locator(".collab-role").textContent()) === "propriétaire" && (await page2.locator(`.members-table tr[data-member="${email}"] select`).inputValue()) === "editeur");
  page2.once("dialog", (d) => d.accept());
  await page2.locator(`.members-table tr[data-member="${email}"] button:has-text("Transférer la propriété")`).click();
  await page2.waitForFunction(() => /est maintenant propriétaire/.test(document.querySelector(".members-notice")?.textContent || ""), null, { timeout: 10000 });
  await page2.waitForFunction(() => document.querySelector(".collab-role")?.textContent === "éditeur", null, { timeout: 10000 }).catch(() => {});
  check("transfert retour : la propriété revient au premier compte, le second redevient éditeur", (await page2.locator(".collab-role").textContent()) === "éditeur");
  await page2.goto(`${projectUrl}?module=collaboration`);
  await page2.waitForSelector('.members-table button:has-text("Quitter le projet")', { timeout: 15000 });
  await page2.locator('.members-table button:has-text("Quitter le projet")').click();
  await page2.waitForURL(/\/projets$/, { timeout: 10000 });
  await page2.waitForSelector("#project-list-heading");
  await page2.waitForFunction(() => !document.querySelector(".shared-projects"), null, { timeout: 10000 }).catch(() => {}); // liste restaurée du cache puis relue
  check("quitter le projet : retour à « Mes projets » sans projet partagé, accès retiré (404)", (await page2.locator(".shared-projects").count()) === 0 && (await page2.request.get(`${BASE}/projects/${testPid}`)).status() === 404);
  await page.reload();
  await page.waitForFunction(() => /Aucun membre invité/.test(document.querySelector(".members-table")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
  check("propriétaire : plus aucun membre invité", /Aucun membre invité/.test(await page.locator(".members-table").textContent()));
  await ctx2.close();
}
