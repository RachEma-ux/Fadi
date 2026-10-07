/**
 * Recette du mode « Planche » de l'Atelier (cahier-planche §8, lots 2 et 3) sur desktop (1536 px) puis en émulation mobile
 * (390 px, tactile) : ouverture de la Planche, Ligne au clavier (L) et carré tracé par « 4 » Entrée × 4 → une face,
 * Rectangle « 4;3 » (locale française : point-virgule de liste, P-3), Annuler / Rétablir locaux, Échap, recherche
 * Maj + -, Zoom « 60 », lot 3 (Pousser/Tirer « 2,7 » puis Diviser « 4 »), brouillon local relu après rechargement ; au toucher, barre de modificateurs visible et cibles
 * ≥ 44 px ; aucune requête POST vers /commands (brouillon local, C6) ; axe-core sans violation critique ou sérieuse.
 *
 * L'état est lu par l'instrumentation de la Planche (`window.fadiPlanche` : modèle du brouillon, outil actif, état de
 * la machine, projection écran), en lecture seule.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche.mjs
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
const mesurer = async (nom, fn) => {
  const t = performance.now();
  const r = await fn();
  console.log(`⏱ ${nom} : ${Math.round(performance.now() - t)} ms`);
  return r;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();
const erreursPage = [];
// Brouillon local (C6) : aucune commande ne doit partir pendant que la Planche est ouverte.
let enPlanche = false;
const commandesEmises = [];
const ecouter = (p) => {
  p.on("pageerror", (e) => erreursPage.push(e.message));
  p.on("request", (r) => {
    if (enPlanche && r.method() === "POST" && /\/commands\b/.test(r.url())) commandesEmises.push(r.url());
  });
};
ecouter(page);
page.on("dialog", (d) => void d.accept());

const api = async (methode, chemin, data, p = page) => {
  const r = await p.request[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const ouvrir = async (pid, p = page) => {
  await p.goto(`${BASE}/projets/${pid}?module=atelier`);
  await p.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  await p.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
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
const boite = async (sel, p = page) => p.locator(sel).first().boundingBox();

/** Ouvre le mode Planche et attend la vue three.js et l'instrumentation. */
async function ouvrirPlanche(p = page, toucher = false) {
  const bouton = p.locator("[data-mode-planche]");
  await bouton.scrollIntoViewIfNeeded();
  if (toucher) await bouton.tap();
  else await bouton.click();
  await p.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
  await p.waitForFunction(() => !!window.fadiPlanche, null, { timeout: 30000 });
  enPlanche = true;
}
/** État lisible du brouillon : comptes, aires des faces (contour extérieur, plan horizontal), outil, étape. */
const etat = (p = page) =>
  p.evaluate(() => {
    const P = window.fadiPlanche;
    const c = P.modele().racine;
    const pos = (id) => c.sommets[id].position;
    const aires = Object.values(c.faces).map((f) => {
      const q = f.exterieur.map(pos);
      let a = 0;
      for (let i = 0; i < q.length; i++) {
        const u = q[i];
        const v = q[(i + 1) % q.length];
        a += u.x * v.y - v.x * u.y;
      }
      return Math.round((Math.abs(a) / 2) * 1e6) / 1e6;
    });
    const e = P.etatOutil();
    return { faces: aires.length, aretes: Object.keys(c.aretes).length, sommets: Object.keys(c.sommets).length, aires, outil: P.outil(), etape: e?.etape ?? null, depart: e?.depart ?? null, fleche: e?.fleche?.touche ?? null, pas: P.pas() };
  });
/** Position page (px) d'un point du repère local de la Planche. */
async function ecran(q, p = page) {
  const b = await boite("[data-planche-vue] canvas", p);
  const e = await p.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  return e && { x: b.x + e.x, y: b.y + e.y };
}
const plus = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const consigne = (p = page) => p.locator("[data-planche-etat]").textContent().then((t) => t ?? "");

const email = `planche-${Date.now()}@example.com`;
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "planche-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · planche" })).body.id;

