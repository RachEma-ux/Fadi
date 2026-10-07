/**
 * Recette des lots 4 à 6 de la Planche (desktop 1536 × 864, souris + clavier) : les 20 outils autrefois « prévus »
 * sont activés un à un (grille « … ») et leur effet est vérifié par l'instrumentation `window.fadiPlanche`
 * (lecture seule) — lot 4 : Mètre, Cotes, Rapporteur, Axes, Texte, Plan de coupe, Zoom étendu, Zoom fenêtre,
 * Positionner la caméra, Regarder autour, Marcher ; lot 5 : Pot de peinture, Prélever la matière, Balise, Texte 3D ;
 * lot 6 : Enveloppe extérieure, Union, Soustraction, Ajuster, Intersection, Scinder (manifold-3d, chargé à la demande).
 * Toute coordonnée visée reste dans le canevas (|x| ≤ 8, |y| ≤ 8 autour de l'origine dans la vue par défaut) ; les
 * outils de caméra, qui déplacent la vue, passent en dernier.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-lots-4-6.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
mkdirSync(OUT, { recursive: true });
const resultats = [];
const note = (outil, cas, ok, detail = "") => { resultats.push({ outil, cas, ok, detail }); console.log(`${ok ? "✓" : "✗"} [${outil}] ${cas}${detail ? " — " + detail : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
const api = async (m, c, d) => { const r = await page.request[m](`${BASE}${c}`, d === undefined ? undefined : { data: d }); return { status: r.status(), body: await r.json().catch(() => null) }; };

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `lots456-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "planche-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "lots 4 à 6" })).body.id;
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const bouton = page.locator("[data-mode-planche]"); await bouton.scrollIntoViewIfNeeded(); await bouton.click();
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.locator("[data-planche-vue]").focus();

// ——— Instrumentation
const etat = () => page.evaluate(() => {
  const P = window.fadiPlanche; const m = P.modele(); const c = m.racine; const e = P.etatOutil();
  return { faces: Object.keys(c.faces).length, aretes: Object.keys(c.aretes).length, occurrences: Object.keys(c.occurrences).length, definitions: Object.keys(m.definitions).length, outil: P.outil(), etape: e?.etape ?? null, pas: P.pas(), selection: P.selection(), materiau: P.materiau(), balise: P.balise(), hauteurOeil: P.hauteurOeil(), booleens: P.booleens(), camera: P.camera() };
});
const annotations = () => page.evaluate(() => {
  const a = window.fadiPlanche.modele().annotations ?? {}; const n = (k) => Object.keys(a[k] ?? {}).length;
  return { guides: n("guides"), cotes: n("cotes"), textes: n("textes"), plans: n("plansDeCoupe"), materiaux: n("materiaux"), balises: n("balises"), repere: a.repere ?? null, liste: a };
});
const racine = () => page.evaluate(() => window.fadiPlanche.modele().racine);
const sommets = () => page.evaluate(() => Object.values(window.fadiPlanche.modele().racine.sommets).map((s) => s.position));
const emprise = async () => { const s = await sommets(); if (!s.length) return null; const f = (k) => [Math.min(...s.map((p) => p[k])), Math.max(...s.map((p) => p[k]))].map((v) => Math.round(v * 1000) / 1000); return { x: f("x"), y: f("y"), z: f("z") }; };
const boite = async () => page.locator("[data-planche-vue] canvas").boundingBox();
const ecran = async (q) => { const b = await boite(); const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q); return { x: b.x + e.x, y: b.y + e.y }; };
const survoler = async (q) => { const e = await ecran(q); await page.mouse.move(e.x, e.y, { steps: 4 }); return e; };
const cliquer = async (q) => { const e = await survoler(q); await page.mouse.click(e.x, e.y); await page.waitForTimeout(40); };
const tripleCliquer = async (q) => { const e = await survoler(q); await page.mouse.click(e.x, e.y, { clickCount: 3 }); await page.waitForTimeout(60); };
const saisir = async (t) => { await page.keyboard.type(t); await page.keyboard.press("Enter"); await page.waitForTimeout(60); };
const message = () => page.locator("[data-planche-message]").textContent().catch(() => "");
const mesures = () => page.locator("[data-planche-mesures]").inputValue();
/** Outil Sélection par la touche Espace, le dessin ayant le focus (sinon Espace actionne le bouton focalisé). */
const selectionner = async () => { await page.locator("[data-planche-vue]").focus(); await page.keyboard.press(" "); };
const vider = async () => {
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  for (let i = 0; i < 60 && (await etat()).pas > 0; i++) await page.locator("[data-planche-annuler]").click();
  await selectionner();
  await cliquer({ x: -6, y: -6, z: 0 });
  await page.locator("[data-planche-vue]").focus();
};
/** Activation par le bouton de la barre (Mètre, Pot de peinture) ou de la grille « … » — sans motif d'indisponibilité. */
const outil = async (id) => {
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Escape");
  let b = page.locator(`.planche-outils [data-planche-outil="${id}"]`);
  const barre = (await b.count()) === 1;
  if (!barre) { await page.locator("[data-planche-plus]").click(); await page.waitForSelector("[data-planche-grille]"); b = page.locator(`[data-planche-grille] [data-planche-outil="${id}"]`); }
  const titre = await b.getAttribute("title");
  await b.click(); await page.waitForTimeout(60);
  const e = await etat();
  const ok = (id === "zoom-etendu" ? true : e.outil === id) && !/prévu/.test(titre ?? "");
  note(id, `activation par ${barre ? "la barre" : "la grille"} (titre « ${titre} »)`, ok, e.outil);
  return ok;
};
const rect = async (coin, dims) => { await page.locator("[data-planche-vue]").focus(); await page.keyboard.press("r"); await cliquer(coin); await saisir(dims); };
const boiteSolide = async (coin, dims, hauteur, interieur, nom, vers = interieur) => {
  // Rectangle (coin visible, direction du curseur vers `vers`), Pousser/Tirer, triple-clic (tout ce qui est connecté),
  // Ctrl + G : un groupe solide. Les points visés ne doivent pas être cachés par un solide déjà dessiné.
  await page.locator("[data-planche-vue]").focus(); await page.keyboard.press("r"); await cliquer(coin); await survoler(vers); await saisir(dims);
  await page.keyboard.press("p"); await cliquer(interieur); await saisir(hauteur);
  await selectionner(); await tripleCliquer({ ...interieur, z: Number(hauteur.replace(",", ".")) });
  await page.keyboard.press("Control+g"); await page.waitForTimeout(60);
  const e = await etat();
  note(nom, "rectangle + Pousser/Tirer + triple-clic + Ctrl + G : un groupe", e.occurrences >= 1 && /Groupe/.test((await message()) ?? ""), `${e.occurrences} occurrence(s) ; ${await message()}`);
};
const capture = (nom) => page.screenshot({ path: `${OUT}/planche-${nom}.png` });

