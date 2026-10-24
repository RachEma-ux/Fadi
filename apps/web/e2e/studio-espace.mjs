#!/usr/bin/env node
/**
 * Recette de l'espace de travail Studio (refonte UXS, ADR-STUDIO-NAV-01 §1) par l'interface et l'API réelles :
 *   1. accueil `/studio` : aucune redirection ; « Nouvelle étude » (projet choisi, nom prérempli, sans choix de planche)
 *      ouvre l'espace de la variante initiale, sans objet créé ; puis « Reprendre : projet › étude › variante »
 *      (suggestion vérifiée) ; choix explicite d'une variante ;
 *   2. espace (1440×900) : barre des domaines persistante en haut dans les quatre domaines, un domaine affiché à la fois,
 *      toute la largeur (aucune limite de 1600 px), palette verticale, barre d'état ; Outils (Tool Manager) et palette
 *      Ctrl+K depuis chacun des quatre domaines (barre de l'espace) ; Double vue (extension proposée) côte à côte ;
 *   3. workflow déclaré (REF-01 §06) : « Non déclarée » par défaut ; déclaration par la pastille (propriétaire) ;
 *      suggestions = liens vers les domaines ; lecteur en lecture seule ; API : 400 phase inconnue, 403 lecteur,
 *      409 étude archivée ; archive de projet : phase restaurée à l'identique, archive antérieure (sans la colonne)
 *      restaurée à NULL ;
 *   4. téléphone (390×844) : barre des domaines compacte en haut, Double vue empilée, palette en barre inférieure,
 *      Outils accessible, aucun débordement.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-espace.mjs
 */
import { chromium } from "playwright";
import { appelPlaywright, inviterEtAccepter } from "./lib-invitations.mjs";
import { createHash } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const DOMAINES = ["dessin", "bim", "visualisation", "documentation"];
const NOMS = { dessin: "Dessin et modélisation", bim: "BIM et coordination", visualisation: "Visualisation, rendu et immersion", documentation: "Documentation, métrés et collaboration" };
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${String(detail).slice(0, 400)}` : ""}`);
  if (!ok) echecs += 1;
}
/** JSON canonique et empreinte, mêmes règles que `apps/api/src/lib/studio-archive-manifest.ts`. */
function canonique(v) {
  if (Array.isArray(v)) return `[${v.map(canonique).join(",")}]`;
  if (v !== null && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
const sha = (s) => createHash("sha256").update(s).digest("hex");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
async function compte(nom, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(`${nom} : ${e.message}`));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-espace-${nom}-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-espace-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? { timeout: 120000 } : { data, timeout: 120000 });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  return { context, page, api };
}

