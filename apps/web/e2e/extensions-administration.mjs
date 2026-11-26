/**
 * Recette de l'écran d'administration des extensions (images 12 à 15, validées le 26 novembre 2026) : onglet
 * « Administration » de la page Extensions, réservé à l'administrateur de la plateforme.
 *
 *  - liste : extensions fournies par Fadi (état, installée d'origine : réglés, gardés au rechargement) et ajoutées ici ;
 *  - import : le fichier est jugé sans rien installer ; accord → installée avec l'état choisi ; refus motivé → rien ;
 *  - éditeur : corriger un fichier refusé (le serveur a le dernier mot), modifier (l'identifiant ne change plus,
 *    « Enregistrer » grisé tant qu'un contrôle est en rouge), créer ;
 *  - comptes : une extension ajoutée paraît dans « Disponibles », s'installe d'un geste, et le compte ne reçoit que
 *    celles qu'il a installées ; « installée d'origine » vaut pour qui n'a rien choisi ;
 *  - exporter, retirer (avec confirmation) ; anglais.
 *
 * Exige la base (promotion du compte de la recette en administrateur) :
 *   BASE_URL=http://localhost:3001 DATABASE_URL=… OUT=atelier-captures/extensions-administration node apps/web/e2e/extensions-administration.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import pg from "pg";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/extensions-administration";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL attendu : la recette promeut son compte en administrateur de la plateforme.");
  process.exit(1);
}
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
await sql.connect();

// Paquets de la recette, tirés de l'extension d'essai des commandes : identifiants et raccourcis propres.
const base = () => JSON.parse(readFileSync(new URL("./donnees/essai-commandes.fadi-addon.json", import.meta.url), "utf8"));
const variante = (id, nom, raccourci) => {
  const p = base();
  p.fiche.id = id;
  p.fiche.nom = { fr: nom, en: `${nom} (en)` };
  p.fiche.commandes.forEach((c, i) => void (c.raccourci = raccourci(i)));
  return p;
};
const ID = "essai-admin";
const ID_REFUS = "essai-admin-refus";
const ID_CREE = "essai-cree";
const bon = variante(ID, "Essai de l'administration", (i) => `Ctrl+Alt+F${i + 1}`);
const refuse = variante(ID_REFUS, "Essai refusé", (i) => (i === 0 ? "Ctrl+Z" : `Ctrl+Alt+F${i + 1}`));
const fichier = (p, nom) => ({ name: nom, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(p)) });
const nettoyer = async () => {
  await sql.query("DELETE FROM addon_packages WHERE addon_id = ANY($1)", [[ID, ID_REFUS, ID_CREE]]);
  await sql.query("DELETE FROM addon_platform_settings WHERE addon_id = 'emplacement'");
};
await nettoyer();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "fr-CH", acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  const email = `extadmin-${Date.now()}@example.com`;
  await inscrireDansLaPage(page, email, "extensions-admin-ci-123", BASE);
  await page.waitForURL(/\/(accueil|projets)$/);
  await sql.query("UPDATE users SET platform_role = 'admin', totp_enabled_at = now() WHERE email = $1", [email]);
  // La session de la recette est tenue pour ouverte avec le second facteur (l'enrôlement lui-même est recetté par comptes-admin.mjs).
  await sql.query("UPDATE sessions SET mfa_verified_at = now() + interval '1 second' WHERE user_id = (SELECT id FROM users WHERE email = $1)", [email]);

  const racine = page.locator("[data-extensions-page]");
  const option = (o) => racine.locator(`[data-extensions-option="${o}"]`);
  const ligne = (id) => racine.locator(`[data-admin-extension="${id}"]`);
  const dialogue = (genre) => page.locator(`[data-admin-dialogue="${genre}"]`);
  const ouvrirAdministration = async () => {
    await page.goto(`${BASE}/extensions`);
    await option("administration").click();
    await racine.locator("[data-admin-table]").waitFor();
  };
  const servies = async () => (await (await page.request.get(`${BASE}/sandbox/preferences/extensions`)).json()).extensions.map((p) => p.fiche.id);

  // ——— 1. Liste.
  await page.goto(`${BASE}/extensions`);
  await option("installees").waitFor();
  check("administrateur : trois options, dont « Administration »", (await racine.locator("[data-extensions-option]").count()) === 3 && (await option("administration").textContent()) === "Administration");
  await ouvrirAdministration();
  const fadi = await racine.locator('[data-admin-source="fadi"]').count();
  check("liste : les extensions fournies par Fadi, réglables mais non modifiables", fadi >= 6 && (await racine.locator('[data-admin-source="fadi"] [data-admin-modifier]').count()) === 0 && /se règle, ne se modifie pas/.test(await ligne("bois").innerText()), `${fadi} extensions`);
  check("liste : sous-titre, créer, importer, bilan", /ce que la plateforme propose à tous les comptes/.test(await racine.innerText()) && (await racine.locator("[data-admin-creer]").textContent()) === "+ Créer une extension" && (await racine.locator("[data-admin-importer]").textContent()) === "Importer un fichier…" && new RegExp(`${fadi} fournies par Fadi`).test(await racine.locator("[data-admin-bilan]").textContent()));
  await page.screenshot({ path: join(OUT, "1-administration-liste.png") });

  // Réglage d'une extension fournie par Fadi : gardé au rechargement. L'état de départ dépend de ce que les recettes
  // précédentes ont laissé en base : il est lu, changé pour son contraire, puis remis.
  const pret = (id) => page.waitForFunction((x) => { const l = document.querySelector(`[data-admin-extension="${x}"]`); return !!l && !l.querySelector("[data-admin-etat]").disabled && !l.querySelector("[data-admin-origine]").disabled; }, id);
  const reglerEtat = async (id, etat) => {
    await pret(id);
    if ((await ligne(id).locator("[data-admin-etat]").inputValue()) === etat) return;
    const reponse = page.waitForResponse((r) => r.request().method() === "PATCH" && /\/admin\/addons\//.test(r.url()));
    await ligne(id).locator("[data-admin-etat]").selectOption(etat);
    await reponse;
    await page.waitForFunction(([x, e]) => document.querySelector(`[data-admin-extension="${x}"] [data-admin-etat]`)?.value === e, [id, etat]);
    await pret(id);
  };
  const reglerOrigine = async (id, voulu) => {
    await pret(id);
    if ((await ligne(id).locator("[data-admin-origine]").getAttribute("aria-checked")) === String(voulu)) return;
    const reponse = page.waitForResponse((r) => r.request().method() === "PATCH" && /\/admin\/addons\//.test(r.url()));
    await ligne(id).locator("[data-admin-origine]").click();
    await reponse;
    await ligne(id).locator(`[data-admin-origine][aria-checked="${voulu}"]`).waitFor();
    await pret(id);
  };
  const etatDepart = await ligne("emplacement").locator("[data-admin-etat]").inputValue();
  const origineDepart = (await ligne("emplacement").locator("[data-admin-origine]").getAttribute("aria-checked")) === "true";
  const etatVoulu = etatDepart === "experimentale" ? "disponible" : "experimentale";
  await reglerEtat("emplacement", etatVoulu);
  await reglerOrigine("emplacement", !origineDepart);
  await ouvrirAdministration();
  await pret("emplacement");
  check("extension fournie par Fadi : état et « installée d'origine » réglés, gardés au rechargement", (await ligne("emplacement").locator("[data-admin-etat]").inputValue()) === etatVoulu && (await ligne("emplacement").locator("[data-admin-origine]").getAttribute("aria-checked")) === String(!origineDepart));
  await reglerOrigine("emplacement", origineDepart);
  await reglerEtat("emplacement", etatDepart);

  // ——— 2. Import accepté : rien n'est installé avant l'accord.
  await racine.locator("[data-admin-fichier]").setInputFiles(fichier(bon, `${ID}.fadi-addon.json`));
  await dialogue("accepte").waitFor();
  const texteAccepte = await dialogue("accepte").innerText();
  check("import : fiche lue (identifiant, version, auteur déclaré par le fichier), rien n'est encore installé", /Importer « Essai de l'administration »/.test(texteAccepte) && texteAccepte.includes(ID) && /protocole 1\.0/.test(texteAccepte) && /déclaré par le fichier/.test(texteAccepte) && /rien n'est installé avant votre accord/.test(texteAccepte) && (await ligne(ID).count()) === 0);
  const images = await dialogue("accepte").locator('[data-admin-entrees="commandes"] img').evaluateAll((l) => l.filter((i) => i.naturalWidth > 0).length);
  check("import : ce que l'extension demande, ses commandes avec icône et raccourci, fichier conforme", (await dialogue("accepte").locator("[data-admin-permissions] span").count()) === bon.fiche.permissions.length && (await dialogue("accepte").locator('[data-admin-entrees="commandes"] li').count()) === 7 && images === 7 && /Ctrl\+Alt\+F1/.test(texteAccepte) && /Fichier conforme/.test(await dialogue("accepte").locator("[data-admin-conforme]").textContent()), `${images} icônes`);
  await page.screenshot({ path: join(OUT, "2-import-accepte.png") });
  await dialogue("accepte").locator("[data-admin-etat-import]").selectOption("disponible");
  await dialogue("accepte").locator("[data-admin-installer]").click();
  await ligne(ID).waitFor();
  check("import accepté : ligne « Importée », état choisi, pas installée d'origine, avec Modifier, Exporter, Retirer", (await ligne(ID).getAttribute("data-admin-source")) === "importee" && (await ligne(ID).locator("[data-admin-etat]").inputValue()) === "disponible" && (await ligne(ID).locator("[data-admin-origine]").getAttribute("aria-checked")) === "false" && /7 commandes · importée le \d\d\.\d\d\.\d{4}/.test(await ligne(ID).innerText()) && (await ligne(ID).locator("[data-admin-modifier], [data-admin-exporter], [data-admin-retirer]").count()) === 3, await ligne(ID).locator("th").innerText());

  // ——— 3. Import refusé, puis correction dans l'éditeur : le serveur a le dernier mot.
  await racine.locator("[data-admin-fichier]").setInputFiles(fichier(refuse, `${ID_REFUS}.fadi-addon.json`));
  await dialogue("refuse").waitFor();
  check("import refusé : motif nommé, détail, rien n'est installé", (await dialogue("refuse").locator("[data-admin-motif]").getAttribute("data-admin-motif")) === "raccourci_refuse" && /Raccourci refusé/.test(await dialogue("refuse").innerText()) && /Ctrl\+Z est déjà pris par la Planche/.test(await dialogue("refuse").innerText()) && /Rien n'a été installé/.test(await dialogue("refuse").innerText()) && (await ligne(ID_REFUS).count()) === 0);
  await page.screenshot({ path: join(OUT, "3-import-refuse.png") });
  await dialogue("refuse").locator("[data-admin-editeur]").click();
  const editeur = page.locator("[data-extensions-editeur]");
  await editeur.waitFor();
  const controle = (genre) => editeur.locator(`[data-editeur-controle="${genre}"]`).first();
  const enregistrer = editeur.locator("[data-editeur-enregistrer]");
  check("éditeur ouvert sur le fichier refusé : contrôle des raccourcis en rouge, « Enregistrer » grisé", (await controle("raccourcis").getAttribute("data-ok")) === "non" && (await enregistrer.isDisabled()) && (await editeur.locator('[data-editeur-champ="id"]').inputValue()) === ID_REFUS && !(await editeur.locator('[data-editeur-champ="id"]').isDisabled()));
  await editeur.locator('[data-editeur-commande="poser-boite"] [data-editeur-commande-modifier]').click();
  await editeur.locator('[data-editeur-champ="commande-raccourci"]').fill("Ctrl+Alt+F9");
  await editeur.locator("[data-editeur-commande-valider]").click();
  check("raccourci corrigé : les contrôles du navigateur passent", (await controle("raccourcis").getAttribute("data-ok")) === "oui" && !(await enregistrer.isDisabled()));
  await enregistrer.click();
  await editeur.locator("[data-editeur-erreur]").waitFor();
  check("le serveur refuse encore : un raccourci est tenu par une autre extension installée, rien n'est enregistré", /déjà pris par l'extension « essai-admin »/.test(await editeur.locator("[data-editeur-erreur]").textContent()) && Number((await sql.query("SELECT count(*)::int AS n FROM addon_packages WHERE addon_id = $1", [ID_REFUS])).rows[0].n) === 0, await editeur.locator("[data-editeur-erreur]").textContent());
  await editeur.locator("[data-editeur-annuler]").click();
  await racine.locator("[data-admin-table]").waitFor();

  // ——— 4. Modifier.
  await ligne(ID).locator("[data-admin-modifier]").click();
  await editeur.waitFor();
  check("modifier : titre, identifiant figé, fiche et commandes reprises, contrôles au vert", /Modifier « Essai de l'administration »/.test(await editeur.locator("h1").textContent()) && (await editeur.locator('[data-editeur-champ="id"]').isDisabled()) && (await editeur.locator("[data-editeur-commandes] li").count()) === 7 && (await editeur.locator('[data-editeur-controle][data-ok="non"]').count()) === 0 && !(await enregistrer.isDisabled()));
  const code = await editeur.locator("[data-editeur-code]").inputValue();
  await editeur.locator("[data-editeur-code]").fill(code.replace('"commande.compter"', '"commande.compte"'));
  check("une commande sans réponse dans le code : contrôle en rouge, « Enregistrer » grisé", /Commande « compter » : le code ne répond pas à « commande\.compter »/.test(await controle("reponse").textContent()) && (await enregistrer.isDisabled()), await controle("reponse").textContent().catch(() => ""));
  await editeur.locator("[data-editeur-code]").fill(`${code}\nplanche.sur(`);
  check("une erreur d'écriture dans le code est signalée sans l'exécuter", (await controle("code").getAttribute("data-ok")) === "non" && (await enregistrer.isDisabled()), await controle("code").textContent());
  await page.screenshot({ path: join(OUT, "4-editeur-modifier.png"), fullPage: true });
  await editeur.locator("[data-editeur-code]").fill(code);
  await editeur.locator('[data-editeur-champ="version"]').fill("1.0.1");
  await enregistrer.click();
  await ligne(ID).waitFor();
  check("enregistré : nouvelle version dans la liste, réglage et origine gardés", /1\.0\.1/.test(await ligne(ID).innerText()) && (await ligne(ID).getAttribute("data-admin-source")) === "importee" && (await ligne(ID).locator("[data-admin-etat]").inputValue()) === "disponible", await ligne(ID).innerText());

  // ——— 5. Créer.
  await racine.locator("[data-admin-creer]").click();
  await editeur.waitFor();
  check("créer : éditeur vide, contrôles en rouge, « Enregistrer » grisé", /Créer une extension/.test(await editeur.locator("h1").textContent()) && (await controle("fiche").getAttribute("data-ok")) === "non" && (await controle("commandes").getAttribute("data-ok")) === "non" && (await enregistrer.isDisabled()));
  const remplir = async (nom, valeur) => editeur.locator(`[data-editeur-champ="${nom}"]`).fill(valeur);
  await remplir("id", ID_CREE);
  await remplir("auteur", "Recette");
  await remplir("nom-fr", "Essai créé ici");
  await remplir("nom-en", "Trial created here");
  await remplir("description-fr", "Une commande qui salue.");
  await remplir("description-en", "One command that says hello.");
  await editeur.locator('[data-editeur-permission="messages"]').check();
  await editeur.locator("[data-editeur-ajouter]").click();
  await remplir("commande-id", "saluer");
  await remplir("commande-raccourci", "Ctrl+Alt+F10");
  await remplir("commande-libelle-fr", "Saluer");
  await remplir("commande-libelle-en", "Say hello");
  await remplir("commande-icone", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/></svg>');
  await editeur.locator("[data-editeur-commande-valider]").click();
  await editeur.locator("[data-editeur-code]").fill('planche.sur("commande.saluer", async () => {\n  await planche.message.afficher("Bonjour");\n});\n');
  check("fiche, commande et code saisis : tous les contrôles au vert", (await editeur.locator('[data-editeur-controle][data-ok="non"]').count()) === 0 && /1 commande\(s\)/.test(await controle("commandes").textContent()) && !(await enregistrer.isDisabled()), await editeur.locator("[data-editeur-controles]").innerText());
  await enregistrer.click();
  await ligne(ID_CREE).waitFor();
  check("créée : ligne « Créée ici », expérimentale, pas installée d'origine", (await ligne(ID_CREE).getAttribute("data-admin-source")) === "creee" && (await ligne(ID_CREE).locator("[data-admin-etat]").inputValue()) === "experimentale" && (await ligne(ID_CREE).locator("[data-admin-origine]").getAttribute("aria-checked")) === "false" && /1 commande · créée le/.test(await ligne(ID_CREE).innerText()), await ligne(ID_CREE).innerText());
  await page.screenshot({ path: join(OUT, "5-administration-ajoutees.png"), fullPage: true });

  // ——— 6. Comptes : disponible, installée d'un geste ; « installée d'origine » pour qui n'a rien choisi.
  const avant = await servies();
  await option("disponibles").click();
  const carte = (id) => racine.locator(`[data-extension="${id}"][data-extension-ajoutee]`);
  await carte(ID).waitFor();
  check("compte : les extensions ajoutées sont dans « Disponibles », et ne sont pas reçues tant qu'elles ne sont pas installées", /Essai de l'administration/.test(await carte(ID).innerText()) && /Ajoutée par votre plateforme/.test(await carte(ID).innerText()) && (await carte(ID_CREE).locator("[data-extension-etat]").count()) === 1 && !avant.includes(ID) && !avant.includes(ID_CREE), avant.join(", "));
  await carte(ID).locator("[data-extension-installer]").click();
  await carte(ID).waitFor({ state: "detached" });
  await option("installees").click();
  await carte(ID).waitFor();
  let recues = await servies();
  check("compte : « Installer » la range dans « Installées », et le compte la reçoit", (await carte(ID).locator("[data-extension-desinstaller]").count()) === 1 && recues.includes(ID) && !recues.includes(ID_CREE), recues.join(", "));
  await option("administration").click();
  await racine.locator("[data-admin-table]").waitFor();
  await ligne(ID_CREE).locator("[data-admin-origine]").click();
  await ligne(ID_CREE).locator('[data-admin-origine][aria-checked="true"]').waitFor();
  recues = await servies();
  check("« installée d'origine » : reçue par un compte qui n'a rien choisi", recues.includes(ID_CREE), recues.join(", "));

  // ——— 7. Exporter, retirer.
  const [telechargement] = await Promise.all([page.waitForEvent("download"), ligne(ID_CREE).locator("[data-admin-exporter]").click()]);
  const exporte = JSON.parse(readFileSync(await telechargement.path(), "utf8"));
  check("exporter : un fichier .fadi-addon.json qui porte la fiche, le code et l'icône", telechargement.suggestedFilename() === `${ID_CREE}.fadi-addon.json` && exporte.format === "fadi-addon/1" && exporte.fiche.id === ID_CREE && exporte.fiche.commandes[0].icone === "saluer.svg" && /^<svg/.test(exporte.pages["saluer.svg"]) && /commande\.saluer/.test(exporte.code));
  await ligne(ID_CREE).locator("[data-admin-retirer]").click();
  await dialogue("retirer").waitFor();
  check("retirer demande une confirmation : les dessins ne sont jamais touchés", /Retirer « Essai créé ici » \?/.test(await dialogue("retirer").innerText()) && /Les dessins ne sont jamais touchés/.test(await dialogue("retirer").innerText()) && (await ligne(ID_CREE).count()) === 1);
  await dialogue("retirer").locator("[data-admin-confirmer]").click();
  await ligne(ID_CREE).waitFor({ state: "detached" });
  check("retirée : plus dans la liste, plus reçue par les comptes", !(await servies()).includes(ID_CREE) && (await ligne(ID).count()) === 1);
  await context.close();

  // ——— 8. Anglais.
  const en = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "en-GB" });
  const p2 = await en.newPage();
  p2.setDefaultTimeout(30000);
  p2.on("pageerror", (e) => erreurs.push(e.message));
  const email2 = `extadmin-en-${Date.now()}@example.com`;
  await inscrireDansLaPage(p2, email2, "extensions-admin-ci-123", BASE);
  await p2.waitForURL(/\/(accueil|projets|home|projects)$/);
  await sql.query("UPDATE users SET platform_role = 'admin', totp_enabled_at = now() WHERE email = $1", [email2]);
  await sql.query("UPDATE sessions SET mfa_verified_at = now() + interval '1 second' WHERE user_id = (SELECT id FROM users WHERE email = $1)", [email2]);
  await p2.evaluate(() => window.localStorage.setItem("fadi.langue", "en"));
  await p2.goto(`${BASE}/extensions`);
  await p2.locator('[data-extensions-option="administration"]').click();
  await p2.locator("[data-admin-table]").waitFor();
  const texteEn = await p2.locator("[data-extensions-administration]").innerText();
  check("anglais : onglet, boutons, colonnes, origine et actions traduits", /what the platform offers to every account/.test(texteEn) && /\+ Create an add-on/.test(texteEn) && /Import a file…/.test(texteEn) && /INSTALLED BY DEFAULT/i.test(texteEn) && /Provided by Fadi: can be set, not edited/.test(texteEn) && /Imported/.test(await p2.locator(`[data-admin-extension="${ID}"]`).innerText()) && /Edit/.test(await p2.locator(`[data-admin-extension="${ID}"]`).innerText()), texteEn.slice(0, 200));
  await p2.screenshot({ path: join(OUT, "6-administration-anglais.png") });
  await en.close();
} finally {
  await nettoyer();
  // Les comptes de la recette ne restent pas administrateurs : la base sert aux recettes suivantes.
  await sql.query("UPDATE users SET platform_role = 'user', totp_enabled_at = NULL WHERE email LIKE 'extadmin-%@example.com'");
  await sql.end();
  await browser.close();
}

check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
if (echecs > 0) {
  console.error(`\n${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("\nRecette de l'administration des extensions : tout est conforme.");