// ============================================================================================ Lot 4
// ——— Mètre (T) : guide infini depuis une arête, guide fini entre deux points, point de guide (Ctrl), redimensionnement
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  if (await outil("metre")) {
    await cliquer({ x: 1, y: 0, z: 0 }); note("metre", "clic sur une arête (hors milieu) : étape 2", (await etat()).etape === 2);
    await survoler({ x: 1, y: -2, z: 0 }); note("metre", "survol : le champ Mesures montre la distance (2 m)", /2/.test(await mesures()), await mesures());
    await cliquer({ x: 1, y: -2, z: 0 });
    let a = await annotations(); note("metre", "2e clic : une ligne de guide infinie parallèle à l'arête", a.guides === 1 && Object.values(a.liste.guides)[0].genre === "ligne", JSON.stringify(Object.values(a.liste.guides).map((g) => g.genre)));
    await cliquer({ x: -1, y: 5, z: 0 }); await survoler({ x: -1, y: 7, z: 0 }); await saisir("2");
    a = await annotations(); note("metre", "deux points libres, « 2 » au champ Mesures : un guide fini (segment)", a.guides === 2 && Object.values(a.liste.guides).some((g) => g.genre === "segment"), JSON.stringify(Object.values(a.liste.guides).map((g) => g.genre)));
    await page.keyboard.press("Control"); await cliquer({ x: 6, y: 5, z: 0 }); await cliquer({ x: 7, y: 5, z: 0 });
    a = await annotations(); note("metre", "Ctrl (mode points) : un point de guide", a.guides === 3 && Object.values(a.liste.guides).some((g) => g.genre === "point"), JSON.stringify(Object.values(a.liste.guides).map((g) => g.genre)));
    await page.keyboard.press("Control");
    // Redimensionnement (CA-MET-3) : mesure entre deux extrémités (4 m) puis saisie « 8 » et confirmation par Entrée.
    await cliquer({ x: 0, y: 3, z: 0 }); await cliquer({ x: 4, y: 3, z: 0 });
    note("metre", "deux extrémités : mesure seule (étape 3), rien créé", (await etat()).etape === 3 && (await annotations()).guides === 3);
    await saisir("8"); note("metre", "« 8 » : confirmation demandée", /redimension|Entrée|confirm/i.test(((await message()) ?? "") + (await page.locator("[data-planche-etat]").textContent())), (await message()) ?? "");
    await page.keyboard.press("Enter"); await page.waitForTimeout(60);
    const emp = await emprise(); note("metre", "Entrée : la Planche entière est redimensionnée × 2 (rectangle 8 × 6)", emp && emp.x[1] === 8 && emp.y[1] === 6, JSON.stringify(emp));
    await page.keyboard.press("Control+z"); await page.waitForTimeout(40);
    await capture("lot4-metre");
  }
}
// ——— Cotes : cote d'arête, cote entre deux points, étiquettes à l'écran
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  if (await outil("cotation")) {
    await cliquer({ x: 1, y: 0, z: 0 }); note("cotation", "clic sur une arête : étape 3 (placement)", (await etat()).etape === 3);
    await cliquer({ x: 1, y: -1, z: 0 });
    let a = await annotations(); note("cotation", "placement : une cote linéaire associée aux deux sommets de l'arête", a.cotes === 1 && Object.values(a.liste.cotes)[0].sommets?.length === 2, JSON.stringify(Object.values(a.liste.cotes)[0]));
    await cliquer({ x: 0, y: 3, z: 0 }); note("cotation", "clic sur une extrémité : étape 2", (await etat()).etape === 2);
    await cliquer({ x: 4, y: 3, z: 0 }); await cliquer({ x: 2, y: 4.5, z: 0 });
    a = await annotations(); note("cotation", "deux points puis placement : 2e cote", a.cotes === 2, String(a.cotes));
    const etiquettes = await page.locator(".planche-etiquette-cote").count(); note("cotation", "deux étiquettes de cote affichées (4,00 m)", etiquettes === 2 && /4,00/.test(await page.locator(".planche-etiquette-cote").first().textContent()), String(etiquettes));
    await page.keyboard.press("Escape"); await selectionner(); await cliquer({ x: 1, y: -1, z: 0 });
    note("selection", "clic sur une cote avec Sélection : la cote est sélectionnée", (await etat()).selection.some((id) => id.startsWith("c")), JSON.stringify((await etat()).selection));
    await page.keyboard.press("Delete"); note("selection", "Suppr : la cote est effacée", (await annotations()).cotes === 1);
    await capture("lot4-cotes");
  }
}
// ——— Rapporteur : centre, départ, angle saisi « 30 » → ligne de guide
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  if (await outil("rapporteur")) {
    await cliquer({ x: 0, y: 0, z: 0 }); note("rapporteur", "centre : étape 2", (await etat()).etape === 2);
    await cliquer({ x: 3, y: 0, z: 0 }); note("rapporteur", "début de l'angle : étape 3", (await etat()).etape === 3);
    await survoler({ x: 3, y: 2, z: 0 }); await saisir("30");
    const a = await annotations(); const g = Object.values(a.liste.guides)[0];
    const angle = g?.direction ? Math.round(Math.atan2(g.direction.y, g.direction.x) * 180 / Math.PI) : null;
    note("rapporteur", "« 30 » : une ligne de guide à 30° du départ", a.guides === 1 && g?.genre === "ligne" && Math.abs(angle) === 30, JSON.stringify({ g, angle }));
    await cliquer({ x: 0, y: 0, z: 0 }); await cliquer({ x: 3, y: 0, z: 0 }); await survoler({ x: 3, y: 3, z: 0 }); await saisir("4:12");
    note("rapporteur", "pente « 4:12 » acceptée : 2e guide", (await annotations()).guides === 2, String((await annotations()).guides));
  }
}
// ——— Axes : origine, axe rouge, axe vert → repère de saisie ; retour à l'outil précédent ; Ctrl + Z le retire
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  await page.keyboard.press("l"); // outil précédent = Ligne
  if (await outil("axes")) {
    await cliquer({ x: 4, y: 3, z: 0 }); await cliquer({ x: 4, y: 0, z: 0 }); await cliquer({ x: 6, y: 3, z: 0 });
    const a = await annotations(); const r = a.repere;
    note("axes", "3 clics : repère posé à l'origine (4;3;0), rouge vers −Y", r && Math.abs(r.origine.x - 4) < 1e-9 && Math.abs(r.origine.y - 3) < 1e-9 && Math.abs(r.x.y + 1) < 1e-9, JSON.stringify(r));
    note("axes", "après le repère : retour à l'outil précédent (Ligne)", (await etat()).outil === "ligne", (await etat()).outil);
    await cliquer({ x: 0, y: -5, z: 0 }); await saisir("[0;0;0]");
    const emp = await emprise(); note("ligne", "saisie « [0;0;0] » dans le nouveau repère : arête vers l'origine du repère (4;3;0)", emp && emp.y[0] === -5 && (await etat()).aretes === 5, JSON.stringify(emp));
    await page.keyboard.press("Escape"); await page.keyboard.press("Control+z"); await page.keyboard.press("Control+z");
    note("axes", "Ctrl + Z : le repère est retiré (un pas d'historique)", (await annotations()).repere === null);
  }
}
// ——— Texte : annotation avec repère sur une face (aire proposée), saisie, texte écran, Échap garde le texte proposé
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  if (await outil("texte")) {
    await cliquer({ x: 2, y: 1.5, z: 0 }); note("texte", "clic sur la face : étape 2 (aire proposée)", (await etat()).etape === 2 && /12/.test(JSON.stringify(await page.evaluate(() => window.fadiPlanche.etatOutil()))));
    await cliquer({ x: 2, y: 5, z: 0 });
    const champ = page.locator("[data-planche-texte-edition] textarea");
    note("texte", "2e clic : zone de saisie ouverte avec le texte proposé « 12,0 m² »", (await champ.count()) === 1 && /12,0 m²/.test(await champ.inputValue()), await champ.inputValue().catch(() => ""));
    await champ.fill("Salon"); await page.keyboard.press("Enter"); await page.waitForTimeout(60);
    let a = await annotations(); note("texte", "Entrée : le texte « Salon » remplace la proposition (1 pas)", a.textes === 1 && Object.values(a.liste.textes)[0].texte === "Salon" && (await etat()).pas === 2, JSON.stringify(Object.values(a.liste.textes)));
    await cliquer({ x: 5, y: -2, z: 0 }); // dans le canevas visible (le pied couvre le bas du dessin)
    note("texte", "clic dans le vide : texte écran, zone de saisie ouverte", (await annotations()).textes === 2 && (await champ.count()) === 1);
    await page.keyboard.press("Escape"); await page.waitForTimeout(40);
    a = await annotations(); note("texte", "Échap : le texte proposé reste, zone fermée", (await champ.count()) === 0 && Object.values(a.liste.textes).some((t) => t.genre === "ecran" && t.texte === "Saisissez le texte"), JSON.stringify(Object.values(a.liste.textes).map((t) => t.texte)));
    note("texte", "deux étiquettes de texte affichées", (await page.locator(".planche-etiquette-texte").count()) === 2, String(await page.locator(".planche-etiquette-texte").count()));
    await capture("lot4-texte");
  }
}
// ——— Plan de coupe : posé sur une face, sélectionné, barre Inverser / Coupe active / Effacer
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); await page.keyboard.press("p"); await cliquer({ x: 2, y: 1.5, z: 0 }); await saisir("2");
  if (await outil("plan-de-coupe")) {
    await cliquer({ x: 2, y: 1.5, z: 2 });
    let a = await annotations(); const e = await etat();
    note("plan-de-coupe", "clic sur la face du dessus : un plan (normale Z), sélectionné, outil Sélection", a.plans === 1 && Math.abs(Math.abs(Object.values(a.liste.plansDeCoupe)[0].normale.z) - 1) < 1e-9 && e.selection.length === 1 && e.outil === "selection", JSON.stringify({ sel: e.selection, outil: e.outil }));
    const barre = page.locator("[data-planche-coupe]");
    note("plan-de-coupe", "barre du plan affichée", (await barre.count()) === 1);
    await page.locator("[data-planche-coupe-inverser]").click(); await page.waitForTimeout(40);
    a = await annotations(); note("plan-de-coupe", "Inverser : `inverse` bascule", Object.values(a.liste.plansDeCoupe)[0].inverse === true);
    await page.locator("[data-planche-coupe-active]").click(); await page.waitForTimeout(40);
    a = await annotations(); note("plan-de-coupe", "Coupe active : `actif` bascule (coupe désactivée)", Object.values(a.liste.plansDeCoupe)[0].actif === false);
    await capture("lot4-plan-de-coupe");
    await page.locator("[data-planche-coupe-effacer]").click(); await page.waitForTimeout(40);
    note("plan-de-coupe", "Effacer : plan supprimé, barre fermée, géométrie intacte", (await annotations()).plans === 0 && (await barre.count()) === 0 && (await etat()).faces === 6);
  }
}