// 1. Ouvrir le projet, l'Atelier, puis la Planche (three.js chargé à la première ouverture).
await ouvrir(pid);
await mesurer("ouverture de la Planche (chargement de three.js compris)", () => ouvrirPlanche());
check("Planche ouverte : vue three.js, barre d'outils, barre d'état et champ Mesures", (await page.locator("[data-planche-vue] canvas").count()) === 1 && (await page.locator(".planche-outils").isVisible()) && (await page.locator("[data-planche-etat]").isVisible()) && (await page.locator("[data-planche-mesures]").isVisible()));
check("bouton « Planche » marqué actif", (await page.locator("[data-mode-planche]").getAttribute("aria-pressed")) === "true");
check("brouillon local annoncé comme tel (C6)", ((await page.locator("[data-planche-brouillon]").textContent()) ?? "").includes("Brouillon local") && ((await page.locator("[data-planche-brouillon]").getAttribute("title")) ?? "").includes("Brouillon local"));
check("barre d'état en région aria-live", (await page.locator("[data-planche-etat]").getAttribute("aria-live")) === "polite");
check("desktop (souris) : barre de modificateurs tactile masquée", !(await page.locator("[data-planche-modificateurs]").isVisible()));
const vide = await etat();
check("brouillon vide au départ (aucune donnée supposée, R3)", vide.faces === 0 && vide.aretes === 0, JSON.stringify(vide));

// 2. Ligne au clavier (L), carré tracé par « 4 » Entrée × 4 : la direction est donnée par le curseur.
await page.locator("[data-planche-vue]").focus();
await page.keyboard.press("l");
check("touche L : outil Ligne", (await etat()).outil === "ligne" && (await page.locator('[data-planche-outil="ligne"]').getAttribute("aria-pressed")) === "true");
await mesurer("carré de 4 m au champ Mesures (4 segments)", async () => {
  const o = await ecran({ x: 0, y: 0, z: 0 });
  await page.mouse.move(o.x - 30, o.y + 10);
  await page.mouse.move(o.x, o.y, { steps: 3 });
  await page.mouse.click(o.x, o.y);
  for (const d of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }]) {
    const depart = (await etat()).depart ?? { x: 0, y: 0, z: 0 };
    const vise = await ecran(plus(depart, { x: d.x * 2, y: d.y * 2, z: 0 }));
    await page.mouse.move(vise.x, vise.y, { steps: 6 });
    await page.keyboard.type("4");
    await page.keyboard.press("Enter");
  }
});
const carre = await etat();
check("carré « 4 » Entrée × 4 : 4 arêtes et UNE face de 16 m² (CA-LIG-2)", carre.aretes === 4 && carre.faces === 1 && Math.abs((carre.aires[0] ?? 0) - 16) < 1e-6, JSON.stringify(carre));
check("chaîne terminée à la fermeture : retour à l'étape 1, outil gardé", carre.outil === "ligne" && carre.etape === 1 && (await consigne()).includes("première extrémité"), await consigne());
check("une opération = un pas d'annulation local (4 segments → 4 pas)", carre.pas === 4, String(carre.pas));
await page.screenshot({ path: `${OUT}/planche-carre.png` });

// 3. Rectangle (R) « 4;3 » : quadrant donné par le curseur, une face de 12 m², Mesures garde le texte tapé.
await page.keyboard.press("r");
check("touche R : outil Rectangle", (await etat()).outil === "rectangle");
await mesurer("rectangle 4 × 3 au champ Mesures", async () => {
  const c1 = await ecran({ x: 6, y: 0.5, z: 0 });
  await page.mouse.move(c1.x, c1.y, { steps: 4 });
  await page.mouse.click(c1.x, c1.y);
  const c2 = await ecran({ x: 7, y: 1.5, z: 0 });
  await page.mouse.move(c2.x, c2.y, { steps: 6 });
  await page.keyboard.type("4;3");
  await page.keyboard.press("Enter");
});
const rect = await etat();
check("Rectangle « 4;3 » : une seconde face de 12 m² (CA-REC-1)", rect.faces === 2 && rect.aires.some((a) => Math.abs(a - 12) < 1e-6), JSON.stringify(rect.aires));
check("Rectangle : le champ Mesures garde le texte tapé", (await page.locator("[data-planche-mesures]").inputValue()) === "4;3", await page.locator("[data-planche-mesures]").inputValue());
check("Rectangle : outil gardé, étape 1", rect.outil === "rectangle" && rect.etape === 1);

