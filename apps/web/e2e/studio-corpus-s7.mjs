#!/usr/bin/env node
/**
 * Recette du corpus S7 (X.1-07, REF-02 §18.2 « session hors réseau puis reconnectée »), sur le modèle de
 * `studio-hors-ligne.mjs` : application construite servie par l'API (WEB_DIST, service worker actif), mode hors ligne de
 * Playwright (`context.setOffline`).
 * 1. pose par l'API du corpus de départ `packages/atelier-model/src/studio/corpus/fixtures/s7-100.json` (plan de niveau
 *    synthétique de 100 primitives, généré et contrôlé par `corpus.test.ts`) ; la tête est exactement ce document ;
 * 2. ouverture en ligne (variante lue sur l'appareil, service worker en place), puis coupure du réseau ;
 * 3. hors ligne : rectangle de 2 × 1 m dessiné au clavier, rechargement (corpus et brouillon servis depuis l'appareil),
 *    enregistrement hors ligne (enveloppe en attente), rien n'atteint le serveur ;
 * 4. reconnexion : une seule révision ajoutée, le corpus de départ intact (mêmes éléments, à l'octet), le rectangle
 *    présent ; métré des murs inchangé (oracle) ;
 * 5. écriture concurrente (X.1-07) : seconde coupure, un second rectangle dessiné hors ligne pendant qu'un autre appareil
 *    (même compte, en ligne) ajoute une ligne ; reconnexion : conflit, la révision de l'autre appareil n'est pas écrasée ;
 *    report puis enregistrement : deux révisions de plus, les deux ajouts présents, corpus de départ intact.
 * Géométrie synthétique, aucune donnée de projet réelle.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-corpus-s7 node apps/web/e2e/studio-corpus-s7.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-corpus-s7";
mkdirSync(OUT, { recursive: true });
const ICI = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(ICI, "../../../packages/atelier-model/src/studio/corpus/fixtures/s7-100.json"), "utf8"));
const erreurs = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}
const court = (x) => JSON.stringify(x)?.slice(0, 300);

/** Un bouton rangé dans un menu de la barre compacte : on ouvre d'abord ce menu, comme l'utilisateur. */
async function atteindre(barre, selecteur) {
  const el = barre.locator(selecteur).first();
  await el.waitFor({ state: "attached" });
  if (!(await el.isVisible())) {
    const menu = await el.evaluate((n) => n.closest("[data-studio-menu-liste]")?.id ?? null);
    if (menu) await barre.locator(`[aria-controls="${menu}"]`).click();
    await el.waitFor({ state: "visible" });
  }
  return el;
}

