/**
 * Recette du lot 8 (automatisation et assistant à boucle contrôlée) dans un vrai navigateur : proposition de
 * l'assistant (règles de Fadi, sans fournisseur) inspectable — hypothèses, essais, aperçu — qui n'écrit rien avant
 * l'accord ; accord → exécution ; intention non reconnue ; script « Trame de poteaux » essayé à blanc puis exécuté par
 * les mêmes commandes ; même refus qu'un geste quand le niveau est verrouillé par un autre compte ; téléphone ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-automatisation.mjs
 */
import { createRequire } from "node:module";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const mesures = [];
const mesurer = async (nom, fn) => {
  const t0 = Date.now();
  const r = await fn();
  const ms = Date.now() - t0;
  mesures.push([nom, ms]);
  console.log(`⏱ ${nom} : ${ms} ms`);
  return r;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const erreursPage = [];
page.on("pageerror", (e) => erreursPage.push(e.message));

async function axe(nom, selecteur) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const r = await page.evaluate(async (sel) => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector(sel) ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  }, selecteur);
  check(`axe ${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}
const api = async (methode, chemin, data, contexte = page.request) => {
  const r = await contexte[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const modele = async (pid) => (await api("get", `/projects/${pid}/atelier/model`)).body;
const message = async () => {
  await page.waitForSelector(".automatisation > .ver-info, .automatisation > .ver-erreur", { timeout: 60000 });
  return (await page.locator(".automatisation > .ver-info, .automatisation > .ver-erreur").first().textContent()) ?? "";
};

// Compte, exemple P.118, copie de travail.
const email = `auto-${Date.now()}@example.com`;
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "automatisation-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · automatisation" })).body.id;
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
await page.locator(".automatisation > summary").click();
await page.locator(".automatisation").scrollIntoViewIfNeeded();

// Un document produit et à jour (tableau des pièces) : l'aperçu doit annoncer qu'il sera à recalculer.
await page.request.get(`${BASE}/projects/${pid}/documents/atelier/tableaux/pieces.csv`);
// Assistant : proposition sans écriture, puis accord.
const rev0 = (await modele(pid)).revision;
await page.locator('.auto-suggestions button:has-text("Feuilles et quantités")').click();
await mesurer("proposition de l'assistant « feuilles et quantités » (règles, essai à blanc, aperçu)", async () => {
  await page.locator('.automatisation form:has(#auto-intention) button[type="submit"]').click();
  await page.waitForSelector('.auto-proposition[data-statut="proposee"]', { timeout: 60000 });
});
const texte = (await page.locator(".auto-proposition").textContent()) ?? "";
check("proposition : séquence inspectable, journal des hypothèses, essai valide, aperçu des créations", /Proposée — en attente de votre accord/.test(texte) && /Échelle des plans 1:100/.test(texte) && /Essai 1 : \d+ commande\(s\), valide/.test(texte) && /\d+ création\(s\)/.test(texte) && /Séquence de \d+ commande/.test(texte), texte.slice(0, 300));
check("rien n'est écrit avant l'accord (révision inchangée) ; aperçu : le tableau des pièces produit sera à recalculer", (await modele(pid)).revision === rev0 && /1 document\(s\) à recalculer/.test(texte), texte.match(/\d+ document\(s\) à recalculer/)?.[0] ?? "aucun document annoncé");
await axe("panneau d'automatisation", ".automatisation");
await page.locator(".auto-proposition").scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/8-assistant-proposition.png` });
await page.locator('.auto-proposition button:has-text("Accepter et exécuter")').click();
check("accord → exécution validée : une révision, six plans et leurs feuilles", /Proposition exécutée \(révision \d+\)/.test(await message()) && (await modele(pid)).revision === rev0 + 1 && Object.values((await modele(pid)).modele.definitions).filter((d) => d.classe === "vue").length === 6);
await page.locator('.auto-suggestions button:has-text("Annoter les réserves Harmonie")').click();
await page.locator('.automatisation form:has(#auto-intention) button[type="submit"]').click();
await page.waitForFunction(() => /réserve/i.test(document.querySelector(".auto-proposition")?.textContent ?? "") && document.querySelector(".auto-proposition")?.getAttribute("data-statut") === "proposee", null, { timeout: 60000 }).catch(() => {});
check("depuis Harmonie, sans fournisseur : les réserves du bilan proposées en annotations des objets concernés", (await page.locator(".auto-proposition").getAttribute("data-statut")) === "proposee" && /réserve/i.test(await page.locator(".auto-proposition").textContent()), ((await page.locator(".auto-proposition").textContent()) ?? "").slice(0, 160));
await page.locator("#auto-intention").fill("fais un café");
await page.locator('.automatisation form:has(#auto-intention) button[type="submit"]').click();
await page.waitForSelector('.auto-proposition[data-statut="incomprise"]', { timeout: 30000 });
check("intention non reconnue : dite, avec des exemples ; rien à accepter", (await page.locator('.auto-proposition button:has-text("Accepter")').count()) === 0 && /Exemples/.test(await page.locator(".auto-proposition").textContent()));

