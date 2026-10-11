/**
 * Recette de la liste de débit de la Planche (lot L14, D-217), bureau 1536 px :
 * - cadre 4 × 3 posé par Profilés depuis arêtes (section saisie) ; panneau « Liste de débit » par Alt+Maj+T ;
 * - 2 lignes, total 14 m, angles 45 / 45, masse « non évaluée » ; masse volumique sans source → toujours non évaluée ;
 * - tri par colonne ; clic sur une ligne → exactement ses deux occurrences sélectionnées ;
 * - Renuméroter (Alt+Maj+N) → P1, P2 en un pas ; Étiquettes (Alt+Maj+E) → 4 textes ; Effacer (Alt+Maj+W) ;
 * - Exporter (Alt+Maj+X) → CSV « ; » avec BOM.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-debit.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-debit";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const CSV_ESSAI = "";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

async function preparer(contexte, avecCatalogue = true) {
  const page = await contexte.newPage();
  await ecarterBarreActions(page);
  const erreurs = [];
  const commandes = [];
  let enPlanche = false;
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("request", (r) => {
    if (enPlanche && r.method() === "POST" && /\/commands\b/.test(r.url())) commandes.push(r.url());
  });
  page.on("dialog", (d) => void d.accept());
  const api = async (methode, chemin, data) => {
    const r = await page.request[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `debit-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · débit" })).body.id;
  // Catalogue d'essai fabriqué pour la recette : la colonne `source` le dit — jamais un catalogue du produit.
  if (avecCatalogue) {
  const rev = (await api("get", `/projects/${pid}/atelier/model`)).body.revision;
  const imp = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `prof-${Date.now()}`, baseRevision: rev, contract: "atelier-commands/3", label: "Catalogue d'essai", commands: [{ type: "catalogue.importer", params: { id: "cat-essai", nom: "Profilés d'essai (recette)", ontologie: "structure", csv: CSV_ESSAI } }] });
  if (imp.status !== 200) console.log("  ↳ import refusé", JSON.stringify(imp.body).slice(0, 300));
  }
  await page.goto(`${BASE}/projets/${pid}?module=atelier`);
  await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  return {
    page,
    erreurs,
    commandes,
    async ouvrirPlanche(toucher = false) {
      const b = page.locator("[data-mode-planche]");
      await b.scrollIntoViewIfNeeded();
      if (toucher) await b.tap();
      else await b.click();
      await page.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
      await page.waitForFunction(() => !!window.fadiPlanche, null, { timeout: 30000 });
      enPlanche = true;
    },
  };
}

/** Aides liées à une page : projection, état du brouillon (aires 3D par Newell), gestes. */
function aides(page) {
  const ecran = async (q) => {
    const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
    const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
    return e && { x: b.x + e.x, y: b.y + e.y };
  };
  const etat = () =>
    page.evaluate(() => {
      const P = window.fadiPlanche;
      const m = P.modele();
      const c = m.racine;
      const pos = (id) => c.sommets[id].position;
      const aire = (f) => {
        const q = f.exterieur.map(pos);
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < q.length; i++) {
          const u = q[i];
          const v = q[(i + 1) % q.length];
          nx += (u.y - v.y) * (u.z + v.z);
          ny += (u.z - v.z) * (u.x + v.x);
          nz += (u.x - v.x) * (u.y + v.y);
        }
        let a = Math.hypot(nx, ny, nz) / 2;
        for (const t of f.trous) {
          const r = t.map(pos);
          let tx = 0, ty = 0, tz = 0;
          for (let i = 0; i < r.length; i++) {
            const u = r[i];
            const v = r[(i + 1) % r.length];
            tx += (u.y - v.y) * (u.z + v.z);
            ty += (u.z - v.z) * (u.x + v.x);
            tz += (u.x - v.x) * (u.y + v.y);
          }
          a -= Math.hypot(tx, ty, tz) / 2;
        }
        return Math.round(a * 1e6) / 1e6;
      };
      const faces = Object.values(c.faces);
      const sommets = Object.values(c.sommets).map((s) => s.position);
      return {
        faces: faces.length,
        aires: faces.map(aire),
        aretes: Object.keys(c.aretes).length,
        courbes: Object.keys(c.courbes).length,
        liens: Object.keys(m.annotations?.extrusions ?? {}).length,
        sommets,
        outil: P.outil(),
        etape: P.etatOutil()?.etape ?? null,
        pas: P.pas(),
      };
    });
  const survoler = async (q) => {
    const e = await ecran(q);
    await page.mouse.move(e.x, e.y, { steps: 4 });
    return e;
  };
  const cliquer = async (q) => {
    const e = await survoler(q);
    await page.mouse.click(e.x, e.y);
    await page.waitForTimeout(50);
  };
  const saisir = async (t) => {
    await page.keyboard.type(t);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  };
  const consigne = () => page.locator("[data-planche-etat]").first().textContent().then((t) => t ?? "");
  const contient = (s, x, y, z) => s.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6 && Math.abs(p.z - z) < 1e-6);
  /** Segment par l'outil Ligne : départ, direction, longueur tapée. */
  const segment = async (depart, vers, longueur) => {
    await page.locator("[data-planche-vue]").focus();
    await page.keyboard.press("l");
    await cliquer(depart);
    await survoler(vers);
    await saisir(longueur);
    await page.keyboard.press("Escape");
  };
  /** Annule jusqu'au brouillon vide, puis rend la main au dessin. */
  const vider = async () => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    for (let i = 0; i < 40 && (await etat()).pas > 0; i++) await page.locator("[data-planche-annuler]").click();
    await page.keyboard.press(" ");
    await page.locator("[data-planche-vue]").focus();
  };
  return { ecran, etat, survoler, cliquer, saisir, consigne, contient, segment, vider };
}