let context;
try {
  check("corpus S7 synthétique (fixture du corpus)", corpus.scene === "S7" && corpus.synthetique === true && corpus.commandes.length === 100 + (corpus.document.layers?.length ?? 0));
  check("couverture propre à la session hors réseau (le plan de niveau n'en est que l'état de départ)", corpus.couverture?.representes?.some((x) => /hors réseau/.test(x)) && corpus.couverture.absents?.every((x) => x.raison?.length > 0), JSON.stringify(corpus.couverture)?.slice(0, 200));
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-corpus-s7-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-corpus-s7-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.S7", name: "Corpus S7 (synthétique)" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude synthétique S7" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variantePath = `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`;
  const revisions = async () => (await api("get", `${variantePath}/revisions`)).revisions;

  // 1. Corpus de départ posé par l'API.
  const pose = await api("post", `${variantePath}/commands`, { contractVersion: "studio-commands/1", requestId: `s7-pose-${Date.now()}`, baseRevisionId: etude.revision.id, commands: corpus.commandes });
  // L'identifiant du document est celui que le serveur donne à la variante ; tout le reste est le corpus, à l'octet.
  const sansId = ({ id: _id, ...reste }) => JSON.stringify(reste);
  check("corpus de départ posé : la tête est exactement le document du corpus (hors identifiant du document)", sansId(pose.revision.document) === sansId(corpus.document));

  // 2. Ouverture en ligne, service worker en place.
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  const attendreEtat = (code) => page.locator(`[data-studio-hors-ligne="${code}"]`).waitFor({ timeout: 40000 });
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`);
  await outils.waitFor();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined, null, { timeout: 30000 });
  await page.reload();
  await outils.waitFor();
  await attendreEtat("en-ligne");
  const murs = page.locator('svg [role="button"][aria-label^="Mur "]');
  await murs.first().waitFor({ state: "attached" });
  const nbMurs = corpus.document.architecture.filter((a) => a.type === "wall").length;
  check("en ligne : le corpus est affiché (murs du plan synthétique)", (await murs.count()) === nbMurs, `${await murs.count()} / ${nbMurs}`);
  const depart = (await revisions()).length;

  // 3. Hors ligne : dessin, rechargement, enregistrement en attente.
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  const r = corpus.session.rectangle;
  await (await atteindre(outils, ':is(button,a)[aria-label="Rectangle"]')).click();
  for (const [nom, v] of [["X", r.origin.x], ["Y", r.origin.y], ["Largeur", r.width], ["Hauteur", r.height]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  await page.locator('[data-studio-conserve="oui"]').waitFor();
  await page.reload();
  await outils.waitFor();
  const rectangles = page.locator('svg [role="button"][aria-label^="Rectangle "]');
  await rectangles.first().waitFor({ state: "attached" });
  check("rechargement hors ligne : corpus et brouillon servis depuis l'appareil", (await rectangles.count()) === 1 && (await murs.count()) === nbMurs && (await page.locator("[data-studio-hors-ligne]").getAttribute("data-studio-hors-ligne")) === "hors-ligne");
  await (await atteindre(page.getByRole("toolbar", { name: "Actions de l’espace" }), ':is(button)[aria-label="Enregistrer"], :is(button)[aria-label="Réessayer la sauvegarde"]')).click();
  await page.locator('[data-studio-hors-ligne="en-attente"][data-studio-en-attente="1"]').waitFor();
  check("hors ligne : enveloppe en attente, rien n'a atteint le serveur", (await revisions()).length === depart);
  await page.screenshot({ path: join(OUT, "studio-corpus-s7-en-attente.png") });

  // 4. Reconnexion.
  await context.setOffline(false);
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor({ timeout: 40000 });
  await attendreEtat("en-ligne");
  check(`reconnexion : ${corpus.session.revisionsAjoutees} révision ajoutée`, (await revisions()).length === depart + corpus.session.revisionsAjoutees);
  const tete = (await api("get", variantePath)).revision.document;
  const ajoutes = tete.objects.filter((o) => !corpus.document.objects.some((x) => x.id === o.id));
  check("reconnexion : le rectangle dessiné hors ligne est dans la tête (2 × 1 m en (-10 ; -10))", ajoutes.length === 1 && ajoutes[0].type === "rectangle"
    && ajoutes[0].origin.x === r.origin.x && ajoutes[0].origin.y === r.origin.y && ajoutes[0].width === r.width && ajoutes[0].height === r.height, court(ajoutes));
  const sansAjout = { ...tete, objects: tete.objects.filter((o) => o.id !== ajoutes[0].id) };
  const memes = (cle) => JSON.stringify(sansAjout[cle] ?? null) === JSON.stringify(corpus.document[cle] ?? null);
  check("reconnexion : corpus de départ intact (objets, cotes, annotations, architecture, calques)", ["objects", "dimensions", "annotations", "architecture", "layers"].every(memes));
  check("reconnexion : primitives = départ + 1", tete.objects.length + (tete.dimensions?.length ?? 0) + (tete.annotations?.length ?? 0) + (tete.architecture?.length ?? 0) === corpus.session.primitives);

  // 5. Écriture concurrente pendant une seconde coupure : un autre appareil du même compte reste en ligne.
  const c = corpus.session.concurrente;
  const autre = await browser.newContext({ storageState: await context.storageState() });
  const tete1 = await api("get", variantePath);
  const avant5 = (await revisions()).length;
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  await (await atteindre(outils, ':is(button,a)[aria-label="Rectangle"]')).click();
  for (const [nom, v] of [["X", c.rectangle.origin.x], ["Y", c.rectangle.origin.y], ["Largeur", c.rectangle.width], ["Hauteur", c.rectangle.height]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  await page.locator('[data-studio-conserve="oui"]').waitFor();
  await (await atteindre(page.getByRole("toolbar", { name: "Actions de l’espace" }), ':is(button)[aria-label="Enregistrer"], :is(button)[aria-label="Réessayer la sauvegarde"]')).click();
  await page.locator('[data-studio-hors-ligne="en-attente"]').waitFor();
  const r2 = await autre.request.post(`${BASE}${variantePath}/commands`, { data: { contractVersion: "studio-commands/1", requestId: `s7-autre-${Date.now()}`, baseRevisionId: tete1.revision.id, commands: [{ toolId: "studio.dessin.ligne", params: c.ligne }] } });
  check("écriture concurrente : l'autre appareil enregistre sa ligne pendant la coupure", r2.ok(), String(r2.status()));
  const teteAutre = await r2.json();
  await context.setOffline(false);
  await attendreEtat("conflit");
  check("écriture concurrente : reconnexion en conflit, la révision de l'autre appareil n'est pas écrasée", (await api("get", variantePath)).revision.id === teteAutre.revision.id && (await revisions()).length === avant5 + 1);
  await page.locator("[data-studio-reporter]").click();
  await page.locator(".studio-info").filter({ hasText: "reportée(s) sur la nouvelle version courante" }).waitFor();
  await (await atteindre(page.getByRole("toolbar", { name: "Actions de l’espace" }), ':is(button)[aria-label="Enregistrer"], :is(button)[aria-label="Réessayer la sauvegarde"]')).click();
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor({ timeout: 40000 });
  const tete5 = (await api("get", variantePath));
  const d5 = tete5.revision.document;
  const rect2 = d5.objects.filter((o) => o.type === "rectangle" && o.origin.x === c.rectangle.origin.x && o.origin.y === c.rectangle.origin.y && o.width === c.rectangle.width && o.height === c.rectangle.height);
  check(`écriture concurrente : report enregistré sur la tête de l'autre appareil, ${c.revisionsAjoutees} révisions de plus, ligne et rectangle présents`,
    tete5.revision.parentRevisionId === teteAutre.revision.id && (await revisions()).length === avant5 + c.revisionsAjoutees && rect2.length === 1
    && d5.objects.some((o) => o.id === c.ligne.id && JSON.stringify(o.start) === JSON.stringify(c.ligne.start) && JSON.stringify(o.end) === JSON.stringify(c.ligne.end)), court(d5.objects.slice(-3)));
  const sans5 = { ...d5, objects: d5.objects.filter((o) => corpus.document.objects.some((x) => x.id === o.id)) };
  check("écriture concurrente : corpus de départ toujours intact, primitives = départ + 3", ["objects", "dimensions", "annotations", "architecture", "layers"].every((k) => JSON.stringify(sans5[k] ?? null) === JSON.stringify(corpus.document[k] ?? null))
    && d5.objects.length + (d5.dimensions?.length ?? 0) + (d5.annotations?.length ?? 0) + (d5.architecture?.length ?? 0) === c.primitives);
  await autre.close();
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  console.log("\nRecette du corpus S7 : conforme.");
} finally {
  await context?.close();
  await browser.close();
}
