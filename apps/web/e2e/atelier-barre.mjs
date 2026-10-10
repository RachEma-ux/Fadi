/**
 * Recette de la barre de l'Atelier (D-195, lots A et B) dans un vrai navigateur :
 * - rangée du haut : Fichier · Plan · 3D · Documents · Planche · ⚙ · état d'enregistrement ; le sélecteur de niveau
 *   indépendant, Exporter, Importer, Annuler / Rétablir, Cadrer, Rechercher un outil et Harmonie ont quitté la rangée ;
 * - Plan à deux fonctions : un clic active le mode ET ouvre la liste des niveaux (clavier compris) ;
 * - Fichier porte Exporter / Importer en sous-menus ; ⚙ porte affichage, accrochages, Canevas et la barre d'actions ;
 * - barre d'actions flottante : Annuler, Rétablir, Cadrer (Plan et 3D ; rien de plus en Documents), déplaçable par sa
 *   poignée à la souris et au clavier, toujours entière dans l'écran (relâchement, redimensionnement, rotation),
 *   position mémorisée sur l'appareil, remise en place et masquage depuis ⚙, sans redimensionner le dessin ;
 * - Planche : la barre porte Annuler / Rétablir du brouillon et Détacher, et suit la Planche dans la fenêtre séparée
 *   (simulée par un cadre de même origine, comme `planche-detachee-documents.mjs`) ;
 * - téléphone (390 × 844, rotation 844 × 390) ; axe-core sur l'Atelier (ordinateur et téléphone).
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-barre.mjs
 */
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { allerEnPlan, basculerCanevas, fermerMenus, ouvrirFichier, ouvrirReglages } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const MARGE = 4;
const LARGEUR = 1440;
const HAUTEUR = 900;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const page = await ctx.newPage();
const erreursPage = [];
page.on("pageerror", (e) => erreursPage.push(e.message));
page.on("dialog", (d) => void d.accept());
// Fenêtre séparée simulée (Document Picture-in-Picture) : un cadre de même origine rendu comme une `Window`.
const simulerFenetre = (p) =>
  p.addInitScript(() => {
    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: {
        requestWindow: async ({ width, height }) => {
          const f = document.createElement("iframe");
          f.setAttribute("data-fenetre-detachee", "");
          f.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:2px solid #333;z-index:99999;background:#fff`;
          document.body.appendChild(f);
          f.contentWindow.close = () => {
            f.contentWindow.dispatchEvent(new Event("pagehide"));
            f.remove();
          };
          return f.contentWindow;
        },
      },
    });
  });
await simulerFenetre(page);