{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR", acceptDownloads: true });
  const s = await preparer(ctx, false);
  const { page } = s;
  const { etat, survoler, saisir, ecran } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  // Cadre 4 × 3 : quatre arêtes, Profilés depuis arêtes (100 × 50 mm saisis), onglets par défaut.
  await page.keyboard.press("l");
  await survoler({ x: 1, y: 1, z: 0 });
  for (const p of ["[0;0;0]", "[4;0;0]", "[4;3;0]", "[0;3;0]", "[0;0;0]"]) await saisir(p);
  await vue.focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  await vue.focus();
  const c = await ecran({ x: 2, y: 1.5, z: 0 });
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.press("Alt+Shift+Q");
  await page.locator("[data-planche-profiles-mode]").selectOption("saisie");
  await page.locator('[data-planche-profiles-champ="largeur"]').fill("100");
  await page.locator('[data-planche-profiles-champ="hauteur"]').fill("50");
  await page.locator("[data-planche-profiles-poser]").click();
  await vue.focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  // Panneau par son raccourci.
  await vue.focus();
  await page.keyboard.press("Alt+Shift+T");
  await page.waitForSelector("[data-planche-debit]");
  const lignes = page.locator("[data-planche-debit-ligne]");
  const total = await page.locator("[data-planche-debit-total]").textContent();
  check("Alt+Maj+T ouvre la liste : 2 lignes, total 14 m", (await lignes.count()) === 2 && /14/.test(total ?? ""), `${await lignes.count()} ligne(s), total ${total}`);
  const texte0 = (await lignes.nth(0).textContent()) ?? "";
  check("ligne 4 m : 2 pièces, angles 45° / 45°, masse « non évaluée »", /Rectangle 100 × 50 mm/.test(texte0) && /45° \/ 45°/.test(texte0) && /non évaluée/.test(texte0), texte0);
  await page.locator("[data-planche-debit-rho]").fill("500");
  check("masse volumique sans source : la masse reste « non évaluée »", /non évaluée/.test((await lignes.nth(0).textContent()) ?? ""));
  await page.locator("[data-planche-debit-rho-source]").fill("Fiche d'essai, non contractuelle");
  const masse = (await page.locator("[data-planche-debit-masse]").first().textContent()) ?? "";
  check("avec sa source : masse = aire × longueur × ρ (0,005 × 8 × 500 = 20 kg)", /20 kg/.test(masse), masse);
  // Tri par longueur unitaire croissante : la ligne 3 m d'abord.
  await page.locator('[data-planche-debit-tri="longueurUnitaire"]').click();
  const longueurTete = (await lignes.nth(0).locator("td").nth(3).textContent()) ?? "";
  check("tri par colonne (longueur unitaire ▲) : la ligne de 3 m passe en tête", longueurTete.trim() === "3 m", longueurTete);
  // Clic sur une ligne → exactement ses deux occurrences.
  await lignes.nth(0).click();
  const sel = await page.evaluate(() => window.fadiPlanche.selection());
  const longueurs = await page.evaluate((ids) => {
    const m = window.fadiPlanche.modele();
    return ids.map((id) => m.definitions[m.racine.occurrences[id]?.definition]?.piece?.longueur);
  }, sel);
  check("clic sur la ligne 3 m : exactement ses 2 occurrences sélectionnées", sel.length === 2 && longueurs.every((l) => Math.abs(l - 3) < 1e-9), JSON.stringify({ sel, longueurs }));
  // Renuméroter, étiquettes, effacer — par les raccourcis du registre.
  const pas0 = (await etat()).pas;
  await vue.focus();
  await page.keyboard.press("Alt+Shift+N");
  await page.waitForTimeout(100);
  const reperes = await page.evaluate(() => Object.values(window.fadiPlanche.modele().racine.occurrences).map((o) => o.repere).sort());
  check("Alt+Maj+N : repères P1 / P2 dans l'ordre de la liste, un pas", JSON.stringify(reperes) === JSON.stringify(["P1", "P1", "P2", "P2"]) && (await etat()).pas === pas0 + 1, JSON.stringify(reperes));
  await page.keyboard.press("Alt+Shift+E");
  await page.waitForTimeout(100);
  const etiquettes = () => page.evaluate(() => Object.values(window.fadiPlanche.modele().annotations?.textes ?? {}).filter((t) => t.etiquettePiece).map((t) => t.texte).sort());
  check("Alt+Maj+E : une étiquette par pièce, portant son repère", JSON.stringify(await etiquettes()) === JSON.stringify(["P1", "P1", "P2", "P2"]), JSON.stringify(await etiquettes()));
  await page.screenshot({ path: `${OUT}/debit.png` });
  await page.keyboard.press("Alt+Shift+W");
  await page.waitForTimeout(100);
  check("Alt+Maj+W : étiquettes effacées ensemble", (await etiquettes()).length === 0);
  // Export CSV.
  const [telechargement] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Alt+Shift+X")]);
  const chemin = `${OUT}/debit.csv`;
  await telechargement.saveAs(chemin);
  const csv = readFileSync(chemin, "utf8");
  check("Alt+Maj+X : CSV avec BOM et séparateur « ; », total 14 m", csv.startsWith("\uFEFF\"Repère(s)\";") && /"Total";"2 ligne\(s\)";4;;14;/.test(csv), csv.slice(0, 120));
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette de la liste de débit (lot L14) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