// ============================================================================================ Lot 5
// ——— Pot de peinture (B) et Prélever la matière : panneau Matériaux, face peinte, prélèvement
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); await rect({ x: 5, y: 0, z: 0 }, "2;3");
  await page.locator('[data-planche-panneau-icone="materiaux"]').click(); await page.waitForSelector("[data-planche-materiaux]");
  note("peinture", "panneau Matériaux : vide au départ (matière par défaut seule)", (await page.locator("[data-planche-materiaux] [role=option]").count()) === 1);
  await page.locator("[data-planche-materiau-nom]").fill("Brique"); await page.locator("[data-planche-materiau-creer]").click(); await page.waitForTimeout(60);
  let a = await annotations(); const idBrique = Object.keys(a.liste.materiaux)[0];
  note("peinture", "« Créer la matière » : une matière « Brique » (1 pas), devenue courante", a.materiaux === 1 && Object.values(a.liste.materiaux)[0].nom === "Brique" && (await etat()).materiau === idBrique, JSON.stringify(a.liste.materiaux));
  await page.locator(`[data-planche-materiau="${idBrique}"]`).click(); await page.waitForTimeout(60);
  note("peinture", "clic sur la matière : Pot de peinture activé", (await etat()).outil === "peinture", (await etat()).outil);
  await page.locator('[data-planche-panneau-icone="materiaux"]').click();
  await cliquer({ x: 2, y: 1.5, z: 0 });
  let r = await racine(); note("peinture", "clic sur une face : sa matière recto est « Brique »", Object.values(r.faces).filter((f) => f.materiauRecto === idBrique).length === 1, JSON.stringify(Object.values(r.faces).map((f) => f.materiauRecto ?? null)));
  await page.keyboard.press("Shift"); await cliquer({ x: 6, y: 1.5, z: 0 }); await page.keyboard.press("Shift");
  r = await racine(); note("peinture", "Maj + clic sur une face sans matière : toutes les faces sans matière sont peintes", Object.values(r.faces).every((f) => f.materiauRecto === idBrique), JSON.stringify(Object.values(r.faces).map((f) => f.materiauRecto ?? null)));
  await page.keyboard.press("Control+z"); await page.waitForTimeout(40);
  await page.locator('[data-planche-panneau-icone="materiaux"]').click(); await page.locator('[data-planche-materiau=""]').click(); await page.locator('[data-planche-panneau-icone="materiaux"]').click();
  note("peinture", "choix « Matière par défaut » : matière courante nulle", (await etat()).materiau === null);
  if (await outil("echantillon-matiere")) {
    await cliquer({ x: 2, y: 1.5, z: 0 });
    const e = await etat(); note("echantillon-matiere", "clic sur la face peinte : matière « Brique » prélevée, Pot de peinture activé", e.materiau === idBrique && e.outil === "peinture", JSON.stringify({ m: e.materiau, outil: e.outil }));
    await cliquer({ x: 6, y: 1.5, z: 0 });
    r = await racine(); note("peinture", "la matière prélevée est appliquée à la 2e face", Object.values(r.faces).every((f) => f.materiauRecto === idBrique));
    await capture("lot5-peinture");
  }
}
// ——— Balise : panneau Balises, groupe balisé, visibilité
{
  await vider(); await boiteSolide({ x: 0, y: 0, z: 0 }, "4;3", "1", { x: 2, y: 1.5, z: 0 }, "balise");
  await page.locator('[data-planche-panneau-icone="balises"]').click(); await page.waitForSelector("[data-planche-balises]");
  await page.locator("[data-planche-balise-nom]").fill("Murs"); await page.locator("[data-planche-balise-creer]").click(); await page.waitForTimeout(60);
  let a = await annotations(); const idMurs = Object.keys(a.liste.balises)[0];
  note("balise", "« Créer la balise » : balise « Murs » visible, courante", a.balises === 1 && Object.values(a.liste.balises)[0].visible === true && (await etat()).balise === idMurs, JSON.stringify(a.liste.balises));
  await page.locator(`[data-planche-balise="${idMurs}"] .planche-ligne-choix`).click(); await page.waitForTimeout(60);
  note("balise", "clic sur la balise : outil Balise activé", (await etat()).outil === "balise", (await etat()).outil);
  await page.locator('[data-planche-panneau-icone="balises"]').click();
  await cliquer({ x: 2, y: 1.5, z: 1 });
  let r = await racine(); note("balise", "clic sur le groupe : l'occurrence porte la balise « Murs »", Object.values(r.occurrences).some((o) => o.balise === idMurs), JSON.stringify(Object.values(r.occurrences).map((o) => o.balise ?? null)));
  await page.locator('[data-planche-panneau-icone="balises"]').click(); await page.locator(`[data-planche-balise="${idMurs}"] [data-planche-balise-visible]`).click(); await page.waitForTimeout(60);
  a = await annotations(); note("balise", "case Visible décochée : balise masquée (1 pas)", Object.values(a.liste.balises)[0].visible === false);
  await page.locator('[data-planche-panneau-icone="balises"]').click();
  await selectionner(); await cliquer({ x: 2, y: 1.5, z: 1 });
  note("balise", "Sélection : un clic sur l'objet masqué ne sélectionne rien", (await etat()).selection.length === 0, JSON.stringify((await etat()).selection));
  await page.keyboard.press("Control+z"); await page.waitForTimeout(700); // > délai du double-clic : deux clics au même endroit
  await cliquer({ x: 2, y: 1.5, z: 1 }); note("balise", "balise visible à nouveau (Ctrl + Z) : l'objet se sélectionne", (await etat()).selection.length === 1, JSON.stringify({ sel: (await etat()).selection, visible: Object.values((await annotations()).liste.balises)[0]?.visible, pas: (await etat()).pas, outil: (await etat()).outil }));
  await capture("lot5-balise");
}
// ——— Texte 3D : boîte de dialogue, OK, placement → composant, puis Déplacer ; Annuler rend l'outil précédent
{
  await vider(); await page.keyboard.press("l");
  if (await outil("texte-3d")) {
    const boiteT = page.locator("[data-planche-texte3d]");
    note("texte-3d", "boîte de dialogue ouverte", (await boiteT.count()) === 1);
    await page.locator("[data-planche-texte3d-ok]").click(); await page.waitForTimeout(40);
    note("texte-3d", "OK sur un texte vide : refusé, message", (await boiteT.count()) === 1 && /vide/i.test(await boiteT.textContent()));
    await page.locator("[data-planche-texte3d-texte]").fill("AB 12"); await page.locator("[data-planche-texte3d-hauteur]").fill("0,5"); await page.locator("[data-planche-texte3d-ok]").click(); await page.waitForTimeout(40);
    note("texte-3d", "OK : boîte fermée, outil gardé pour le placement", (await boiteT.count()) === 0 && (await etat()).outil === "texte-3d");
    await cliquer({ x: -6, y: 2, z: 0 });
    const e = await etat(); const defs = await page.evaluate(() => Object.values(window.fadiPlanche.modele().definitions).map((d) => ({ nom: d.nom, genre: d.genre, faces: Object.keys(d.contenu.faces).length })));
    note("texte-3d", "clic : un composant « Texte 3D « AB 12 » » (faces extrudées), sélectionné, outil Déplacer", e.occurrences === 1 && defs[0]?.genre === "composant" && /AB 12/.test(defs[0]?.nom ?? "") && defs[0].faces > 20 && e.outil === "deplacer" && e.selection.length === 1, JSON.stringify({ defs, outil: e.outil }));
    const emp = await page.evaluate(() => { const m = window.fadiPlanche.modele(); const d = Object.values(m.definitions)[0]; const z = Object.values(d.contenu.sommets).map((s) => s.position.z); return { zmax: Math.max(...z), zmin: Math.min(...z) }; });
    note("texte-3d", "extrusion 0,15 m par défaut (z de 0 à 0,15)", Math.abs(emp.zmax - emp.zmin - 0.15) < 1e-9, JSON.stringify(emp));
    await capture("lot5-texte-3d");
    await page.keyboard.press("Escape"); await outil("texte-3d");
    await page.locator("[data-planche-texte3d-annuler]").click(); await page.waitForTimeout(40);
    note("texte-3d", "Annuler : retour à l'outil précédent (Déplacer)", (await etat()).outil === "deplacer", (await etat()).outil);
  }
}

