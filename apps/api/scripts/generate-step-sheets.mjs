#!/usr/bin/env node
/**
 * Génère les fiches de migration des 21 étapes (docs/migration/etapes/NN.md)
 * à partir des données extraites du prototype (apps/api/src/data), de
 * l'inventaire DOM relevé sur le prototype exécuté
 * (docs/migration/captures/reference/inventory*.json) et de l'état de
 * migration déclaré ci-dessous. Relancer après chaque tranche migrée :
 *
 *   node apps/api/scripts/generate-step-sheets.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const data = (name) => JSON.parse(readFileSync(join(here, "..", "src", "data", name), "utf8"));
const steps = data("parcours-steps.json").steps;
const forms = data("parcours-forms.json");
const example = data("examples/p118-exemple-complet.json");
const refDir = join(root, "docs/migration/captures/reference");
const webDir = join(root, "docs/migration/captures/webapp");
const inventory = JSON.parse(readFileSync(join(refDir, "inventory.json"), "utf8"));
const inventory2 = JSON.parse(readFileSync(join(refDir, "inventory-2.json"), "utf8"));
const outDir = join(root, "docs/migration/etapes");
mkdirSync(outDir, { recursive: true });

const pad2 = (n) => String(n).padStart(2, "0");
const TOOLED = { 1: "Outil Parcelle (iframe « Parcelle — Atelier satellite » : Leaflet, proj4, import KML/KMZ, MapTiler optionnel)", 10: "Atelier natif (3D, niveaux, créateur de vue, couches, exports PNG/SVG)", 11: "Atelier natif en plan orienté nord (coupes A–A / B–B, affichage objets / cotes)" };

/** Les données propres à chaque étape dans son empreinte de péremption (`fingerprintInner` de h7-app, porté dans `dependencies.ts`). */
function fingerprintScope(n) {
  if (n === 1) return "le site (parcelle, géolocalisation, données du site, type)";
  if (n <= 3) return "le site et le formulaire de l'étape" + (n === 2 ? " et les règles d'implantation (`setback`) de la parcelle" : "");
  if (n <= 6) return "le site, le type de bâtiment, le formulaire de l'étape et les besoins déclarés aux étapes 03–05";
  if (n === 7) return "le type, le cas de programme appliqué (sinon la répartition programmatique) et le formulaire de l'étape 06";
  if (n === 8) return "le cas de programme, le formulaire de l'étape et le site";
  if (n === 9) return "le site, le cas de programme, les règles (02) et le formulaire de l'étape";
  if (n === 10 || n === 11 || n === 13 || n === 16) return "le site, le cas de programme, le modèle dessiné (`floorDesign`, niveaux, emprise), les références directionnelles et le formulaire de l'étape";
  return "le type, le formulaire de l'étape, le cas de programme" + (n >= 19 ? " et la décision de l'étape 19" : "");
}
const FINGERPRINT = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [i + 1, fingerprintScope(i + 1)]));