const api = async (methode, chemin, data) => {
  const r = await page.request[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const boite = (sel, p = page) => p.locator(sel).first().boundingBox();
const dansZone = (b, zone) => !!b && b.x >= zone.x - 0.5 && b.y >= zone.y - 0.5 && b.x + b.width <= zone.x + zone.width + 0.5 && b.y + b.height <= zone.y + zone.height + 0.5;
const dansEcran = (b, largeur, hauteur) => dansZone(b, { x: 0, y: 0, width: largeur, height: hauteur });
const fmt = (b) => (b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}` : "absent");
const barre = (p = page) => boite("[data-barre-actions]", p);
/** Glisser la poignée de `dx`, `dy` pixels (pointeur capturé : le mouvement peut dépasser la barre). */
const glisser = async (dx, dy, p = page) => {
  const h = await boite("[data-barre-actions-poignee]", p);
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await p.mouse.move(x + dx, y + dy, { steps: 4 });
  await p.mouse.up();
  await p.waitForTimeout(120);
};
async function axe(nom, p = page) {
  await p.addScriptTag({ path: AXE_SCRIPT });
  const r = await p.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector(".atelier-n") ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  });
  check(`axe ${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `barre-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "barre-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · barre" })).body.id;
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });

// 1. Rangée du haut (lot A).
const rangee = await page.locator(".atelier-n-barre > *").evaluateAll((els) =>
  els
    .filter((e) => getComputedStyle(e).display !== "none")
    .map((e) => (e.hasAttribute("data-menu-principal") ? "Fichier" : e.classList.contains("barre-mode") ? "modes" : e.hasAttribute("data-reglages") ? "⚙" : e.classList.contains("barre-sync") ? "état" : `${e.tagName.toLowerCase()}.${e.className}`)),
);
check("rangée : Fichier · modes · ⚙ · état d'enregistrement, rien d'autre", rangee.join(" · ") === "Fichier · modes · ⚙ · état", rangee.join(" · "));
// Nom des boutons de mode : texte propre, hors chevron décoratif (span aria-hidden du bouton Plan).
const modes = await page.locator(".barre-mode button[aria-pressed]").evaluateAll((els) => els.map((e) => Array.from(e.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim()));
check("modes : Plan · 3D · Documents · Planche", modes.join(" · ") === "Plan · 3D · Documents · Planche", modes.join(" · "));
check("le sélecteur de niveau indépendant a disparu", (await page.locator(".barre-niveau").count()) === 0);
const textesRangee = await page.locator(".atelier-n-barre button:visible, .atelier-n-barre summary:visible").evaluateAll((els) => els.map((e) => e.textContent.trim()));
check("Exporter, Importer, Annuler, Rétablir, Cadrer, Rechercher et Harmonie ont quitté la rangée", !textesRangee.some((t) => /Exporter|Importer|Annuler|Rétablir|Cadrer|Rechercher|Harmonie/.test(t)), textesRangee.join(" | "));
check("Rechercher un outil : la loupe est au rail d'outils (Ctrl K inchangé)", (await page.locator(".atelier-n-outils [data-palette-bouton], .canevas-colonne [data-palette-bouton]").count()) >= 1 && (await page.locator(".atelier-n-barre [data-palette-bouton]").count()) === 0);
await page.keyboard.press("Control+k");
check("Ctrl K ouvre la palette", (await page.locator(".palette-fond").count()) === 1);
await page.keyboard.press("Escape");

// Plan à deux fonctions.
const plan = page.locator('.barre-mode button:text-is("Plan")');
check("Plan : la liste des niveaux est fermée au repos", (await page.locator("[data-plan-niveaux]").count()) === 0 && (await plan.getAttribute("aria-expanded")) === "false");
await plan.click();
const niveaux = await page.locator("[data-plan-niveau]").evaluateAll((els) => els.map((e) => e.getAttribute("data-plan-niveau")));
const cocheAvant = await page.locator('[data-plan-niveaux] [aria-checked="true"]').getAttribute("data-plan-niveau");
check("Plan : un clic ouvre la liste (au moins deux niveaux), le niveau courant est coché", (await page.locator("[data-plan-niveaux]").isVisible()) && niveaux.length >= 2 && (await plan.getAttribute("aria-expanded")) === "true" && !!cocheAvant, `${niveaux.length} niveaux · ${cocheAvant ?? ""}`);
await page.keyboard.press("Escape");
check("Échap referme la liste sans changer de niveau", !(await page.locator("[data-plan-niveaux]").isVisible()) && (await plan.getAttribute("aria-expanded")) === "false" && (await page.locator(".atelier-n .plan2d").count()) === 1);
const autre = niveaux.find((n) => n !== cocheAvant);
await plan.click();
await page.locator(`[data-plan-niveau="${autre}"]`).click();
await page.waitForTimeout(300);
await plan.click();
const cocheApres = await page.locator('[data-plan-niveaux] [aria-checked="true"]').getAttribute("data-plan-niveau");
await page.keyboard.press("Escape");
check("choisir un niveau l'affiche et referme la liste", cocheApres === autre && !(await page.locator("[data-plan-niveaux]").isVisible()), `${cocheAvant} → ${cocheApres}`);
await page.locator('.barre-mode button:text-is("3D")').click();
await page.waitForTimeout(300);
await plan.click();
check("depuis 3D : un clic sur Plan active le mode Plan ET ouvre la liste", (await plan.getAttribute("aria-pressed")) === "true" && (await page.locator("[data-plan-niveaux]").isVisible()));
await page.keyboard.press("Escape");
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await plan.focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
const focusListe = await page.evaluate(() => document.activeElement?.getAttribute("role") === "menuitemradio" && document.activeElement.getAttribute("aria-checked") === "true");
await page.keyboard.press("ArrowDown");
const focusSuivant = await page.evaluate(() => document.activeElement?.getAttribute("data-plan-niveau"));
await page.keyboard.press("Escape");
const focusRetour = await page.evaluate(() => document.activeElement?.hasAttribute("data-bouton-plan") === true);
check("clavier : Entrée ouvre la liste sur le niveau coché, flèche bas passe au suivant, Échap rend le focus à Plan", focusListe && !!focusSuivant && focusSuivant !== autre && focusRetour, `${focusListe} / ${focusSuivant} / ${focusRetour}`);

// Fichier et ⚙.
await ouvrirFichier(page);
const entrees = await page.locator("[data-menu-principal] [data-menu]").evaluateAll((els) => els.map((e) => e.getAttribute("data-menu")));
check("Fichier : enregistrer, exporter, importer, imprimer, partager, projets (Exporter / Importer en sous-menus)", entrees.join(",") === "enregistrer,exporter,importer,imprimer,partager,projets", entrees.join(","));
await page.locator(".barre-exports > summary").click();
check("Exporter : le sous-menu s'ouvre dans Fichier avec ses formats", (await page.locator(".barre-exports[open]").count()) === 1 && (await page.locator(".barre-exports [data-export]").count()) >= 3, `${await page.locator(".barre-exports [data-export]").count()} exports`);
await page.locator(".barre-imports > summary").click();
// L'accordéon se referme au basculement (événement différé) : laisser Exporter se replier avant de vérifier.
await page.waitForFunction(() => document.querySelectorAll(".barre-exports[open]").length === 0, null, { timeout: 2000 }).catch(() => {});
check("Importer : le sous-menu s'ouvre avec ses formats et referme Exporter (accordéon, après le clic)", (await page.locator(".barre-imports[open]").count()) === 1 && (await page.locator(".barre-imports [data-import]").count()) >= 2 && (await page.locator(".barre-exports[open]").count()) === 0, `imports ${await page.locator(".barre-imports[open]").count()} · exports ${await page.locator(".barre-exports[open]").count()}`);
await page.mouse.click(LARGEUR / 2, HAUTEUR - 10);
await page.waitForTimeout(150); // les sous-menus se replient au basculement (événement différé)
check("un clic ailleurs referme Fichier et ses sous-menus", (await page.locator(".atelier-n-barre details[open]").count()) === 0);
await ouvrirReglages(page);
const sections = await page.locator("[data-reglages] .reglages-section h3").evaluateAll((els) => els.map((e) => e.textContent.trim()));
check("⚙ : Outils affichés, Accrochages, Disposition, Barre d'actions", sections.join(" · ") === "Outils affichés · Accrochages · Disposition · Barre d'actions", sections.join(" · "));
check("⚙ : neuf accrochages, pas polaire, pas de grille, niveau d'affichage", (await page.locator("[data-reglages] [data-accrochage]").count()) === 9 && (await page.locator("[data-reglages] [data-pas-polaire]").count()) === 1 && (await page.locator('[data-reglages] select[aria-label="Niveau d\'affichage des outils"]').count()) === 1);
await fermerMenus(page);
await basculerCanevas(page);
const canevas = (await page.locator(".atelier-n").getAttribute("class")).includes("disposition-canevas");
await basculerCanevas(page);
check("⚙ : Canevas bascule la disposition et revient", canevas && !(await page.locator(".atelier-n").getAttribute("class")).includes("disposition-canevas"));

// 2. Barre d'actions flottante (lot B), ordinateur.
const travail = await boite(".atelier-n-travail");
let b = await barre();
check("barre d'actions : affichée, en position par défaut, dans l'écran", !!b && (await page.locator("[data-barre-actions]").getAttribute("data-position")) === "defaut" && dansEcran(b, LARGEUR, HAUTEUR), fmt(b));
check("par défaut : coin bas droit de la zone de dessin, au-dessus de la barre d'état", dansZone(b, travail) && b.x > travail.x + travail.width / 2 && b.y > travail.y + travail.height / 2, `${fmt(b)} dans ${fmt(travail)}`);
const actions = await page.locator("[data-barre-actions] [data-action]").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
check("Plan : Annuler, Rétablir, Cadrer", actions.join(",") === "annuler,retablir,cadrer", actions.join(","));
check("la barre a un rôle toolbar, un groupe « Annuler et rétablir » et une poignée nommée", (await page.locator('[data-barre-actions][role="toolbar"]').count()) === 1 && (await page.locator('[data-barre-actions] [role="group"][aria-label="Annuler et rétablir"]').count()) === 1 && !!(await page.locator("[data-barre-actions-poignee]").getAttribute("aria-label")));
// Cadrer : le niveau revient à son cadrage (même échelle qu'avec la touche 0).
const echelle = () => page.locator(".etat-echelle").textContent();
await page.locator(".plan2d").click({ position: { x: 5, y: 5 } }).catch(() => {});
await page.keyboard.press("Escape");
await page.keyboard.press("0");
await page.waitForTimeout(200);
const echelleCadree = await echelle();
await page.mouse.move(travail.x + travail.width / 2, travail.y + travail.height / 2);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(200);
const echelleZoomee = await echelle();
await page.locator('[data-barre-actions] [data-action="cadrer"]').click();
await page.waitForTimeout(200);
check("Cadrer : revient au cadrage du niveau (même échelle que la touche 0)", echelleZoomee !== echelleCadree && (await echelle()) === echelleCadree, `${echelleCadree} → ${echelleZoomee} → ${await echelle()}`);
// Annuler / Rétablir : suppression d'un mur annulée puis rétablie.
const compteObjets = () => page.locator(".plan2d .plan-objets [data-objet]").count();
const nAvant = await compteObjets();
// Un objet supprimable du niveau : les étiquettes de l'exemple sont sur un calque verrouillé (refus nominatif), on
// essaie donc murs, poteaux, portes, dalles jusqu'à ce qu'une suppression aboutisse.
const selection = () => page.locator(".etat-selection").textContent().catch(() => "");
let selectionne = "";
let nSupprime = nAvant;
for (const classe of ["obj-mur", "obj-poteau", "obj-porte", "obj-dalle", "obj-solide"]) {
  const cible = page.locator(`.plan2d .plan-objets .${classe}[data-objet]`);
  for (let i = 0; i < Math.min(3, await cible.count()) && nSupprime === nAvant; i++) {
    await cible.nth(i).click({ force: true });
    await page.waitForTimeout(150);
    selectionne = (await selection()) ?? "";
    // Le focus est resté sur un bouton de la barre : les touches du dessin ne s'adressent pas aux boutons.
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press("Delete");
    await page.waitForFunction((n) => document.querySelectorAll(".plan2d .plan-objets [data-objet]").length < n, nAvant, { timeout: 3000 }).catch(() => {});
    nSupprime = await compteObjets();
  }
  if (nSupprime < nAvant) break;
}
await page.locator('[data-barre-actions] [data-action="annuler"]').click();
await page.waitForFunction((n) => document.querySelectorAll(".plan2d .plan-objets [data-objet]").length === n, nAvant, { timeout: 10000 }).catch(() => {});
const nAnnule = await compteObjets();
await page.locator('[data-barre-actions] [data-action="retablir"]').click();
await page.waitForFunction((n) => document.querySelectorAll(".plan2d .plan-objets [data-objet]").length === n, nSupprime, { timeout: 10000 }).catch(() => {});
const nRetabli = await compteObjets();
await page.locator('[data-barre-actions] [data-action="annuler"]').click();
await page.waitForFunction((n) => document.querySelectorAll(".plan2d .plan-objets [data-objet]").length === n, nAvant, { timeout: 10000 }).catch(() => {});
check("Annuler / Rétablir agissent sur le journal de l'Atelier (suppression annulée, rétablie, annulée)", nSupprime < nAvant && nAnnule === nAvant && nRetabli === nSupprime && (await compteObjets()) === nAvant, `${selectionne.slice(0, 40)} · ${nAvant} → ${nSupprime} → ${nAnnule} → ${nRetabli} → ${await compteObjets()}`);
// Déplacement à la souris, mémoire, bornage.
const b0 = await barre();
await glisser(-300, -200);
b = await barre();
check("glisser la poignée déplace la barre (position mémorisée)", Math.abs(b.x - (b0.x - 300)) <= 2 && Math.abs(b.y - (b0.y - 200)) <= 2 && (await page.locator("[data-barre-actions]").getAttribute("data-position")) === "memorisee", `${fmt(b0)} → ${fmt(b)}`);
const travailApres = await boite(".atelier-n-travail");
check("la barre flotte au-dessus du dessin sans le redimensionner", fmt(travailApres) === fmt(travail), `${fmt(travail)} / ${fmt(travailApres)}`);
await glisser(-b.x - 200, -b.y - 200);
b = await barre();
check("glisser hors de l'écran en haut à gauche : la barre est ramenée au bord (marge)", Math.abs(b.x - MARGE) <= 1 && Math.abs(b.y - MARGE) <= 1 && dansEcran(b, LARGEUR, HAUTEUR), fmt(b));
await glisser(LARGEUR + 300, HAUTEUR + 300);
b = await barre();
check("glisser hors de l'écran en bas à droite : la barre reste entière dans l'écran", Math.abs(b.x + b.width - (LARGEUR - MARGE)) <= 1 && Math.abs(b.y + b.height - (HAUTEUR - MARGE)) <= 1, fmt(b));
// Clavier.
await page.locator("[data-barre-actions-poignee]").focus();
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(80);
const bGauche = await barre();
await page.keyboard.press("Shift+ArrowUp");
await page.waitForTimeout(80);
const bHaut = await barre();
check("clavier : flèche gauche déplace de 16 px, Maj + flèche haut de 64 px", Math.abs(b.x - 16 - bGauche.x) <= 1 && Math.abs(bGauche.y - 64 - bHaut.y) <= 1, `${fmt(b)} → ${fmt(bGauche)} → ${fmt(bHaut)}`);
await glisser(-400, -300);
b = await barre();
// Mémoire sur l'appareil : la position revient après rechargement.
await page.reload();
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForSelector("[data-barre-actions]", { timeout: 10000 });
const bRecharge = await barre();
check("la position est mémorisée sur l'appareil (rechargement)", Math.abs(bRecharge.x - b.x) <= 1 && Math.abs(bRecharge.y - b.y) <= 1 && (await page.locator("[data-barre-actions]").getAttribute("data-position")) === "memorisee", `${fmt(b)} / ${fmt(bRecharge)}`);
// Redimensionnement : une barre sortie de l'écran est ramenée.
await glisser(LARGEUR, HAUTEUR);
await page.setViewportSize({ width: 640, height: 420 });
await page.waitForTimeout(250);
b = await barre();
check("redimensionnement : la barre reste entière dans la fenêtre réduite", dansEcran(b, 640, 420), fmt(b));
await page.setViewportSize({ width: LARGEUR, height: HAUTEUR });
await page.waitForTimeout(250);
// ⚙ : remise en place, masquage.
await ouvrirReglages(page);
check("⚙ : le bouton de remise en place est actif quand la barre a été déplacée", !(await page.locator("[data-barre-actions-defaut]").isDisabled()));
await page.locator("[data-barre-actions-defaut]").click();
await page.waitForTimeout(150);
b = await barre();
check("⚙ : remise à la position par défaut (coin bas droit du dessin), bouton inactif ensuite", (await page.locator("[data-barre-actions]").getAttribute("data-position")) === "defaut" && Math.abs(b.x - b0.x) <= 2 && Math.abs(b.y - b0.y) <= 2 && (await page.locator("[data-barre-actions-defaut]").isDisabled()), `${fmt(b)} / ${fmt(b0)}`);
await page.locator("[data-barre-actions-visible]").uncheck();
await page.waitForTimeout(100);
check("⚙ : masquer la barre la retire sans toucher au dessin", (await page.locator("[data-barre-actions]").count()) === 0 && fmt(await boite(".atelier-n-travail")) === fmt(travail));
await fermerMenus(page);
await page.reload();
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForTimeout(300);
check("le masquage est mémorisé (rechargement)", (await page.locator("[data-barre-actions]").count()) === 0);
await ouvrirReglages(page);
await page.locator("[data-barre-actions-visible]").check();
await fermerMenus(page);
await page.waitForSelector("[data-barre-actions]", { timeout: 5000 });
check("⚙ : afficher la barre la ramène", (await page.locator("[data-barre-actions]").count()) === 1);
await page.screenshot({ path: `${OUT}/barre-actions-plan.png` });
await axe("Plan avec barre d'actions");
// 3D et Documents.
await page.locator('.barre-mode button:text-is("3D")').click();
await page.waitForTimeout(600);
check("3D : la barre porte Annuler, Rétablir et Cadrer (la vue 3D)", (await page.locator("[data-barre-actions] [data-action]").count()) === 3 && ((await page.locator('[data-barre-actions] [data-action="cadrer"]').getAttribute("title")) ?? "").includes("3D"));
await page.locator('.barre-mode button:text-is("Documents")').click();
await page.waitForSelector(".atelier-docs", { timeout: 30000 });
check("Documents : la barre garde Annuler / Rétablir, sans Cadrer", (await page.locator("[data-barre-actions] [data-action]").count()) === 2 && (await page.locator('[data-barre-actions] [data-action="cadrer"]').count()) === 0 && dansEcran(await barre(), LARGEUR, HAUTEUR));
await ouvrirReglages(page);
check("Documents : ⚙ ne propose que la barre d'actions (ni affichage, ni accrochages, ni Canevas)", (await page.locator("#reglages-actions").isVisible()) && (await page.locator("#reglages-affichage, #reglages-accrochages, #reglages-disposition").count()) === 0);
await fermerMenus(page);
await allerEnPlan(page);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });

// 3. Planche : la barre porte Annuler / Rétablir du brouillon et Détacher ; elle suit la Planche détachée.
await page.locator("[data-mode-planche]").click();
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
await page.waitForTimeout(400);
const actionsPlanche = await page.locator("[data-planche] [data-barre-actions] [data-action]").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
check("Planche : une seule barre, dans la Planche : Annuler, Rétablir, Grouper, Créer un composant, Éclater, Détacher", (await page.locator("[data-barre-actions]").count()) === 1 && actionsPlanche.join(",") === "annuler,retablir,groupe,composant,eclater,detacher" && (await page.locator("[data-barre-actions] [data-planche-annuler]").count()) === 1 && (await page.locator("[data-barre-actions] [data-planche-detacher]").count()) === 1, actionsPlanche.join(","));
check("Planche : la barre du haut n'a plus ni Annuler / Rétablir ni Détacher", (await page.locator(".planche-haut [data-planche-annuler], .planche-haut [data-planche-detacher]").count()) === 0);
check("Planche : Annuler est inactif sans opération", await page.locator("[data-barre-actions] [data-planche-annuler]").isDisabled());
// Les flèches sur la poignée déplacent la barre sans atteindre le clavier de la Planche (outils comme Retourner).
await page.locator('[data-planche-outil="retourner"]').first().click().catch(() => {});
const consigneAvant = await page.locator("[data-planche-etat]").textContent().catch(() => "");
const bAvantFleche = await barre();
await page.locator("[data-barre-actions-poignee]").focus();
await page.keyboard.press("ArrowLeft");
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(120);
const bApresFleche = await barre();
check("Planche : les flèches sur la poignée déplacent la barre sans agir sur le dessin (Annuler toujours inactif, consigne inchangée)", Math.abs(bAvantFleche.x - 16 - bApresFleche.x) <= 1 && Math.abs(bAvantFleche.y - 16 - bApresFleche.y) <= 1 && (await page.locator("[data-barre-actions] [data-planche-annuler]").isDisabled()) && (await page.locator("[data-planche-etat]").textContent().catch(() => "")) === consigneAvant, `${fmt(bAvantFleche)} → ${fmt(bApresFleche)}`);
await page.keyboard.press("Escape");
await ouvrirReglages(page);
await page.locator("[data-barre-actions-defaut]").click();
await fermerMenus(page);
await page.waitForTimeout(150);
const bPlanche = await barre();
const pied = await boite("[data-planche-pied]");
const planche = await boite("[data-planche]");
check("Planche : la barre est dans la Planche, au-dessus de son pied", dansZone(bPlanche, planche) && (!pied || bPlanche.y + bPlanche.height <= pied.y + 1), `${fmt(bPlanche)} · pied ${fmt(pied)}`);
await page.locator("[data-barre-actions] [data-planche-detacher]").click();
await page.waitForSelector("[data-fenetre-detachee]", { timeout: 10000 });
const fenetre = page.frameLocator("[data-fenetre-detachee]");
await fenetre.locator("[data-barre-actions]").waitFor({ timeout: 10000 }).catch(() => {});
const bFenetre = await fenetre.locator("[data-barre-actions]").boundingBox();
check("détachée : la barre d'actions suit la Planche dans la fenêtre séparée, entière dans celle-ci", (await fenetre.locator("[data-barre-actions] [data-planche-detacher]").count()) === 1 && (await page.locator("[data-barre-actions]").count()) === 0 && dansEcran(bFenetre, 1040, 700), fmt(bFenetre));
await fenetre.locator("[data-barre-actions] [data-planche-detacher]").click();
await page.waitForSelector("[data-planche] [data-barre-actions]", { timeout: 10000 }).catch(() => {});
check("rattachée : la barre revient dans la page avec la Planche", (await page.locator("[data-fenetre-detachee]").count()) === 0 && (await page.locator("[data-planche] [data-barre-actions]").count()) === 1);
await page.screenshot({ path: `${OUT}/barre-actions-planche.png` });
await allerEnPlan(page);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
// Une position mémorisée loin en bas à droite, pour le téléphone qui suit.
await glisser(LARGEUR, HAUTEUR);

// 4. Téléphone : la barre reste entière dans l'écran (position mémorisée trop loin ramenée), rotation, cibles de 44 px.
const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
const p2 = await tel.newPage();
p2.on("pageerror", (e) => erreursPage.push(e.message));
await p2.goto(`${BASE}/projets/${pid}?module=atelier`);
await p2.waitForSelector("[data-barre-actions]", { timeout: 30000 });
await p2.waitForTimeout(800);
let bt = await barre(p2);
check("téléphone : la position mémorisée sur l'ordinateur est ramenée dans l'écran du téléphone", dansEcran(bt, 390, 844), fmt(bt));
const petites = await p2.locator("[data-barre-actions] button").evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || (!e.hasAttribute("data-barre-actions-poignee") && r.width < 44); }).length);
check("téléphone : cibles de la barre d'au moins 44 px", petites === 0, `${petites} trop petite(s)`);
await p2.setViewportSize({ width: 844, height: 390 });
await p2.waitForTimeout(400);
bt = await barre(p2);
check("rotation (844 × 390) : la barre reste entière dans l'écran", dansEcran(bt, 844, 390), fmt(bt));
await p2.setViewportSize({ width: 390, height: 844 });
await p2.waitForTimeout(400);
bt = await barre(p2);
check("retour en portrait : la barre reste entière dans l'écran", dansEcran(bt, 390, 844), fmt(bt));
await glisser(-200, -300, p2);
bt = await barre(p2);
check("téléphone : la poignée se glisse au pointeur et la barre reste dans l'écran", dansEcran(bt, 390, 844) && (await p2.locator("[data-barre-actions]").getAttribute("data-position")) === "memorisee", fmt(bt));
await p2.locator('[data-barre-actions] [data-action="cadrer"]').tap();
check("téléphone : Cadrer répond au doigt", true);
await p2.screenshot({ path: `${OUT}/barre-actions-telephone.png` });
await axe("téléphone, Plan avec barre d'actions", p2);
await tel.close();

check("aucune erreur de page", erreursPage.length === 0, erreursPage.join(" | "));
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Tout est vert.");
process.exit(echecs ? 1 : 0);