// 4. Annuler / rétablir LOCAUX (Ctrl + Z / Ctrl + Y) : un pas = le rectangle entier.
await page.keyboard.press("Control+z");
const annule = await etat();
check("Annuler : le rectangle disparaît, le carré reste", annule.faces === 1 && annule.aretes === 4, JSON.stringify(annule));
check("Annuler : opération annoncée dans la barre d'état", ((await page.locator("[data-planche-message]").textContent().catch(() => "")) ?? "").includes("Annulé : Rectangle"), await consigne());
await page.keyboard.press("Control+y");
check("Rétablir : le rectangle revient", (await etat()).faces === 2);

// 5. Échap : pendant un tracé, annule l'opération et garde l'outil ; sans tracé, l'outil reste actif (P-5).
const c3 = await ecran({ x: 6, y: 6, z: 0 });
await page.mouse.move(c3.x, c3.y, { steps: 4 });
await page.mouse.click(c3.x, c3.y);
check("Rectangle : premier coin posé (étape 2)", (await etat()).etape === 2);
await page.keyboard.press("Escape");
const apresEchap = await etat();
check("Échap pendant le tracé : étape 1, outil Rectangle gardé, rien de créé", apresEchap.outil === "rectangle" && apresEchap.etape === 1 && apresEchap.faces === 2 && apresEchap.aretes === rect.aretes, JSON.stringify(apresEchap));
await page.keyboard.press("Escape");
// Décision P-5 (comportement relevé C23) : sans tracé, Échap garde l'outil de dessin actif.
check("Échap sans tracé : l'outil Rectangle reste actif (décision P-5, comportement relevé)", (await etat()).outil === "rectangle", (await etat()).outil);

// 6. Recherche (Maj + -) : noms français et anglais ; outil choisi depuis la liste.
await page.locator("[data-planche-vue]").focus();
await mesurer("ouverture de la recherche d'outil", async () => {
  await page.keyboard.press("Shift+Minus");
  await page.waitForSelector("[data-planche-recherche-dialogue]", { timeout: 5000 });
});
check("Maj + - : boîte de recherche ouverte, champ focalisé", await page.evaluate(() => document.activeElement?.id === "planche-recherche-champ"));
await page.locator("#planche-recherche-champ").fill("push");
check("recherche « push » : Pousser / tirer en tête (CA-RCH-1), annoncé pour son lot", (await page.locator("#planche-recherche-liste [role=option]").first().getAttribute("id")) === "planche-recherche-pousser-tirer");
await page.locator("#planche-recherche-champ").fill("pousser");
check("recherche « pousser » : Pousser / tirer en tête (CA-RCH-1)", (await page.locator("#planche-recherche-liste [role=option]").first().getAttribute("id")) === "planche-recherche-pousser-tirer");
await page.locator("#planche-recherche-champ").fill("cercle");
await page.keyboard.press("Enter");
check("recherche « cercle » puis Entrée : outil Cercle, boîte fermée", (await etat()).outil === "cercle" && (await page.locator("[data-planche-recherche-dialogue]").count()) === 0);