/** État de migration par fonction, à la date de génération. */
function migrationStatus(n) {
  const rows = [];
  rows.push(["Vue d'ensemble → étape, précédente / suivante, « Marquer terminée »", "✅", "ParcoursModule.tsx ; e2e parcours-scenario.mjs"]);
  rows.push(["Harmonie · propositions A/B/C, Retenir / Adapter / Écarter / Traduire / Dessiner / Vérifier, intentions reçues, transmission", "✅", "HarmoniePanel.tsx ; règles serveur dans parcours-steps.ts (tests app.test.ts) ; moteur domain-model/harmonie.ts (tests)"]);
  rows.push(["Péremption « À réexaminer » (empreinte des données pertinentes de l'étape et des intentions reçues ; encart « Données pertinentes modifiées », chip « À réexaminer · choix conservé », « Source à réexaminer »), « Actualiser les propositions », « Rapport de cette étape » (Harmonie_Etape_" + pad2(n) + "_V7.html)", "✅", "domain-model/dependencies.ts et harmonie-report.ts (tests) ; lib/step-context.ts ; POST …/harmonie/generate, GET …/harmonie/rapport ; e2e 6e"]);
  if (n === 1) rows.push(["Propositions de site A/B/C calculées sur la parcelle (zonage 15/50/25/10 · 10/45/35/10 · 12/43/20/25 %, schéma SVG, légende, export, « Voir le schéma »), proposition de départ selon la priorité déclarée, données du site (côté d'approche, nature, priorité, contextes, source, note, repère WGS84)", "✅", "core-geometry/site-zoning.ts, domain-model/site.ts (tests) ; GET …/steps/1 (site), PUT …/steps/1/site (422 « Pour une approche documentée… ») ; SiteHarmonie.tsx ; e2e étape 01"]);
  if (n === 1) rows.push(["Fond MapTiler / altimétrie depuis le pli « Données du site » (« Afficher le fond MapTiler », « Collecter centre + sommets », « Connexion MapTiler »)", "✅ (service simulé dans le scénario e2e ; variante de site superposée au fond)", "MapTilerCard.tsx, lib/maptiler.ts ; PUT …/steps/1/site/elevation ; app.test.ts « offers A/B/C… » ; e2e 6c ; capture 01-desktop-maptiler.png"]);
  if (forms.schemas[String(n)]) rows.push([`Formulaire métier (${forms.schemas[String(n)].length} rubriques), sauvegarde, rechargement`, "✅", "StepForm.tsx ; PATCH /projects/:id/steps/:n (validation par type)"]);
  if (n === 21) rows.push(["Synthèse / livrable", "✅", "StepForm.tsx (champ summary)"]);
  if (n === 14) rows.push(["KPI Investissement / Financement / Solde et règle « Chiffrage incomplet »", "✅", "domain-model/kpis.ts (tests) ; e2e"]);
  if (n === 17) rows.push(["Note provisoire, Due diligence, Décision", "✅", "domain-model/kpis.ts ; StepForm.tsx"]);
  if (n === 19) rows.push(["Décision GO / GO sous conditions / À reprendre / NO GO ; rétrogradation en « À reprendre » sur intention amont modifiée", "✅", "parcours-steps.ts ; e2e"]);
  if (n === 6 || n === 7) rows.push(["Répartition programmatique (type, surface, fourchette, ratios, KPI, tableau, adjacences) ; « Répartition renseignée et liée au modèle » pour l'exemple", "✅", "ProgrammeRepartition.tsx ; PUT /projects/:id/programme ; domain-model/programme.ts (tests)"]);
  if (n === 10) rows.push(["Bloc « Programme transmis à l'Atelier »", "✅", "ProgrammeTransfer (ProgrammeRepartition.tsx)"]);
  if (n === 1) rows.push([TOOLED[1], "✅", "Document du prototype extrait tel quel (apps/web/scripts/extract-parcelle.mjs → public/parcelle), fichiers servis par Fadi au contrat natif de l'outil (routes/parcels.ts, révision par fichier, 409) ; e2e : fichier P.118 ouvert, « Mes parcelles » 1 345,55 m², borne modifiée"]);
  if (n === 1) rows.push(["Transmission parcelle → modèle (acceptParcel : lié / incomplet / invalide / conflit / conflit d'emprise / recul à recalculer)", "✅", "lib/parcel-transmission.ts ; POST …/parcels/:id/transmit ; e2e : borne déplacée → « Conflit avec le bâtiment dessiné », modèle non déplacé, retour → liée"]);
  if (n === 10 || n === 11) rows.push([TOOLED[n], "✅", "Atelier reconstruit sur le modèle typé (lot 4 DrawAll V4.1 : modules/atelier/nouveau, packages/atelier-model ; l'ancien moteur extrait est retiré, ses projets repris par la migration de bascule) ; commandes typées journalisées avec révision (atelier_commands, 409 détaillé), plan 2D, vue 3D three.js, niveaux, coupes et façades, exports DXF / SVG / CSV / PNG au catalogue ; référence protégée de l'exemple : première modification validée dans une copie de travail automatique ; e2e : dessin d'un mur → copie « P.118 — copie de travail · Atelier », +1 objet, annulation → −1, rechargement"]);
  if (n === 10 || n === 11) rows.push(["Propositions Harmonie LOCALES par local (lecture du modèle : surfaces, usages, capacités, ouvertures) ; proposition de départ C sur cas de densité (10)", "✅", "domain-model/model-analysis.ts (tests sur P.118) ; lib/model-context.ts ; HarmoniePanel.tsx ; e2e étape 10"]);
  if (n === 10) rows.push(["Sous-page « Harmonie du bâtiment » de l'Atelier (V8.4) : « Analyser → Harmonie » de la barre d'outils ou « ◈ Harmonie du bâtiment » ; rubriques Choix & intentions / Programme lié / Bilan & espaces ; « ← Retour à l’Atelier », Échap", "✅", "modules/atelier/AtelierHarmonyPage.tsx ; e2e étape 10 ; capture 10-desktop.png"]);
  if (n === 10 || n === 11) rows.push(["Bilan Harmonie du bâtiment conçu (flow-v62) : pli « Bilan Harmonie du bâtiment conçu · modèle … », bilan en ligne (Bilan du bâtiment, Plans & niveaux avec plan SVG, Locaux & Répartition, Hypothèses & MapTiler, Transmission), actions et réserves, audit des 14 transmissions, « Actualiser la revue de conception », « Exporter le bilan HTML » (Bilan_Harmonie_Batiment_V7.html), « Outils directionnels documentés » (références enregistrées, Gua et trame de période sous conditions), « Enregistrer comme observation déclarée » (contexte extérieur, 20 caractères minimum, réserve « Contexte extérieur non observé » levée avec géoréférencement), « Afficher le satellite » (3 × 3 tuiles autour du centre calculé, « Centre H-GEO », messages du prototype, rien n'est déduit de l'image) et « Collecter l'altitude indicative du centre » (service MapTiler, clé de l'utilisateur) ; la revue actualisée verse aussi une revue documentaire au dossier Harmony (`harmony.reviews`, analyse automatique, validation humaine non acquise)", "✅", "domain-model/design-review.ts et harmony-engine.ts (tests sur P.118 : entrée à 123,866°, 7 réserves ; observation déclarée ; revue documentaire) ; lib/design-context.ts ; GET/POST …/design-review, PUT …/observation ; modules/atelier/DesignReview.tsx ; lib/maptiler.ts (satellitePreview) ; e2e 6b' ; capture 10-desktop-bilan.png"]);
  if (n === 10 || n === 11) rows.push(["Liaison programme ↔ locaux dessinés (« Comparer au modèle » du bloc « Programme lié » → vue « Programme ↔ modèle dessiné »)", "✅", "ProgrammeLinks.tsx ; GET …/programme/model-links, POST/DELETE …/programme/case/links ; e2e 6g ; capture 07-desktop-modele.png"]);
  if (n <= 3) rows.push(["« Exemples · qualités du site par type de bâtiment » (phrase de site du profil, « Explorer la bibliothèque »)", "✅", "ProgrammeCase.tsx (SiteQualitiesFold) → /bibliotheque/batiments"]);
  else rows.push(["« Bibliothèque d’exemples par type de bâtiment » / « Programme lié » quand un cas est appliqué (textes générés dans cette étape, revues à reprendre)", "✅", "ProgrammeCase.tsx (LibraryFold, ProgrammeTransmission) ; POST …/programme/case ; e2e « étape 06 : pli… », « programme appliqué… »"]);
  if (n === 6 || n === 7) rows.push(["Répartition du dossier maître quand un cas est appliqué (révision, lignes modifiables, ratios par famille, décision à réexaminer, écarts, historique)", "✅", "ProgrammeCaseEditor (ProgrammeCase.tsx) ; PATCH …/programme/case/spaces/:id ; test « applies a variant… »"]);
  if (n === 6 || n === 7) rows.push(["« Comparer au modèle dessiné » (modelView / linkRoom : liaison par identifiant, une zone pour une ligne, surface dessinée, écart, délier) et « Hypothèses et validation » (hypothesisView : statut, responsable, preuve ; confirmation refusée sans preuve)", "✅", "ProgrammeLinks.tsx (?module=programmation&vue=modele | hypotheses) ; building-library.ts (linkProgrammeRoom, programmeModelLinks, setProgrammeHypothesis) ; app.test.ts « links programme lines… », « edits the applied case's hypotheses… » ; e2e 6g ; captures 07-desktop-modele.png, 07-desktop-hypotheses.png"]);
  if (n === 6 || n === 7) rows.push(["Référence protégée de l'exemple résolu (« Répartition renseignée et liée au modèle », pli « 74 fiches d’espaces — capacités, dimensions et ambiances choisies », « Exporter les fiches CSV », « Essayer une autre répartition en copie » → projet « P.118 — ma variante de l’exemple résolu »)", "✅", "ProgrammeRepartition.tsx (CaseSummary) ; POST /projects/:id/copies ; exampleRoomsHtml (design-review.ts) ; app.test.ts « “Essayer une autre répartition en copie”… » ; e2e 6g ; capture 07-desktop.png"]);
  if (n === 7) rows.push(["« Proposer un transfert surfacique à total constant » dans le panneau Harmonie (programmeTransferHTML / previewTransfer / applyTransfer : comparaison avant / après, application sur la même empreinte, révision +2, décision à réexaminer, toast)", "✅", "ProgrammeTransferFold.tsx ; POST …/programme/case/transfer/preview, POST …/programme/case/transfer ; app.test.ts « …previews / applies a surface transfer at constant total » ; e2e 6g ; capture 07-desktop-transfert.png"]);
  rows.push(["Sources de l'étape (importer, déposer, lister, télécharger, supprimer)", "✅", "StepSources.tsx ; routes/step-files.ts (table step_files, pièce jointe nosniff) ; e2e « sources : … »"]);
  rows.push(["Commentaires de l'étape (pli « Commentaires (n) » : auteur, date, réponses en fil, suppression par l'auteur) et rapport Harmonie de l'étape au catalogue des documents (production enregistrée, actualité)", "✅ (ajout Fadi : le prototype n'avait ni commentaires ni catalogue)", "modules/collaboration/CollaborationModule.tsx (StepComments) ; routes/collaboration.ts ; routes/documents.ts ; e2e 6i, 6j"]);
  rows.push(["Projet partagé : un lecteur consulte l'étape (valeurs, propositions, sources, commentaires) et commente, sans saisie, arbitrage, import ni « Marquer terminée » (contrôles inactifs, 403 motivé côté serveur) ; un éditeur modifie comme le propriétaire, les écritures simultanées sont sérialisées puis départagées par version (409) ; pendant une réservation d'édition par un autre compte, l'étape est en lecture et commentaires (423 motivé)", "✅ (ajout Fadi : le prototype n'avait qu'un utilisateur local)", "lib/access.ts (useProjectAccess), StepForm.tsx (fieldset), HarmoniePanel (pending), StepSources.tsx, components/EditingLockControl.tsx ; lib/owned-project.ts (need read / comment / write, activeLock) ; lib/step-rows.ts (lockProject) ; app.test.ts « Partage du projet… », « Verrou d'édition optionnel » ; e2e 6m"]);
  if (example.steps[String(n)]) rows.push(["Exemple P.118 : récit du choix, réponses renseignées, choix retenu", "✅", "Import p118-exemple-complet ; test « imports an example… »"]);
  return rows;
}