// ============================================================================================ Lot 6
// ——— Solides : deux boîtes groupées 2 × 2 × 1,5 chevauchées de 1 m en X (CA-COQ-1) ; chaque opération, puis Ctrl + Z
{
  await vider();
  await boiteSolide({ x: 0, y: 0, z: 0 }, "2;2", "1,5", { x: 0.5, y: 0.5, z: 0 }, "solides");
  await boiteSolide({ x: 3, y: 2, z: 0 }, "2;2", "1,5", { x: 2.5, y: 1, z: 0 }, "solides"); // x de 1 à 3 : chevauchement 1 × 2 × 1,5 = 3 m³
  note("solides", "deux groupes à la racine", (await etat()).occurrences === 2, String((await etat()).occurrences));
  const A = { x: 0.5, y: 0.5, z: 1.5 }, B = { x: 2.5, y: 1, z: 1.5 };
  const volumes = () => page.evaluate(() => {
    const m = window.fadiPlanche.modele();
    const vol = (occ) => { const d = m.definitions[occ.definition].contenu; let v = 0; for (const f of Object.values(d.faces)) { const q = f.exterieur.map((s) => d.sommets[s].position); for (let i = 1; i + 1 < q.length; i++) { const a = q[0], b = q[i], c = q[i + 1]; v += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6; } } return Math.round(Math.abs(v) * 1000) / 1000; };
    return Object.values(m.racine.occurrences).map(vol).sort((x, y) => x - y);
  });
  const operer = async (id, attendu, libelle, crees = attendu.length) => {
    if (!(await outil(id))) return;
    await page.waitForFunction(() => window.fadiPlanche.booleens() === "ok", null, { timeout: 60000 }).catch(() => {});
    note(id, "moteur booléen manifold-3d chargé à la demande", (await etat()).booleens === "ok", (await etat()).booleens);
    await cliquer(A); note(id, "1er solide : consigne du 2e", (await page.locator("[data-planche-etat]").textContent()).includes("deuxième"), await page.locator("[data-planche-etat]").textContent());
    await cliquer(B); await page.waitForTimeout(60);
    const v = await volumes(); const e = await etat();
    note(id, libelle, JSON.stringify(v) === JSON.stringify(attendu) && e.selection.length === crees, `volumes ${JSON.stringify(v)} ; sélection ${e.selection.length}`);
    if (id === "union") await capture("lot6-union");
    await page.keyboard.press("Control+z"); await page.waitForTimeout(40);
    note(id, "Ctrl + Z : les deux boîtes reviennent", (await etat()).occurrences === 2 && JSON.stringify(await volumes()) === "[6,6]", JSON.stringify(await volumes()));
  };
  await operer("enveloppe-exterieure", [9], "Enveloppe extérieure : un solide de 9 m³ (6 + 6 − 3)");
  await operer("union", [9], "Union : un solide de 9 m³");
  await operer("soustraction", [3], "Soustraction (A puis B) : B − A = 3 m³, A supprimé");
  await operer("ajuster", [3, 6], "Ajuster : B − A (3 m³), A conservé (6 m³) ; le résultat seul est sélectionné", 1);
  await operer("intersection", [3], "Intersection : volume commun 3 m³");
  await operer("scinder", [3, 3, 3], "Scinder : trois solides de 3 m³");
  if (await outil("union")) { await cliquer({ x: 6, y: 6, z: 0 }); note("union", "clic hors solide : message, rien créé", /solide/i.test((await message()) ?? (await page.locator("[data-planche-etat]").textContent())) && (await etat()).occurrences === 2, (await message()) ?? ""); }
}