// 7. Zoom « 60 » : champ de vision de la vue, sans commande (CA-CAM-2) ; Échap → outil précédent (CA-CAM-1).
await page.keyboard.press("Shift+Minus");
await page.locator("#planche-recherche-champ").fill("zoom");
await page.keyboard.press("Enter");
check("recherche « zoom » : outil Zoom", (await etat()).outil === "zoom");
await page.keyboard.type("60");
await page.keyboard.press("Enter");
check("Zoom « 60 » : champ de vision 60° annoncé (CA-CAM-2)", ((await page.locator("[data-planche-message]").textContent().catch(() => "")) ?? "").includes("60,00°"), await consigne());
await page.keyboard.press("Escape");
check("Zoom puis Échap : outil précédent (Cercle) (CA-CAM-1)", (await etat()).outil === "cercle", (await etat()).outil);
// 7 bis. Lot 3 — outils de modification : Pousser/Tirer au clavier (P) puis Diviser par la recherche ; toujours en brouillon local.
const avantLot3 = await etat();
await page.locator("[data-planche-vue]").focus();
await page.keyboard.press("p");
check("touche P : outil Pousser/Tirer", (await etat()).outil === "pousser-tirer", (await etat()).outil);
await mesurer("Pousser/Tirer : rectangle 4 × 3 tiré de 2,7 m au champ Mesures", async () => {
  const f = await ecran({ x: 8, y: 2, z: 0 });
  await page.mouse.move(f.x, f.y, { steps: 4 });
  await page.mouse.click(f.x, f.y);
  check("Pousser/Tirer : face choisie (étape 2), consigne « fixer la face »", (await etat()).etape === 2 && (await consigne()).includes("fixer la face"), await consigne());
  await page.keyboard.type("2,7");
  await page.keyboard.press("Enter");
});
const boiteLot3 = await etat();
check("Pousser/Tirer « 2,7 » (CA-PPT-1) : rectangle devenu boîte fermée, 6 faces de plus que le carré", boiteLot3.faces === avantLot3.faces + 5 && boiteLot3.aretes === avantLot3.aretes + 8, JSON.stringify({ avant: avantLot3, apres: boiteLot3 }));
check("Pousser/Tirer : une seule opération (un pas d'annulation), outil gardé à l'étape 1", boiteLot3.pas === avantLot3.pas + 1 && boiteLot3.outil === "pousser-tirer" && boiteLot3.etape === 1, `${avantLot3.pas} → ${boiteLot3.pas}`);
await page.keyboard.press("Shift+Minus");
await page.locator("#planche-recherche-champ").fill("diviser");
await page.keyboard.press("Enter");
check("recherche « diviser » : outil Diviser, champ Segments à 5", (await etat()).outil === "diviser" && (await page.locator("[data-planche-mesures]").inputValue()) === "5", `${(await etat()).outil} / ${await page.locator("[data-planche-mesures]").inputValue()}`);
const bord = await ecran({ x: 2, y: 0, z: 0 });
await page.mouse.move(bord.x, bord.y, { steps: 4 });
await page.mouse.click(bord.x, bord.y);
await page.keyboard.type("4");
await page.keyboard.press("Enter");
const divise = await etat();
check("Diviser « 4 » (CA-DIV-1) : l'arête du carré est coupée en 4 (3 arêtes de plus), la face est conservée", divise.aretes === boiteLot3.aretes + 3 && divise.faces === boiteLot3.faces, JSON.stringify(divise));
check("Diviser terminé : l'outil Sélection est rétabli", divise.outil === "selection", divise.outil);
check("Diviser : une opération de plus dans l'historique local", divise.pas === boiteLot3.pas + 1, `${boiteLot3.pas} → ${divise.pas}`);
await page.keyboard.press("Control+z");
await page.keyboard.press("Control+z");
check("Annuler ×2 : retour au carré et au rectangle (aucune commande émise)", (await etat()).faces === avantLot3.faces && (await etat()).aretes === avantLot3.aretes, JSON.stringify(await etat()));
await page.keyboard.press("Control+y");
await page.keyboard.press("Control+y");
check("Rétablir ×2 : Pousser/Tirer et Diviser reviennent", (await etat()).faces === divise.faces && (await etat()).aretes === divise.aretes, JSON.stringify(await etat()));
await page.screenshot({ path: `${OUT}/planche-desktop.png` });
await axe("mode Planche (desktop)");

// 8. Brouillon local relu après rechargement (C6) ; les modes Plan / 3D / Documents restent inchangés.
await page.waitForTimeout(800);
enPlanche = false;
await ouvrir(pid);
await ouvrirPlanche();
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length > 0, null, { timeout: 10000 }).catch(() => {});
check("brouillon local relu après rechargement : mêmes faces et arêtes (Pousser/Tirer et Diviser compris)", (await etat()).faces === divise.faces && (await etat()).aretes === divise.aretes, JSON.stringify(await etat()));
enPlanche = false;
await page.locator('.barre-mode button:text-is("Plan")').click();
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 15000 });
check("retour en Plan : le plan de l'Atelier est affiché, la Planche est fermée", (await page.locator("[data-planche]").count()) === 0 && (await page.locator(".plan2d").isVisible()));