function listButtons(inv) {
  return [...new Set(inv.buttons)].filter((b) => !["←", "⌂"].includes(b)).join(" · ");
}

for (const s of steps) {
  const n = s.number;
  const schema = forms.schemas[String(n)];
  const refNew = inventory2.newSteps?.[String(n)];
  const refResolved = inventory["steps-desktop"]?.[String(n)];
  const exampleStep = example.steps[String(n)];
  const business = example.business[String(n)] ?? {};
  const webShots = ["desktop", "mobile"].map((v) => `${pad2(n)}-${v}.png`).filter((f) => existsSync(join(webDir, f)));
  const webNewShots = [`new-${pad2(n)}-desktop.png`, `new-${pad2(n)}-desktop-harmonie.png`, `new-${pad2(n)}-desktop-after-input.png`, `new-${pad2(n)}-desktop-complete.png`, `new-${pad2(n)}-mobile.png`, `new-${pad2(n)}-desktop-programme-applique.png`, `${pad2(n)}-desktop-modele.png`, `${pad2(n)}-desktop-hypotheses.png`, `${pad2(n)}-desktop-transfert.png`, `${pad2(n)}-desktop-bilan.png`, `${pad2(n)}-desktop-reexaminer.png`, `${pad2(n)}-desktop-sources.png`].filter((f) => existsSync(join(webDir, f)));

  const md = [];
  md.push(`# Étape ${pad2(n)} — ${s.title}`);
  md.push("");
  md.push(`**Phase :** ${s.phase} · **Périmètre Harmonie :** ${s.scope ?? "—"} · **Clé interne :** \`${s.key ?? "—"}\``);
  md.push("");
  md.push(`Fiche générée par \`apps/api/scripts/generate-step-sheets.mjs\` depuis les données extraites du prototype et l'inventaire DOM relevé sur le prototype exécuté (\`captures/reference/inventory*.json\`). Les valeurs citées sont celles du fichier de référence, pas des interprétations.`);
  md.push("");
  md.push("## Objet de l'étape (registre h7-stage-data)");
  md.push("");
  md.push(`- **Objectif :** ${s.goal ?? "—"}`);
  md.push(`- **Entrées :** ${s.inputs ?? "—"}`);
  md.push(`- **Livrable :** ${s.deliverable ?? "—"}`);
  md.push(`- **Méthode :** ${s.method ?? "—"}`);
  md.push(`- **Transmet ses intentions retenues aux étapes :** ${s.transmitsTo.map(pad2).join(", ") || "aucune (dernière étape)"}`);
  md.push("");
  md.push("## Écrans et sous-écrans");
  md.push("");
  md.push("1. Vue d'ensemble (grille des 21 étapes, 3 colonnes ; 1 colonne sur téléphone) → clic sur la carte.");
  md.push(`2. Vue de l'étape (\`study()\`) : en-tête « ÉTAPE ${pad2(n)} / 21 · ${s.phase} », titre, phrase d'introduction, ${n === 10 ? "sous-page « Harmonie du bâtiment » (panneau Harmonie, programme lié, bilan du bâtiment), " : "panneau Harmonie, "}${TOOLED[n] ? TOOLED[n].split(" (")[0] : schema ? "formulaire métier" : "synthèse"}${n === 6 || n === 7 ? ", répartition programmatique (ou répartition du dossier maître quand un cas de la bibliothèque est appliqué)" : ""}${n === 10 ? ", bloc « Programme transmis à l'Atelier » / « Programme lié »" : ""}, ${n <= 3 ? "pli « Exemples · qualités du site par type de bâtiment »" : "pli « Bibliothèque d’exemples par type de bâtiment » (ou bloc « Programme lié »)"}, sources de l'étape, commentaires de l'étape (ajout Fadi), navigation.`);
  if (n === 1) md.push("3. Sous-écrans de l'outil Parcelle : Mes parcelles, Données du fichier, Parcelle, Construction, Voirie, Distances réglementaires, Système de coordonnées, Export.");
  if (n === 10 || n === 11) md.push("3. Sous-écrans de l'Atelier : menus Niveau / Vue / Mode / Dessins techniques, créateur de vue, affichage, couches, exports.");
  md.push("");
  md.push("## Données d'entrée et valeurs initiales");
  md.push("");
  if (schema) {
    md.push(`Formulaire métier (\`BIZ_SCHEMAS[${n}]\`) — intro : « ${forms.intro[String(n)]} ». Valeur initiale : vide (placeholder « À documenter… »), jamais 0.`);
    md.push("");
    md.push("| Clé | Intitulé | Type | Réponse de l'exemple P.118 (début) |");
    md.push("|---|---|---|---|");
    for (const f of schema) md.push(`| \`${f.key}\` | ${f.label} | ${f.type} | ${String(business[f.key] ?? "—").replace(/\|/g, "\\|").slice(0, 90)}${String(business[f.key] ?? "").length > 90 ? "…" : ""} |`);
    if (n === 19) md.push("| `decision` | Décision | choix | " + (business.decision ?? "—") + " |");
  } else if (TOOLED[n]) {
    md.push(`${TOOLED[n]}. ${n === 1 ? "Entrée : fichier KML/KMZ/JSON de parcelle ; P.118 : 4 bornes B.266 → B.267 → B.268 → B.265 (EPSG:26191), surface Lambert 1 345,55 m², contenance 1 346 m²." : "Entrée : le modèle natif du projet (6 niveaux, 1 753 objets pour P.118)."}`);
    if (business.summary) md.push("", `Synthèse de l'exemple : ${business.summary.slice(0, 300)}…`);
  } else {
    md.push(`Champ « ${forms.summary.field.label} » (clé \`summary\`), intro : « ${forms.summary.intro} ».`);
  }
  if (n === 6 || n === 7) md.push("", "Répartition programmatique : type `tertiaire`, surface de référence 673 m², position « Cible », ratios circulation 15 % · technique 6 % · sanitaires 2 % · accueil/convivialité 5 % (fourchettes par type dans `programme-repartition.json`).");
  md.push("");
  md.push("## Composants visuels et actions (prototype exécuté)");
  md.push("");
  if (refNew) {
    md.push(`Projet vierge (\`inventory-2.json\`, ${refNew.fields.length} champs, ${refNew.buttons.length} boutons, ${refNew.details.length} sections repliables, ${refNew.tables.length} tableau(x)) :`);
    md.push("");
    md.push(`- Titres : ${refNew.headings.join(" · ")}`);
    md.push(`- Boutons : ${listButtons(refNew)}`);
    md.push(`- Sections repliables : ${refNew.details.map((d) => d.summary).join(" · ")}`);
    if (refNew.kpis?.length) md.push(`- Indicateurs : ${refNew.kpis.join(" · ")}`);
    if (refNew.tables?.length) md.push(`- Tableaux : ${refNew.tables.map((t) => t.headers.join(" / ") + ` (${t.rows} lignes)`).join(" ; ")}`);
  } else {
    md.push("Projet vierge : même structure que les étapes capturées (`new-02`, `new-06`, `new-14`…) — Harmonie + formulaire métier ; pas de capture dédiée (déduit de `content()` et `BIZ_SCHEMAS`).");
  }
  if (refResolved) {
    md.push("", `Exemple résolu (\`inventory.json\`) : titres ${refResolved.headings.join(" · ")} ; sections ${refResolved.details.map((d) => d.summary).join(" · ")}.`);
  }
  md.push("");
  md.push("## Événements, validations, calculs");
  md.push("");
  md.push("- Saisie d'un champ → sauvegarde immédiate (`change` dans le prototype ; `blur` dans Fadi, PATCH validé par type côté serveur).");
  md.push("- Harmonie : « Retenir » remplace toute autre variante retenue (« Variante remplacée par … ») ; « Adapter / motiver » et « Écarter avec motif » exigent 8 caractères ; traduire / dessiner / vérifier exigent responsable + preuve ; « Dessinée » seulement dès l'étape 10 ; une intention retenue remet à faire les étapes cibles et rétrograde un GO pris à l'étape 19.");
  md.push("- Péremption : l'empreinte de l'étape couvre " + FINGERPRINT[n] + ", plus les intentions reçues (version d'arbitrage, péremption de l'origine) ; si elle change après la génération, l'étape est « à réexaminer » (choix conservés, vérification refusée jusqu'à « Actualiser les propositions ») et chaque choix retenu sur une autre empreinte affiche « À réexaminer · choix conservé » jusqu'à « Confirmer ce choix ».");
  md.push("- « Marquer terminée » bascule l'état ; la progression (n / 21) ne compte que les étapes marquées terminées.");
  if (n === 14) md.push("- KPI finance : Investissement = f1+…+f6 ; Financement = f9+f10 ; Solde = Financement − Investissement ; non calculés tant qu'un des huit postes manque (« Une valeur inconnue n'est pas zéro »).");
  if (n === 17) md.push("- Note provisoire = moyenne des critères f1–f8 compris entre 1 et 5 ; « Due diligence » = Réserves si 16.f10 est rempli ; « Décision » = 19.decision ou « Non prise ».");
  if (n === 19) md.push("- Décision parmi GO / GO sous conditions / À reprendre / NO GO.");
  if (n === 6 || n === 7) md.push("- Répartition : ratio = valeur forcée ou fourchette[position] ; surface famille = référence × ratio ; support = Σ ratios ; solde programmable = max(0, 100 − support).");
  if (n === 6 || n === 7) md.push("- Liaison programme ↔ modèle : par identifiant de zone, jamais par nom ; une zone ne peut pas être affectée à deux lignes (« Zone déjà affectée à une autre ligne ») ; zone inconnue → « Zone absente du modèle » ; écart = surface dessinée − cible ; chaque liaison avance la révision du cas et met à jour la fiche Harmony du local (type, cible, cas).");
  if (n === 6 || n === 7) md.push("- Hypothèses : « Confirmée par preuve » et « Écartée avec motif » exigent responsable et preuve / motif (« Renseignez d’abord responsable et preuve / motif. »), sans changer la révision.");
  if (n === 7) md.push("- Transfert surfacique : deux fiches distinctes, surface positive disponible, justification ≥ 8 caractères ; l'application exige l'empreinte des fiches calculée à l'aperçu (« Le programme a changé. Recalculez la comparaison. ») et recalcule deux surfaces unitaires (révision +2, revues à reprendre, décision à réexaminer) ; total du programme inchangé, géométrie conservée.");
  md.push("");
  md.push("## Données enregistrées");
  md.push("");
  md.push("- Prototype : `localStorage.potentiel-v3.projects[].data.business[" + n + "]`, `.harmonieEtapesV7.stages[" + n + "]`, `.done[" + n + "]`" + (n === 6 || n === 7 ? ", `.programmeRepartition`, `.programmeCase` (roomLinks, hypotheses), `.harmony.roomData`" + (n === 7 ? ", `.programmeTransfers`" : "") : "") + ".");
  md.push("- Fadi : table `project_steps` (`status`, `content.fields`, `content.harmonie`)" + (n === 6 || n === 7 ? ", table `programme_repartitions`, table `programme_cases` (révisions, `roomLinks`, `hypotheses`), `projects.harmony.roomData`, `projects.programme_state`" + (n === 7 ? " (`transfers`)" : "") : "") + (TOOLED[n] && n !== 1 ? ", tables `levels` et `architectural_objects`" : "") + ".");
  md.push("");
  md.push("## Harmonie");
  md.push("");
  if (s.harmonieOptions.length) {
    md.push(`Périmètre « ${s.scope} ». Propositions (texte intégral dans \`parcours-steps.json\`) :`);
    md.push("");
    s.harmonieOptions.forEach((o, i) => md.push(`- **${"ABC"[i]} · ${o.title}** — ${o.proposal}`));
    if (exampleStep?.choice) md.push("", `Exemple P.118 : choix **${exampleStep.choice}** retenu — « ${exampleStep.headline} ».`);
  } else {
    md.push("Périmètre « Site et paysage ». Propositions de site A / B / C calculées sur la géométrie de la parcelle (`siteOptions()` de h7-app, porté dans `packages/domain-model/src/site.ts`) :");
    md.push("");
    md.push("- **A · Accueil ouvert, jardin en retrait** — zonage 15 % accueil / 50 % secteur d'implantation à étudier / 25 % espace ouvert / 10 % desserte.");
    md.push("- **B · Extérieur protégé prioritaire** — 10 / 45 / 35 / 10 %.");
    md.push("- **C · Arrivées et desserte dissociées** — 12 / 43 / 20 / 25 %.");
    md.push("");
    md.push("Le côté d'approche (choisi dans « Données du site », sinon premier côté en repère provisoire), le contexte arrière et l'altimétrie alimentent « Pourquoi ici » ; la proposition de départ suit la priorité déclarée (équilibrée → A, retrait ou façade exposée → B, séparation des mouvements → C). Sans contour polygonal valide en mètres : aucun schéma, aucune parcelle de remplacement.");
    if (exampleStep?.choice) md.push("", `Exemple P.118 : choix **${exampleStep.choice}** retenu — « ${exampleStep.headline} » ; données du site importées (approche B.265 → B.266 hypothétique, contexte avant ouvert, arrière végétation).`);
  }
  md.push("");
  md.push("## Scénarios de test");
  md.push("");
  md.push("- `apps/api/src/app.test.ts` : « serves each step with the prototype's real form… », « stores form answers… », « applies the Harmonie rules server-side… », « exposes the programme repartition… », « imports an example… ».");
  md.push("- `apps/web/e2e/parcours-scenario.mjs` : scénario rejoué sur le prototype puis sur Fadi (voir docs/migration/reference.md, « Écran d'étape réel »).");
  if (n === 1) md.push("- Étape 01 (e2e) : projet vierge → 3 propositions sans schéma ; exemple → fichier P.118 ouvert dans l'outil, « Mes parcelles » 1 345,55 m², schéma A et légende 15/50/25/10 %, borne déplacée → « Conflit avec le bâtiment dessiné » sans déplacer le modèle, borne rétablie → liée, priorité « Séparation des mouvements » → départ C, approche documentée sans source → refus, « Voir le schéma » C.");
  md.push("");
  md.push("## Captures");
  md.push("");
  md.push(`- Référence : \`captures/reference/${pad2(n)}-desktop.png\`, \`captures/reference/${pad2(n)}-mobile.png\`${existsSync(join(refDir, `new-${pad2(n)}-desktop.png`)) ? `, \`captures/reference/new-${pad2(n)}-desktop.png\`` : ""}${existsSync(join(refDir, `new-${pad2(n)}-desktop-expanded.png`)) ? `, \`captures/reference/new-${pad2(n)}-desktop-expanded.png\`` : ""}`);
  md.push(`- Fadi : ${[...webShots, ...webNewShots].length ? [...webShots, ...webNewShots].map((f) => `\`captures/webapp/${f}\``).join(", ") : "pas de capture dédiée (parcours de l'e2e)"}`);
  md.push("");
  md.push("## État de migration");
  md.push("");
  md.push("| Fonction | État | Preuve / reste à faire |");
  md.push("|---|---|---|");
  for (const [f, st, note] of migrationStatus(n)) md.push(`| ${f} | ${st} | ${note} |`);
  md.push("");
  writeFileSync(join(outDir, `${pad2(n)}.md`), md.join("\n"));
}
console.log(`21 fiches écrites dans ${outDir}`);