try {
  const a = await compte("a");
  const { page, api } = a;
  const projet = (await api("post", "/projects", { code: `P.ESP.${Date.now().toString(36).slice(-5)}`, name: "Studio — espace (recette)" })).body;
  const dialogues = [];
  page.on("dialog", (d) => { dialogues.push(d.message()); void d.accept(); });

  // 1. Accueil : aucune redirection, nouvelle étude sans choix de planche, puis suggestion de reprise.
  await page.goto(`${BASE}/studio`);
  await page.locator("[data-studio-lanceur]").waitFor();
  check("accueil : aucune redirection ; « Nouvelle étude » en tête, projet choisi, nom prérempli modifiable", page.url() === `${BASE}/studio`
    && (await page.locator(`[data-studio-choix-projet-id="${projet.id}"][aria-pressed="true"]`).count()) === 1 && /^Étude /.test(await page.locator("#studio-etude-nom").inputValue()));
  check("accueil : pas de « Planche 2D / Planche 3D » dans le lanceur (la planche se choisit dans le domaine 01)", (await page.locator("[data-studio-lanceur] [data-studio-planche-depart], [data-studio-lanceur] [data-studio-planche]").count()) === 0);
  await page.locator("#studio-etude-nom").fill("Étude espace");
  await page.locator("[data-studio-ouvrir-etude]").click();
  await page.waitForURL(new RegExp(`/studio/projets/${projet.id}/etudes/[^/]+/variantes/[^/?]+$`));
  await page.locator("[data-studio-barre-etat]").waitFor();
  const [, , , , , studyId, , variantId] = new URL(page.url()).pathname.split("/");
  const base = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  const ctx = (await api("get", `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`)).body;
  check("« Ouvrir » : espace de la variante initiale en Dessin et modélisation, Planche 2D ; aucun objet ni solide créé", (await page.locator("[data-studio-domaine-affiche]").getAttribute("data-studio-domaine-affiche")) === "dessin"
    && (await page.locator('[data-studio-planche="2d"]').getAttribute("aria-pressed")) === "true" && ctx.revision.document.objects.length === 0 && !(ctx.revision.document.solides?.length));
  await page.goto(`${BASE}/studio`);
  const reprendre = page.locator("[data-studio-reprendre]");
  await reprendre.waitFor();
  check("accueil : « Reprendre : projet › étude › variante » (suggestion vérifiée), sans redirection", page.url() === `${BASE}/studio` && ((await reprendre.textContent()) ?? "").includes(`${projet.code} › Étude espace › `)
    && (await reprendre.getAttribute("href")) === new URL(base).pathname + "?domaine=dessin&planche=2d");
  await page.locator(`[data-studio-lanceur-etude="${studyId}"] [data-studio-ouvrir-variante="${variantId}"]`).waitFor();
  check("accueil : choix explicite d'une variante de l'étude", (await page.locator(`[data-studio-ouvrir-variante="${variantId}"]`).getAttribute("href")) === new URL(base).pathname);

  // 2. Espace : barre persistante, un domaine à la fois, toute la largeur, Outils et palette depuis chaque domaine.
  await page.goto(base);
  await page.locator("[data-studio-barre-etat]").waitFor();
  for (const d of DOMAINES) {
    await page.locator(`[data-studio-domaines] a[data-studio-domaine-lien="${d}"]`).click();
    await page.waitForSelector(`[data-studio-domaine-affiche="${d}"]`);
    const etat = await page.evaluate(() => {
      const barre = document.querySelector("[data-studio-barre-espace]").getBoundingClientRect();
      const canevas = document.querySelector(".studio-canevas").getBoundingClientRect();
      const ecran = document.querySelector(".studio-ecran").getBoundingClientRect();
      const main = document.querySelector("#workspace-content").getBoundingClientRect();
      return {
        barreEnHaut: barre.bottom <= canevas.top + 1 && barre.height > 0, visibles: [...document.querySelectorAll("[data-studio-domaine]")].filter((s) => s.getClientRects().length).map((s) => s.getAttribute("data-studio-domaine")),
        largeur: Math.round(ecran.width), disponible: Math.round(main.width), palette: document.querySelector("[data-studio-palette-outils] [role=toolbar]")?.getAttribute("aria-orientation"),
      };
    });
    check(`${NOMS[d]} : barre des domaines persistante en haut, seul ce domaine affiché, palette verticale`, etat.barreEnHaut && JSON.stringify(etat.visibles) === JSON.stringify([d]) && etat.palette === "vertical", JSON.stringify(etat));
    check(`${NOMS[d]} : l'espace occupe toute la largeur (gouttières faibles, aucune limite de 1600 px)`, etat.largeur >= etat.disponible - 24, JSON.stringify(etat));
    await page.getByRole("toolbar", { name: "Actions de l’espace" }).getByRole("button", { name: "Outils", exact: true }).click();
    await page.locator("[data-studio-gestionnaire-outils]").waitFor();
    check(`${NOMS[d]} : « Outils » (Tool Manager) s'ouvre depuis la barre de l'espace`, (await page.locator('[role="dialog"] [data-studio-gestionnaire-outils]').count()) === 1);
    await page.keyboard.press("Escape");
    await page.locator("[data-studio-gestionnaire-outils]").waitFor({ state: "detached" });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Control+k");
    await page.locator("[data-studio-palette]").waitFor();
    check(`${NOMS[d]} : palette de commandes (Ctrl+K) disponible`, (await page.locator("[data-studio-palette]").count()) === 1);
    await page.keyboard.press("Escape");
    await page.locator("[data-studio-palette]").waitFor({ state: "detached" });
  }
  check("barre de l'espace : Annuler, Rétablir, Enregistrer, Outils, palette — icône et raccourci (règle d'or)", (await page.locator('[data-studio-actions-espace] button[aria-keyshortcuts] svg').count()) === 5
    && JSON.stringify(await page.locator("[data-studio-actions-espace] button").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-commande")))) === JSON.stringify(["annuler", "retablir", "enregistrer", "outils", "palette"]));
  await page.locator('[data-studio-domaine-lien="dessin"]').click();
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  const doubleVue = page.locator('[data-studio-planche="double"]');
  check("Double vue : étiquetée « extension proposée »", (await doubleVue.getAttribute("aria-label")) === "Double vue (extension proposée)" && (await doubleVue.locator(".studio-extension").textContent()) === "proposée");
  await doubleVue.click();
  await page.waitForURL(`${base}?domaine=dessin&planche=double`);
  await page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").waitFor();
  const cote = await page.evaluate(() => {
    const p = document.querySelector('[aria-label="Planche de dessin 2D"]').getBoundingClientRect(), v = document.querySelector("[data-studio-vue3d]").getBoundingClientRect();
    return { coteACote: p.right <= v.left + 1 && Math.abs(p.top - v.top) < 60, largeurs: [Math.round(p.width), Math.round(v.width)], hauteurs: [Math.round(p.height), Math.round(v.height)] };
  });
  check("Double vue (1440×900) : Planche 2D et Planche 3D côte à côte, chacune exploitable", cote.coteACote && cote.largeurs.every((w) => w > 300) && cote.hauteurs.every((h) => h > 300), JSON.stringify(cote));
  check("Double vue : planche active nommée dans la barre d'état", (await page.locator("[data-studio-planche-active]").textContent()) === "Double vue");

  // 3. Workflow déclaré.
  const pastille = page.locator(".studio-fil [data-studio-workflow]");
  check("workflow : « Non déclarée » par défaut, sans phase déduite", (await pastille.getAttribute("data-studio-workflow-phase")) === "non-declaree" && ((await pastille.locator("[data-studio-workflow-bouton]").textContent()) ?? "").includes("Non déclarée"));
  await pastille.locator("[data-studio-workflow-bouton]").click();
  check("workflow : menu des sept phases dans l'ordre de REF-01 §06", JSON.stringify(await pastille.locator("[data-studio-phase]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-phase")))) === JSON.stringify(["cadrer", "explorer", "concevoir", "controler", "coordonner", "approuver", "publier"]));
  await pastille.locator('[data-studio-declarer-phase="controler"]').click();
  await page.waitForFunction(() => document.querySelector(".studio-fil [data-studio-workflow]")?.getAttribute("data-studio-workflow-phase") === "controler");
  const lue = (await api("get", `/projects/${projet.id}/studio/studies/${studyId}`)).body;
  check("workflow : « Contrôler » déclaré par le propriétaire, relu par le serveur ; aucune révision créée", lue.study.workflowPhase === "controler"
    && (await api("get", `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`)).body.revision.id === ctx.revision.id);
  const suggestion = pastille.locator('[data-studio-suggestion-domaine="bim"]');
  check("workflow : suggestion « Ouvrir ensuite » = lien vers BIM et coordination (aucun effet métier)", (await suggestion.getAttribute("href")) === `${new URL(base).pathname}?domaine=bim`);
  await suggestion.click();
  await page.waitForSelector('[data-studio-domaine-affiche="bim"]');
  check("workflow : la suggestion ouvre le domaine dans la même variante, sans confirmation", page.url() === `${base}?domaine=bim` && dialogues.length === 0, page.url());
  for (const [corps, attendu] of [[{ phase: "inconnue" }, 400], [{ phase: "controler", x: 1 }, 400]]) {
    const r = await api("patch", `/projects/${projet.id}/studio/studies/${studyId}/workflow`, corps);
    check(`API workflow : ${JSON.stringify(corps)} → ${attendu}`, r.status === attendu, `${r.status} ${JSON.stringify(r.body)}`);
  }
  const lecteur = await compte("lecteur");
  const emailLecteur = await lecteur.page.evaluate(async () => (await (await fetch("/auth/me", { credentials: "include" })).json()).email);
  check("lecteur invité, invitation acceptée (phase 3)", (await inviterEtAccepter((m, p, b) => api(m.toLowerCase(), p, b), (m, p, b) => lecteur.api(m.toLowerCase(), p, b), projet.id, emailLecteur, "lecteur")).ok);
  const refusLecteur = await lecteur.api("patch", `/projects/${projet.id}/studio/studies/${studyId}/workflow`, { phase: "publier" });
  check("API workflow : lecteur refusé (403), phase inchangée", refusLecteur.status === 403 && (await api("get", `/projects/${projet.id}/studio/studies/${studyId}`)).body.study.workflowPhase === "controler", String(refusLecteur.status));
  await lecteur.page.goto(base);
  const pastilleLecteur = lecteur.page.locator(".studio-fil [data-studio-workflow]");
  await pastilleLecteur.waitFor();
  await pastilleLecteur.locator("[data-studio-workflow-bouton]").click();
  check("workflow : le lecteur voit la phase déclarée, sans pouvoir la déclarer", (await pastilleLecteur.getAttribute("data-studio-workflow-phase")) === "controler"
    && (await pastilleLecteur.locator("[data-studio-declarer-phase]").count()) === 0 && (await pastilleLecteur.locator("[data-studio-workflow-lecture]").count()) === 1);
  await api("post", `/projects/${projet.id}/studio/studies/${studyId}/archive`);
  const archivee = await api("patch", `/projects/${projet.id}/studio/studies/${studyId}/workflow`, { phase: "publier" });
  check("API workflow : étude archivée → 409, phase inchangée", archivee.status === 409 && (await api("get", `/projects/${projet.id}/studio/studies/${studyId}?archives=1`)).body.study.workflowPhase === "controler", `${archivee.status} ${JSON.stringify(archivee.body)}`);
  await page.goto(`${base}?domaine=bim`);
  await page.locator("[data-studio-barre-etat]").waitFor();
  check("étude archivée : lecture seule dans le domaine BIM (Enregistrer indisponible), phase non déclarable", (await page.getByRole("toolbar", { name: "Actions de l’espace" }).getByRole("button", { name: "Enregistrer", exact: true }).isDisabled())
    && await (async () => { await page.locator(".studio-fil [data-studio-workflow-bouton]").click(); return (await page.locator(".studio-fil [data-studio-declarer-phase]").count()) === 0; })());
  await page.goto(`${BASE}/studio`);
  await reprendre.waitFor();
  check("accueil : une variante archivée reste proposée, marquée « Archivée — lecture seule »", (await page.locator("[data-studio-reprise-archivee] [data-studio-reprise-lecture-seule]").count()) === 1);
  await api("post", `/projects/${projet.id}/studio/studies/${studyId}/unarchive`);
  // Archive de projet : la phase déclarée fait l'aller-retour ; une archive antérieure (sans la colonne) se restaure à NULL.
  const archive = (await api("get", `/projects/${projet.id}/archive`)).body;
  const ligne = archive?.studio?.tables?.studio_studies?.find((s) => s.id === studyId);
  check("archive : la ligne studio_studies porte workflow_phase", ligne?.workflow_phase === "controler", JSON.stringify(ligne));
  const ancienne = JSON.parse(JSON.stringify(archive));
  const sansPhase = (await page.request.delete(`${BASE}/projects/${projet.id}`)).status();
  const restaure = await api("post", "/projects/import", archive);
  const rid = restaure.body?.projects?.[0]?.id;
  const relue = rid ? (await api("get", `/projects/${rid}/studio/studies/${studyId}`)).body : null;
  check("restauration : la phase déclarée est restaurée à l'identique", sansPhase === 204 && restaure.status === 201 && restaure.body.projects[0].studio?.restored === true && relue?.study?.workflowPhase === "controler",
    `${sansPhase} ${restaure.status} ${JSON.stringify(restaure.body?.projects?.[0]?.studio ?? restaure.body).slice(0, 200)}`);
  // Archive « antérieure » : la colonne retirée des lignes, manifeste recalculé (signature retirée : archive non vérifiée).
  const s = ancienne.studio;
  for (const l of s.tables.studio_studies) delete l.workflow_phase;
  const tri = [...s.tables.studio_studies].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  s.manifest.tables.studio_studies = { count: tri.length, hash: sha(canonique(tri)) };
  const comptes = [...s.accounts].map((c) => ({ id: c.id, email: c.email })).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  s.manifest.hash = sha(canonique({ tables: s.manifest.tables, sourceProjectId: s.sourceProjectId, ownerId: s.ownerId, accounts: comptes }));
  delete s.signature;
  if (rid) await page.request.delete(`${BASE}/projects/${rid}`);
  const restaureAncienne = await api("post", "/projects/import", ancienne);
  const rid2 = restaureAncienne.body?.projects?.[0]?.id;
  const relueAncienne = rid2 ? (await api("get", `/projects/${rid2}/studio/studies/${studyId}`)).body : null;
  check("restauration d'une archive antérieure (sans la colonne) : étude restaurée, phase « non déclarée » (NULL), rien d'inventé", restaureAncienne.status === 201 && restaureAncienne.body.projects[0].studio?.restored === true
    && relueAncienne?.study && relueAncienne.study.workflowPhase === null, `${restaureAncienne.status} ${JSON.stringify(restaureAncienne.body?.projects?.[0]?.studio ?? restaureAncienne.body).slice(0, 300)}`);
  const baseRestauree = rid2 ? `${BASE}/studio/projets/${rid2}/etudes/${studyId}/variantes/${variantId}` : base;

  // 4. Téléphone.
  const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, storageState: await a.context.storageState() });
  const mobile = await tel.newPage();
  mobile.setDefaultTimeout(30000);
  mobile.on("pageerror", (e) => erreurs.push(`téléphone : ${e.message}`));
  await mobile.goto(`${baseRestauree}?domaine=dessin&planche=double`);
  await mobile.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").waitFor();
  const m = await mobile.evaluate(() => {
    const nav = document.querySelector("[data-studio-domaines]").getBoundingClientRect(), canevas = document.querySelector(".studio-canevas").getBoundingClientRect();
    const p = document.querySelector('[aria-label="Planche de dessin 2D"]').getBoundingClientRect(), v = document.querySelector("[data-studio-vue3d]").getBoundingClientRect();
    const palette = document.querySelector("[data-studio-palette-outils]").getBoundingClientRect();
    return {
      compacte: !!document.querySelector("[data-studio-domaines-menu]"), navEnHaut: nav.bottom <= canevas.top + 1, empilees: v.top >= p.bottom - 1, paletteSous: palette.top >= canevas.bottom - 1,
      deborde: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  check("téléphone : barre des domaines compacte en haut ; Double vue empilée ; palette en barre inférieure ; aucun débordement", m.compacte && m.navEnHaut && m.empilees && m.paletteSous && !m.deborde, JSON.stringify(m));
  await mobile.getByRole("toolbar", { name: "Actions de l’espace" }).getByRole("button", { name: "Outils", exact: true }).tap();
  await mobile.locator("[data-studio-gestionnaire-outils]").waitFor();
  check("téléphone : « Outils » s'ouvre depuis la barre de l'espace", true);
  await tel.close();

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echecs += 1;
  console.error(e);
} finally {
  await browser.close();
}
if (echecs) { console.error(`${echecs} échec(s)`); process.exit(1); }
console.log("Recette de l'espace de travail Studio : tout est vert.");