// 9. Mobile (390 × 844, tactile) : barre de modificateurs, cibles ≥ 44 px, carré au toucher.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
const tel = await mobile.newPage();
ecouter(tel);
await ouvrir(pid, tel);
await mesurer("ouverture de la Planche au téléphone", () => ouvrirPlanche(tel, true));
const toucher = async (q) => {
  const e = await ecran(q, tel);
  await tel.touchscreen.tap(e.x, e.y);
};
await toucher({ x: -3, y: -3, z: 0 }); // premier toucher (Sélection, dans le vide) : l'interface passe en mode tactile
check("mobile : barre de modificateurs visible au toucher (C18, P-12)", await tel.locator("[data-planche-modificateurs]").isVisible());
const petites = await tel.locator("[data-planche-modificateurs] button:visible, .planche-outils .outil:visible, .planche-colonne .canevas-icone:visible, .planche-haut button:visible").evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map((e) => e.getAttribute("data-planche-mod") ?? e.getAttribute("data-planche-outil") ?? e.className));
check("mobile : modificateurs, outils et panneaux d'au moins 44 px", petites.length === 0, petites.join(", "));
const barreMod = await boite("[data-planche-modificateurs]", tel);
check("mobile : la barre de modificateurs tient dans l'écran", !!barreMod && barreMod.x >= 0 && barreMod.x + barreMod.width <= 390 + 1, JSON.stringify(barreMod));
await tel.locator('[data-planche-outil="ligne"]').tap();
check("mobile : outil Ligne choisi au toucher", (await etat(tel)).outil === "ligne");
await toucher({ x: 0, y: 0, z: 0 });
check("mobile : premier point posé au toucher (étape 2)", (await etat(tel)).etape === 2, JSON.stringify(await etat(tel)));
// Refonte responsive : les flèches sont dans le volet déployé (« Plus »), la consigne complète aussi.
await tel.locator("[data-planche-volet-bascule]").tap();
check("mobile : « Plus » déploie le volet et révèle les flèches", await tel.locator('[data-planche-mod="FlecheDroite"]').isVisible());
await tel.locator('[data-planche-mod="FlecheDroite"]').tap();
check("mobile : bouton → = verrou de direction rouge (bascule)", (await etat(tel)).fleche === "FlecheDroite");
await tel.locator('[data-planche-mod="FlecheDroite"]').tap();
check("mobile : second appui sur → = déverrouillé", (await etat(tel)).fleche === null);
await tel.locator("[data-planche-volet-bascule]").tap();
// Sans survol au doigt, la direction est donnée par une coordonnée relative au champ Mesures (`<dx;dy;dz>`).
await mesurer("carré de 4 m au toucher (coordonnées relatives)", async () => {
  for (const s of ["<4;0;0>", "<0;4;0>", "<-4;0;0>", "<0;-4;0>"]) {
    await tel.locator("[data-planche-mesures]").tap();
    await tel.locator("[data-planche-mesures]").fill(s);
    await tel.keyboard.press("Enter");
  }
});
const carreTel = await etat(tel);
check("mobile : carré fermé → 4 arêtes et UNE face de 16 m²", carreTel.aretes === 4 && carreTel.faces === 1 && Math.abs((carreTel.aires[0] ?? 0) - 16) < 1e-6, JSON.stringify(carreTel));
await tel.screenshot({ path: `${OUT}/planche-mobile.png` });
await axe("mode Planche (mobile)", tel);
enPlanche = false;
await mobile.close();

check("aucune requête POST vers /commands pendant la Planche (brouillon local)", commandesEmises.length === 0, commandesEmises.slice(0, 3).join(" | "));
check("aucune erreur JavaScript dans la page", erreursPage.length === 0, erreursPage.slice(0, 3).join(" | "));
await browser.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette Planche : tout est vert.");
process.exit(echecs ? 1 : 0);