// Script : essai à blanc puis exécution.
await page.locator('[data-script="choix"]').selectOption("trame-poteaux");
await page.locator('[data-parametre="niveauId"]').selectOption("rdc");
for (const [k, v] of Object.entries({ nx: "3", ny: "2", px: "5", py: "5", ox: "200", oy: "200", hauteur: "3,2" })) await page.locator(`[data-parametre="${k}"]`).fill(v);
check("exécuter n'est possible qu'après un essai avec ces paramètres", await page.locator('.auto-script button:has-text("Exécuter")').isDisabled());
await page.locator('.auto-script button:has-text("Essayer")').click();
await page.waitForSelector(".automatisation > .auto-apercu", { timeout: 30000 });
check("essai à blanc : 6 créations annoncées, séquence de 6 poteau.creer, révision inchangée", /6 création\(s\)/.test(await page.locator(".automatisation > .auto-apercu").textContent()) && (await page.locator(".automatisation > .auto-apercu .auto-sequence li").count()) === 6 && (await modele(pid)).revision === rev0 + 1);
await page.locator(".automatisation > .auto-apercu").scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/8-script-essai.png` });
await page.locator('.auto-script button:has-text("Exécuter")').click();
const apres = (await message()) ?? "";
const poteaux = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "poteau" && o.params.point.x >= 200);
check("script exécuté : 6 poteaux posés par les commandes ordinaires, hauteur saisie, noms de la trame", /Script « Trame de poteaux » exécuté/.test(apres) && poteaux.length === 6 && poteaux.every((o) => o.params.hauteur.value === 3.2) && poteaux.some((o) => o.params.nom === "Poteau 2-1"), apres);
const journal = (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees;
check("journal : « Assistant : … » puis « Script « Trame de poteaux » v1 »", journal.at(-2)?.label === "Assistant : Feuilles et quantités" && journal.at(-1)?.label === "Script « Trame de poteaux » v1");

// Même refus qu'un geste : niveau verrouillé par un autre compte.
const second = await browser.newContext();
await second.request.post(`${BASE}/auth/register`, { data: { email: `auto-autre-${Date.now()}@example.com`, password: "automatisation-456" } });
const emailAutre = (await (await second.request.get(`${BASE}/auth/me`)).json()).email;
await api("post", `/projects/${pid}/members`, { email: emailAutre, role: "editeur" });
check("le second compte verrouille le RDC", (await api("post", `/projects/${pid}/atelier/verrous`, { cles: ["niveau:rdc"], minutes: 5 }, second.request)).status === 201);
await page.locator('[data-parametre="ox"]').fill("260");
await page.locator('.auto-script button:has-text("Essayer")').click();
await page.waitForSelector(".automatisation > .auto-apercu", { timeout: 30000 });
await page.locator('.auto-script button:has-text("Exécuter")').click();
const refus = await message();
check("le script est refusé comme un geste : « Verrouillé par … » (423), rien d'écrit", /Verrouillé par/.test(refus) && Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "poteau" && o.params.point.x >= 260).length === 0, refus);

// Téléphone.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.locator(".atelier-n-onglets button").last().click();
await page.waitForTimeout(300);
check("390 px : automatisation accessible, sans défilement horizontal", (await page.locator(".automatisation").isVisible()) && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
await page.screenshot({ path: `${OUT}/8-automatisation-mobile.png` });

check("aucune erreur JavaScript", erreursPage.length === 0, erreursPage.join(" | "));
console.log(JSON.stringify({ mesures }));
await second.close();
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Recette automatisation : tout est vert");
process.exit(echecs ? 1 : 0);
