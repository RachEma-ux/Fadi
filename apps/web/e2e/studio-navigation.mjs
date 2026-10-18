#!/usr/bin/env node
/**
 * Recette de Studio (ADR-STUDIO-NAV-01, NAV-001 à NAV-004, NAV-006, NAV-008, NAV-009) : entrée de la barre verticale,
 * routes propres sous /studio, aucun passage par le Parcours ni l'Atelier, refus sans divulgation, adresse inconnue
 * explicite, barre jamais masquée ; études et variantes créées par l'interface, droits relus par le serveur ; Planche 2D :
 * dessin, cote associée, révisions immuables, réouverture, conflit et lecture seule. API et application construites, même origine, base CI dédiée.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio node apps/web/e2e/studio-navigation.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "atelier-captures/studio";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
const erreurs = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}

async function nouvelUtilisateur(nom, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(`${nom} : ${e.message}`));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-${nom}-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-navigation-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()}`);
    return r.json();
  };
  return { context, page, api };
}

try {
  const a = await nouvelUtilisateur("a");
  const pA = await a.api("post", "/projects", { code: "P.STU.A", name: "Studio — Projet A" });
  const pA2 = await a.api("post", "/projects", { code: "P.STU.B", name: "Studio — Projet B" });
  const b = await nouvelUtilisateur("b");
  const pB = await b.api("post", "/projects", { code: "P.STU.SECRET", name: "Studio — Projet confidentiel" });
  const { page } = a;

  // NAV-001 : entrée « Studio » dans la navigation principale, après Projets, nom accessible et état actif.
  await page.goto(`${BASE}/accueil`);
  const entree = page.locator('#workspace-navigation a[data-nav-studio]');
  await entree.waitFor({ state: "visible" }).catch(() => {});
  check("NAV-001 : entrée Studio dans la navigation principale", await entree.isVisible());
  check("NAV-001 : nom accessible et infobulle « Studio »", (await entree.getAttribute("aria-label")) === "Studio" && (await entree.getAttribute("title")) === "Studio");
  const ordre = await page.locator("#workspace-navigation > *").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check("NAV-001 : Studio placé après Projets", ordre.indexOf("Studio") === ordre.indexOf("Projets") + 1, ordre.join(" · "));
  await entree.click();
  await page.waitForURL(`${BASE}/studio`);
  await page.locator('[data-studio="accueil"]').waitFor();
  check("NAV-001 : Studio actif sur ses routes", (await entree.getAttribute("class"))?.includes("active") === true);
  check("NAV-006 : l'entrée Projets n'est pas faussement active", !((await page.locator(".sidebar-projects").getAttribute("class")) ?? "").includes("active"));

  // NAV-003 : choix explicite du projet, rien n'est créé à l'ouverture.
  const liste = page.locator("[data-studio-projets] li");
  await liste.first().waitFor();
  const textes = await liste.allTextContents();
  check("NAV-003 : les projets autorisés sont proposés, sans projet d'autrui", textes.some((t) => t.includes("P.STU.A")) && textes.some((t) => t.includes("P.STU.B")) && !textes.some((t) => t.includes("P.STU.SECRET")));
  check("NAV-003 : aucun projet créé par l'ouverture de Studio", (await a.api("get", "/projects")).length === 2);

  // NAV-002 : ouverture d'un projet sans passer par le Parcours ni l'Atelier.
  const requetes = [];
  page.on("request", (r) => requetes.push(new URL(r.url()).pathname));
  await page.locator("[data-studio-projets] a", { hasText: "P.STU.A" }).click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}`);
  await page.locator(`[data-studio-projet="${pA.id}"]`).waitFor();
  const parcours = requetes.filter((p) => /\/steps|\/programme|\/atelier\//.test(p));
  check("NAV-002 : aucune lecture du Parcours, du programme ni de l'Atelier", parcours.length === 0, parcours.join(", "));
  check("NAV-006 : le titre et le fil nomment le bon projet", (await page.locator("main.studio-page h1").textContent()).includes("P.STU.A") && (await page.locator(".studio-fil").textContent()).includes("P.STU.A"));
  check("NAV-008 : barre latérale visible, aucun mode immersif", (await page.locator(".app-sidebar").isVisible()) && !(await page.evaluate(() => document.body.classList.contains("atelier-immersive"))));

  // NAV-004 : actualisation, précédent / suivant.
  await page.reload();
  await page.locator(`[data-studio-projet="${pA.id}"]`).waitFor();
  check("NAV-004 : l'actualisation restitue le même projet", page.url() === `${BASE}/studio/projets/${pA.id}`);
  await page.goBack();
  await page.locator('[data-studio="accueil"]').waitFor();
  await page.goForward();
  await page.locator(`[data-studio-projet="${pA.id}"]`).waitFor();
  check("NAV-004 : précédent / suivant conservent le contexte", page.url() === `${BASE}/studio/projets/${pA.id}`);
  await page.goto(`${BASE}/studio/projets/${pA2.id}`);
  await page.locator(`[data-studio-projet="${pA2.id}"]`).waitFor();
  check("NAV-004 : ouverture directe par l'adresse", (await page.locator("main.studio-page h1").textContent()).includes("P.STU.B"));

  // NAV-004 : un lien interdit ne divulgue rien.
  await page.goto(`${BASE}/studio/projets/${pB.id}`);
  await page.locator("[data-studio-refus]").waitFor();
  const contenu = await page.locator("#workspace-content").textContent();
  check("NAV-004 : projet d'autrui refusé sans divulguer son code ni son nom", !contenu.includes("P.STU.SECRET") && !contenu.includes("confidentiel"));
  check("NAV-004 : refus sans redirection silencieuse", page.url() === `${BASE}/studio/projets/${pB.id}`);

  // Adresse inconnue : écran explicite, pas le repli vers /accueil.
  await page.goto(`${BASE}/studio/inconnu`);
  await page.locator("[data-studio-inconnue]").waitFor();
  check("adresse Studio inconnue : écran explicite, adresse conservée", page.url() === `${BASE}/studio/inconnu`);
  await page.screenshot({ path: join(OUT, "studio-inconnue.png") });

  // Études : création par l'interface, liste, doublon refusé, page de l'étude sans Parcours ni Atelier.
  await page.goto(`${BASE}/studio/projets/${pA.id}`);
  await page.locator("[data-studio-aucune-etude]").waitFor();
  await page.fill("#studio-etude-nom", "Implantation nord");
  await page.fill("#studio-etude-description", "Première hypothèse d'implantation");
  requetes.length = 0;
  await page.locator('[data-studio-creer-etude] button[type="submit"]').click();
  await page.waitForURL(new RegExp(`/studio/projets/${pA.id}/etudes/etu_`));
  await page.locator("[data-studio-etude]").waitFor();
  const urlEtude = page.url();
  check("études : la création ouvre la page de l'étude, nommée dans le titre et le fil", (await page.locator("main.studio-page h1").textContent()) === "Implantation nord" && (await page.locator(".studio-fil").textContent()).includes("Implantation nord"));
  check("études : aucune lecture du Parcours ni de l'Atelier", requetes.filter((p) => /\/steps|\/programme|\/atelier\//.test(p)).length === 0);
  await page.reload();
  await page.locator("[data-studio-etude]").waitFor();
  check("études : l'actualisation restitue l'étude", page.url() === urlEtude);
  await page.locator(".studio-fil a", { hasText: "P.STU.A" }).click();
  await page.locator("[data-studio-etudes] li").first().waitFor();
  check("études : le projet liste l'étude créée", (await page.locator("[data-studio-etudes]").textContent()).includes("Implantation nord"));
  await page.fill("#studio-etude-nom", "IMPLANTATION NORD");
  await page.locator('[data-studio-creer-etude] button[type="submit"]').click();
  await page.locator("[data-studio-creer-etude] [role=alert]").waitFor();
  check("études : un nom déjà pris (casse ignorée) est refusé avec un message", (await page.locator("[data-studio-creer-etude] [role=alert]").textContent()).includes("existe déjà") && (await a.api("get", `/projects/${pA.id}/studio/etudes`)).length === 1);
  const etudeId = urlEtude.split("/").pop();
  await page.goto(`${BASE}/studio/projets/${pA2.id}/etudes/${etudeId}`);
  await page.locator("[data-studio-refus]").waitFor();
  check("études : une étude ouverte sous un autre projet est refusée", !(await page.locator("#workspace-content").textContent()).includes("Implantation nord"));
  await b.page.goto(`${BASE}${new URL(urlEtude).pathname}`);
  await b.page.locator("[data-studio-refus]").waitFor();
  check("études : l'étude d'autrui ne se divulgue pas", !(await b.page.locator("#workspace-content").textContent()).includes("Implantation nord"));
  const emailB = await b.page.evaluate(async () => (await (await fetch("/auth/me", { credentials: "include" })).json()).email);
  await a.api("post", `/projects/${pA.id}/members`, { email: emailB, role: "lecteur" });
  await b.page.goto(`${BASE}/studio/projets/${pA.id}`);
  await b.page.locator("[data-studio-etudes]").waitFor();
  check("études : un lecteur voit les études sans formulaire de création", (await b.page.locator("[data-studio-lecture-seule]").isVisible()) && (await b.page.locator("[data-studio-creer-etude]").count()) === 0);

  // Variantes : création, domaines et planche dans l'adresse, historique, refus, aucune géométrie créée.
  await page.goto(urlEtude);
  await page.locator("[data-studio-aucune-variante]").waitFor();
  await page.fill("#studio-variante-nom", "Variante nord");
  requetes.length = 0;
  await page.locator('[data-studio-creer-variante] button[type="submit"]').click();
  await page.waitForURL(/\/variantes\/var_[^?]+\?domaine=dessin$/);
  await page.locator('[data-studio-domaine-actif="dessin"]').waitFor();
  const urlVariante = page.url();
  check("variantes : la création ouvre la variante sur le dessin, sans planche imposée", (await page.locator("main.studio-page h1").textContent()) === "Variante nord" && (await page.locator("[data-studio-planche-aucune]").isVisible()) && (await page.locator(".studio-fil").textContent()).includes("Implantation nord"));
  await page.locator('[data-studio-planche="3d"]').click();
  await page.waitForURL(/domaine=dessin&planche=3d$/);
  await page.locator('[data-studio-planche-active="3d"]').waitFor();
  await page.locator('[data-studio-domaine="bim"]').click();
  await page.waitForURL(/domaine=bim$/);
  await page.locator('[data-studio-domaine-actif="bim"]').waitFor();
  check("variantes : chaque domaine a son adresse, la planche ne suit pas hors du dessin", !page.url().includes("planche"));
  await page.locator('[data-studio-domaine="dessin"]').click();
  await page.waitForURL(/domaine=dessin$/);
  await page.goBack();
  await page.locator('[data-studio-domaine-actif="bim"]').waitFor();
  await page.goBack();
  await page.locator('[data-studio-planche-active="3d"]').waitFor();
  check("variantes : précédent restitue domaine et planche", page.url().endsWith("domaine=dessin&planche=3d"));
  await page.reload();
  await page.locator('[data-studio-planche-active="3d"]').waitFor();
  check("variantes : l'actualisation restitue la planche choisie", true);
  const interditesVar = requetes.filter((p) => !p.startsWith("/assets/") && /\/steps|\/programme|\/atelier|\/planche/.test(p));
  check("variantes : aucune lecture ni écriture du Parcours, de l'Atelier ou de la Planche", interditesVar.length === 0, interditesVar.join(" "));
  await page.goto(`${urlVariante.split("?")[0]}?domaine=bim&planche=2d`);
  await page.locator("[data-studio-inconnue]").waitFor();
  check("variantes : planche hors du dessin → adresse non reconnue, conservée", page.url().endsWith("domaine=bim&planche=2d"));
  await page.goto(`${urlVariante.split("?")[0]}?domaine=rendu`);
  await page.locator("[data-studio-inconnue]").waitFor();
  check("variantes : domaine inconnu → adresse non reconnue", true);
  await page.goto(urlEtude);
  await page.locator("[data-studio-variantes] li").first().waitFor();
  await page.fill("#studio-variante-nom", "VARIANTE NORD");
  await page.locator('[data-studio-creer-variante] button[type="submit"]').click();
  await page.locator("[data-studio-creer-variante] [role=alert]").waitFor();
  check("variantes : un nom déjà pris dans l'étude est refusé avec un message", (await page.locator("[data-studio-creer-variante] [role=alert]").textContent()).includes("existe déjà"));
  await b.page.goto(urlEtude);
  await b.page.locator("[data-studio-variantes]").waitFor();
  check("variantes : un lecteur voit les variantes sans formulaire de création", (await b.page.locator("[data-studio-creer-variante]").count()) === 0);
  await b.page.goto(urlVariante);
  await b.page.locator('[data-studio-domaine-actif="dessin"]').waitFor();
  check("variantes : un lecteur ouvre la variante", (await b.page.locator("main.studio-page h1").textContent()) === "Variante nord");
  await page.goto(`${BASE}/studio/projets/${pA2.id}/etudes/${etudeId}/variantes/${urlVariante.split("?")[0].split("/").pop()}`);
  await page.locator("[data-studio-refus]").waitFor();
  check("variantes : une variante ouverte sous un autre projet est refusée", !(await page.locator("#workspace-content").textContent()).includes("Variante nord"));

  // Planche 2D (lot A) : dessiner, coter, enregistrer en révision, fermer, rouvrir, révision passée, conflit, lecteur.
  const url2d = `${urlVariante.split("?")[0]}?domaine=dessin&planche=2d`;
  const revisionsApi = `/projects/${pA.id}/studio/etudes/${etudeId}/variantes/${urlVariante.split("?")[0].split("/").pop()}/revisions`;
  const etat2d = (p = page) => p.locator("[data-studio-2d-etat]").textContent();
  const valeurCote = (p = page) => p.locator('[data-type="cote"]').first().getAttribute("data-valeur");
  /** Clique un point de l'écran de la zone de dessin. */
  const cliquer = async (p, x, y) => {
    await p.locator("[data-studio-2d-svg]").scrollIntoViewIfNeeded();
    const boite = await p.locator("[data-studio-2d-svg]").boundingBox();
    await p.mouse.click(boite.x + x, boite.y + y);
  };
  const extremites = (p, sel, i = 0) => p.locator(sel).nth(i).evaluate((l) => ({ x1: +l.getAttribute("x1"), y1: +l.getAttribute("y1"), x2: +l.getAttribute("x2"), y2: +l.getAttribute("y2") }));
  const placer = async (x, y) => {
    await page.fill("#studio-2d-x", String(x));
    await page.fill("#studio-2d-y", String(y));
    await page.locator("[data-studio-2d-saisie] button[type=submit]").click();
  };
  requetes.length = 0;
  await page.goto(url2d);
  await page.locator("[data-studio-2d]").waitFor();
  check("Planche 2D : ouverture sans révision, rien n'est créé", (await etat2d()) === "Aucune révision enregistrée" && (await a.api("get", revisionsApi)).length === 0);
  await page.locator("body").press("l");
  check("Planche 2D : raccourci L choisit l'outil Ligne", (await page.locator('[data-studio-2d-entree="ligne"]').getAttribute("aria-pressed")) === "true");
  await placer(0, 0);
  await placer(4, 0);
  await page.locator("body").press("Escape");
  check("Planche 2D : ligne posée par saisie numérique (0 ; 0) → (4 ; 0)", (await page.locator('[data-type="ligne"]').count()) === 1);
  await page.locator('[data-studio-2d-entree="ligne"]').click();
  await cliquer(page, 120, 80);
  await cliquer(page, 240, 80);
  await page.locator("body").press("Escape");
  check("Planche 2D : ligne dessinée à la souris", (await page.locator('[data-type="ligne"]').count()) === 2);
  // Cote liée aux deux extrémités de la première ligne, par accrochage.
  await page.locator("body").press("Shift+C");
  const l1 = await extremites(page, '[data-type="ligne"]');
  await cliquer(page, l1.x1, l1.y1);
  await cliquer(page, l1.x2, l1.y2);
  await cliquer(page, (l1.x1 + l1.x2) / 2, l1.y1 - 30);
  check("Planche 2D : cote accrochée aux extrémités, valeur dérivée 4,000 m", (await valeurCote()) === "4.000");
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => document.querySelector("[data-studio-2d-etat]")?.textContent === "Enregistré — révision n° 1");
  check("Planche 2D : Ctrl+S enregistre la révision n° 1", (await a.api("get", revisionsApi)).length === 1);
  // Édition précise : l'extrémité B passe à 6,25 m, la cote liée suit ; annuler / rétablir.
  await page.locator("body").press(" ");
  const l1b = await extremites(page, '[data-type="ligne"]');
  await cliquer(page, (l1b.x1 + l1b.x2) / 2, l1b.y1);
  await page.locator('[data-studio-2d-inspecteur="ligne"]').waitFor();
  await page.fill("#studio-2d-champ-2", "6,25");
  await page.locator('[data-studio-2d-inspecteur="ligne"] button[type=submit]').click();
  check("Planche 2D : la cote associée suit la ligne modifiée (6,250 m)", (await valeurCote()) === "6.250" && (await etat2d()) === "Modifications non enregistrées");
  await page.locator("body").press("Control+z");
  check("Planche 2D : Ctrl+Z annule", (await valeurCote()) === "4.000");
  await page.locator("body").press("Control+y");
  check("Planche 2D : Ctrl+Y rétablit", (await valeurCote()) === "6.250");
  await page.locator('[data-studio-2d-entree="enregistrer"]').click();
  await page.waitForFunction(() => document.querySelector("[data-studio-2d-etat]")?.textContent === "Enregistré — révision n° 2");
  const interdites2d = requetes.filter((p) => !p.startsWith("/assets/") && /\/steps|\/programme|\/atelier/.test(p));
  check("Planche 2D : aucune lecture ni écriture de l'Atelier ou du Parcours", interdites2d.length === 0, interdites2d.join(" "));
  // Fermer puis rouvrir : même contenu, même révision.
  await page.goto(urlEtude);
  await page.locator("[data-studio-etude]").waitFor();
  await page.goto(url2d);
  await page.locator('[data-type="cote"]').waitFor();
  const rouvert = [await page.locator('[data-type="ligne"]').count(), await valeurCote(), await etat2d()];
  check("Planche 2D : rouvert, le dessin est restitué (2 lignes, cote 6,250 m, révision n° 2)", rouvert[0] === 2 && rouvert[1] === "6.250" && rouvert[2] === "Enregistré — révision n° 2", rouvert.join(" | "));
  await page.screenshot({ path: join(OUT, "studio-planche-2d.png") });
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves2d = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => v.id));
  check("accessibilité de la Planche 2D : aucune violation critique ou sérieuse", graves2d.length === 0, graves2d.join(", "));
  // Révision passée : lecture seule, contenu d'origine, adresse propre.
  await page.locator('[data-studio-2d-revisions] [data-revision="1"] a').click();
  await page.locator("[data-studio-2d-historique]").waitFor();
  check("Planche 2D : la révision n° 1 se relit telle quelle, en lecture seule", page.url().includes("revision=rev_") && (await valeurCote()) === "4.000" && (await page.locator('[data-studio-2d-entree="ligne"]').isDisabled()));
  await page.locator("[data-studio-2d-historique] a").click();
  await page.locator('[data-studio-2d-lecture="non"]').waitFor();
  // Conflit : un second onglet enregistre sur une base dépassée → refus, rien d'écrasé, rechargement explicite.
  const autre = await a.context.newPage();
  await autre.goto(url2d);
  await autre.locator('[data-type="cote"]').waitFor();
  await page.locator("body").press(" ");
  const l2 = await extremites(page, '[data-type="ligne"]', 1);
  await cliquer(page, (l2.x1 + l2.x2) / 2, l2.y1);
  await page.locator("body").press("Delete");
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => document.querySelector("[data-studio-2d-etat]")?.textContent === "Enregistré — révision n° 3");
  await autre.locator('[data-studio-2d-entree="ligne"]').click();
  await cliquer(autre, 100, 200);
  await cliquer(autre, 200, 260);
  await autre.locator('[data-studio-2d-entree="enregistrer"]').click();
  await autre.locator("[data-studio-2d-conflit]").waitFor();
  check("Planche 2D : base dépassée → conflit, aucune révision écrasée", (await a.api("get", revisionsApi)).length === 3);
  await autre.locator("[data-studio-2d-conflit] button").click();
  await autre.waitForFunction(() => document.querySelector("[data-studio-2d-etat]")?.textContent === "Enregistré — révision n° 3");
  check("Planche 2D : après conflit, la dernière révision est rechargée explicitement", (await autre.locator('[data-type="ligne"]').count()) === 1);
  await autre.close();
  // Supprimer la ligne cotée : la cote reste, à résoudre.
  const l3 = await extremites(page, '[data-type="ligne"]');
  await cliquer(page, (l3.x1 + l3.x2) / 2, l3.y1);
  await page.locator("body").press("Delete");
  check("Planche 2D : ligne cotée supprimée → cote conservée, à résoudre", (await page.locator("[data-studio-2d-a-resoudre]").count()) === 1 && (await page.locator('[data-type="cote"]').count()) === 1);
  await page.locator("body").press("Control+z");
  // Lecteur : consulte sans modifier.
  await b.page.goto(url2d);
  await b.page.locator("[data-studio-2d-lecteur]").waitFor();
  check("Planche 2D : un lecteur consulte sans pouvoir dessiner ni enregistrer", (await b.page.locator('[data-studio-2d-entree="ligne"]').isDisabled()) && (await b.page.locator('[data-studio-2d-entree="enregistrer"]').isDisabled()) && (await b.page.locator('[data-type="cote"]').count()) === 1);

  // Accessibilité de l'accueil Studio.
  await page.goto(`${BASE}/studio`);
  await page.locator("[data-studio-projets]").waitFor();
  await page.screenshot({ path: join(OUT, "studio-accueil.png") });
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => v.id));
  check("accessibilité de l'accueil Studio : aucune violation critique ou sérieuse", graves.length === 0, graves.join(", "));

  // NAV-001 mobile : la même entrée dans la barre adaptative.
  const mobile = await a.context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE}/accueil`);
  const entreeMobile = mobile.locator("#workspace-navigation a[data-nav-studio]");
  await entreeMobile.waitFor({ state: "visible" }).catch(() => {});
  check("NAV-001 mobile : entrée Studio présente et visible", await entreeMobile.isVisible());
  await entreeMobile.click();
  await mobile.waitForURL(`${BASE}/studio`);
  await mobile.screenshot({ path: join(OUT, "studio-mobile.png") });

  // NAV-009 : les parcours existants restent atteignables.
  await page.goto(`${BASE}/projets/${pA.id}?module=atelier`);
  await page.locator(".module-content").waitFor();
  check("NAV-009 : le module Atelier du projet reste accessible", page.url().includes("module=atelier"));

  check("aucune erreur JavaScript non interceptée", erreurs.length === 0, erreurs.join(" | "));
  console.log("Recette Studio : réussie.");
} finally {
  await browser.close();
}