// ============================================================================================ Lot 4 — caméra (en dernier : la vue bouge)
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); await selectionner();
  const c0 = (await etat()).camera;
  if (await outil("zoom-etendu")) {
    const c1 = (await etat()).camera;
    note("zoom-etendu", "action immédiate : la caméra bouge, l'outil actif reste Sélection", (await etat()).outil === "selection" && (Math.hypot(c1.position.x - c0.position.x, c1.position.y - c0.position.y, c1.position.z - c0.position.z) > 1e-6), JSON.stringify({ c0: c0.position, c1: c1.position }));
    const o = await ecran({ x: 0, y: 0, z: 0 }); const r = await ecran({ x: 4, y: 3, z: 0 }); const b = await boite();
    note("zoom-etendu", "le rectangle entier est dans le canevas", [o, r].every((p) => p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height), JSON.stringify({ o, r }));
  }
  if (await outil("zoom-fenetre")) {
    const o1 = await ecran({ x: 0, y: 0, z: 0 }); const r1 = await ecran({ x: 4, y: 3, z: 0 });
    const de = await ecran({ x: 1, y: 1, z: 0 }); const a = await ecran({ x: 3, y: 2, z: 0 });
    await page.mouse.move(de.x, de.y); await page.mouse.down(); await page.mouse.move(a.x, a.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(60);
    const o2 = await ecran({ x: 0, y: 0, z: 0 }); const r2 = await ecran({ x: 4, y: 3, z: 0 });
    const d1 = Math.hypot(r1.x - o1.x, r1.y - o1.y), d2 = Math.hypot(r2.x - o2.x, r2.y - o2.y);
    note("zoom-fenetre", "glisser une fenêtre : la zone est agrandie (échelle > ×1,5)", d2 / d1 > 1.5, JSON.stringify({ d1, d2 }));
    note("zoom-fenetre", "après la fenêtre : retour à l'outil précédent (Sélection)", (await etat()).outil === "selection", (await etat()).outil);
    await outil("zoom-etendu");
  }
  if (await outil("positionner-camera")) {
    note("positionner-camera", "champ Mesures : décalage de hauteur 1,68 m", /1,68/.test(await mesures()), await mesures());
    await cliquer({ x: 2, y: 1.5, z: 0 });
    const e = await etat();
    note("positionner-camera", "clic : œil à 1,68 m au-dessus du point, Regarder autour activé", Math.abs(e.camera.position.z - 1.68) < 1e-6 && Math.abs(e.camera.position.x - 2) < 1e-6 && e.outil === "regarder-autour", JSON.stringify({ p: e.camera.position, outil: e.outil }));
    await saisir("2"); note("regarder-autour", "« 2 » au champ Mesures : hauteur d'œil 2 m annoncée", (await etat()).hauteurOeil === 2 && /2,00/.test((await message()) ?? ""), (await message()) ?? "");
    const b = await boite(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const avant = (await etat()).camera.position;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 120, cy, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(40);
    const apres = (await etat()).camera.position;
    note("regarder-autour", "glisser : la caméra pivote sur place (position inchangée)", Math.hypot(apres.x - avant.x, apres.y - avant.y, apres.z - avant.z) < 1e-6, JSON.stringify({ avant, apres }));
    await page.keyboard.press("Escape"); note("regarder-autour", "Échap : retour à l'outil précédent (Sélection)", (await etat()).outil === "selection", (await etat()).outil);
  }
  if (await outil("marcher")) {
    note("marcher", "champ Mesures : hauteur d'œil 2,00 m (réglée plus haut)", /2,00/.test(await mesures()), await mesures());
    const b = await boite(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const avant = (await etat()).camera.position;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy - 150, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(40);
    const apres = (await etat()).camera.position;
    note("marcher", "glisser vers le haut : la caméra avance, hauteur conservée", Math.hypot(apres.x - avant.x, apres.y - avant.y) > 0.01 && Math.abs(apres.z - avant.z) < 1e-6, JSON.stringify({ avant, apres }));
    await page.keyboard.press("Escape"); note("marcher", "Échap : retour à l'outil précédent (Regarder autour)", (await etat()).outil === "regarder-autour", (await etat()).outil);
    await page.keyboard.press("Escape"); note("regarder-autour", "Échap : retour à Sélection (Positionner la caméra, temporaire, n'est jamais rendu)", (await etat()).outil === "selection", (await etat()).outil);
    await capture("lot4-camera");
  }
}

note("page", "aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await browser.close();
const ko = resultats.filter((r) => !r.ok);
console.log(ko.length ? `\n${ko.length} échec(s) sur ${resultats.length} vérifications` : `\nRecette des lots 4 à 6 de la Planche : tout est vert (${resultats.length} vérifications).`);
process.exit(ko.length ? 1 : 0);
