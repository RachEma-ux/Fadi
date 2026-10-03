/**
 * Exemple résolu P.118 — `budgetHTML(p)` et `fullReport(p)` de
 * p118-resolved-app (Parcours V8.19) : le budget du scénario (référence et
 * scénario défavorable, calculé sur les réponses des étapes 14 et 15) et le
 * « Dossier complet de l’exemple » (`P118_Exemple_Resolu_V8_19.html`) :
 * critères de choix, complétude et transmission, réponses aux 21 étapes
 * avec leurs intentions reçues et choix transmis, budget, bilan du bâtiment
 * dessiné (escalier B et mezzanine, escalier A, sanitaires, réserves et
 * réponses, lecture par niveau), registre des hypothèses.
 *
 * Moteur pur : tout est passé en entrée (réponses, propositions, analyse du
 * modèle, fiches, hypothèses, feuille `ex81-css` extraite telle quelle) ;
 * rien n'est lu ni inventé ici. Les textes propres à P.118 (source du modèle,
 * méthode, limites) sont ceux du prototype : ce dossier n'existe que pour
 * les projets issus de l'exemple.
 */
import type { FieldValues } from "./kpis.js";
import { escapeHtml as esc } from "./harmonie-report.js";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `num(n, d)` du prototype : nombre en français, sinon « Non applicable ». */
export const exampleNum = (n: unknown, d = 2): string => (Number.isFinite(Number(n)) && n !== null && n !== "" ? Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d }) : "Non applicable");

function finite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// --- Budget du scénario (`money(p)`) ----------------------------------------

export interface ExampleBudget {
  /** Investissement : somme des six postes de l'étape 14 (f1–f6). */
  capex: number;
  /** Financement disponible (hypothèse) : fonds propres + dette (f9 + f10). */
  fund: number;
  gap: number;
  income: number;
  opex: number;
  margin: number;
  stressCapex: number;
  stressGap: number;
  stressIncome: number;
  stressOpex: number;
  stressMargin: number;
  /** Choc de taux (points, étape 15 f5) appliqué à la dette : majorant simplifié annuel. */
  interestShock: number;
}

/** Postes de l'étape 14 (montants) et taux de l'étape 15 nécessaires au calcul. */
export const EXAMPLE_BUDGET_KEYS_14 = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10"] as const;
export const EXAMPLE_BUDGET_KEYS_15 = ["f1", "f2", "f3", "f4", "f5"] as const;

/**
 * `money(p)` : référence et scénario défavorable (hausse CAPEX, variation
 * OPEX, baisse des loyers, vacance, choc de taux de l'étape 15). `null` tant
 * qu'un poste manque ou n'est pas un nombre : une valeur inconnue n'est pas
 * zéro (le prototype affichait alors « Non applicable » cellule par cellule).
 */
export function exampleBudget(fields14: FieldValues, fields15: FieldValues): ExampleBudget | null {
  const d: Record<string, number> = {};
  for (const k of EXAMPLE_BUDGET_KEYS_14) {
    const n = finite(fields14[k]);
    if (n === null) return null;
    d[k] = n;
  }
  const t: Record<string, number> = {};
  for (const k of EXAMPLE_BUDGET_KEYS_15) {
    const n = finite(fields15[k]);
    if (n === null) return null;
    t[k] = n;
  }
  const capex = d["f1"]! + d["f2"]! + d["f3"]! + d["f4"]! + d["f5"]! + d["f6"]!;
  const fund = d["f9"]! + d["f10"]!;
  const stressCapex = capex * (1 + t["f1"]! / 100);
  const stressIncome = d["f8"]! * (1 - t["f3"]! / 100) * (1 - t["f4"]! / 100);
  const stressOpex = d["f7"]! * (1 + t["f2"]! / 100);
  return {
    capex,
    fund,
    gap: fund - capex,
    income: d["f8"]!,
    opex: d["f7"]!,
    margin: d["f8"]! - d["f7"]!,
    stressCapex,
    stressGap: fund - stressCapex,
    stressIncome,
    stressOpex,
    stressMargin: stressIncome - stressOpex,
    interestShock: (d["f10"]! * t["f5"]!) / 100,
  };
}

/** Les postes manquants qui empêchent le calcul (libellés des clés), pour le dire plutôt que d'afficher zéro. */
export function exampleBudgetMissing(fields14: FieldValues, fields15: FieldValues): { step: 14 | 15; key: string }[] {
  const out: { step: 14 | 15; key: string }[] = [];
  for (const k of EXAMPLE_BUDGET_KEYS_14) if (finite(fields14[k]) === null) out.push({ step: 14, key: k });
  for (const k of EXAMPLE_BUDGET_KEYS_15) if (finite(fields15[k]) === null) out.push({ step: 15, key: k });
  return out;
}

export const EXAMPLE_BUDGET_NOTE = "Calculs sur hypothèses fictives, en MAD ; ni devis, ni offre de crédit, ni engagement.";

/** Lignes du tableau Indicateur / Référence / Scénario défavorable (`budgetHTML`). */
export function exampleBudgetRows(m: ExampleBudget): [string, number, number][] {
  return [
    ["Investissement", m.capex, m.stressCapex],
    ["Financement disponible (hypothèse)", m.fund, m.fund],
    ["Solde de financement", m.gap, m.stressGap],
    ["Recettes annuelles", m.income, m.stressIncome],
    ["OPEX annuels", m.opex, m.stressOpex],
    ["Solde opérationnel avant dette / impôt", m.margin, m.stressMargin],
  ];
}

/** « Décision du cas » sous le tableau (`budgetHTML`). */
export function exampleBudgetDecision(m: ExampleBudget): string {
  return `le stress de CAPEX crée ${exampleNum(Math.abs(m.stressGap))} MAD de besoin additionnel ; pas de GO travaux sans nouvelle décision. Le chantier n’est pas autorisé par le scénario de référence.`;
}

function table(heads: string[], rows: string[]): string {
  return `<div class="ex81-table"><table><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

export function exampleBudgetHtml(m: ExampleBudget): string {
  return `<p class="ex81-note">${EXAMPLE_BUDGET_NOTE}</p>${table(
    ["Indicateur", "Référence", "Scénario défavorable"],
    exampleBudgetRows(m).map(([k, a, b]) => `<tr><td>${esc(k)}</td><td>${exampleNum(a)} MAD</td><td>${exampleNum(b)} MAD</td></tr>`),
  )}<p><b>Décision du cas :</b> ${esc(exampleBudgetDecision(m))}</p>`;
}

// --- Dossier complet (`fullReport(p)`) ---------------------------------------

export interface ExampleReportIncoming {
  origin: number;
  /** « NN · Intitulé de l'étape » (bouton `goto` du prototype, lien figé dans le dossier). */
  originLabel: string;
  /** `qref(q)` : HNN-K. */
  ref: string;
  text: string;
  originStale: boolean;
}

export interface ExampleReportChosen {
  ref: string;
  text: string;
  /** Destinations (`targets`) : « NN · Intitulé ». */
  targets: string[];
}

export interface ExampleReportTrace {
  stage: number;
  incoming: ExampleReportIncoming[];
  chosen: ExampleReportChosen[];
}

export interface ExampleReportStep {
  number: number;
  title: string;
  headline: string;
  decision: string;
  why: string;
  alternatives: string;
  /** `answerHTML` : intitulé → valeur affichée (nombres en français, « Non applicable au scénario retenu. » pour un vide). */
  answers: { label: string; value: string }[];
  trace: ExampleReportTrace;
  /** `audit(p).transfers` : choix retenus, entrées, péremption. */
  retained: number;
  stale: boolean;
}

/** Blocs `floorDesign.meta` du modèle V8.19 lus par `layoutHTML` / `stairHTML` / `servicesHTML` (données déclarées du modèle, jamais recalculées). */
export interface ExampleLayoutMeta {
  choice?: string;
  scope?: string;
  status?: string;
  detailSvg?: string;
  areas?: { mezzNetBefore?: number; mezzNetAfter?: number; mezzNetGain?: number };
  assumptions?: string[];
  roomChanges?: { level?: string; name?: string; before?: number; after?: number }[];
  issues?: string[];
  sourceFiles?: string[];
}
export interface ExampleStairMeta {
  choice?: string;
  status?: string;
  detailSvg?: string;
  rows?: { from?: string; to?: string; rise?: number; riser?: number }[];
  assumptions?: string[];
  issues?: string[];
  sources?: { id?: string; url?: string; file?: string; use?: string }[];
}
export interface ExampleServicesMeta {
  pause?: string;
  issues?: string[];
}
export interface ExampleSanitaryMeta {
  status?: string;
  choice?: string;
  populationNote?: string;
  capacityNote?: string;
  surfacesNote?: string;
  rows?: { name?: string; occupancy?: { people?: number }; blocks?: { wc?: number; basins?: number }[]; net?: number }[];
  detailPlans?: { svg?: string }[];
  issues?: string[];
  roomChanges?: { level?: string; name?: string; before?: number; after?: number }[];
  sources?: { id?: string; url?: string; file?: string; use?: string }[];
}

export interface ExampleReportBuilding {
  /** Étape 10 du récit : titre et décision. */
  headline: string;
  decision: string;
  footprint: number | null;
  roomCount: number;
  roomArea: number | null;
  layout: ExampleLayoutMeta | null;
  stair: ExampleStairMeta | null;
  services: ExampleServicesMeta | null;
  sanitary: ExampleSanitaryMeta | null;
  trace: ExampleReportTrace;
  /** Réserves de l'analyse (`analyse(p).issues`) et réponse retenue par identifiant (`issueAnswers`). */
  issues: { id: string; title: string; body: string }[];
  issueAnswers: Record<string, string>;
  /** Lecture par niveau : plan SVG (`svgPlan`) et fiches (`roomsHTML(p, level)`), déjà composés. */
  floors: { name: string; rooms: number | null; planSvg: string; roomsHtml: string }[];
}

export interface ExampleReportInput {
  projectName: string;
  /** `D.criteria` de l'exemple. */
  criteria: string[];
  audit: { fields: number; filled: number; linkedSpaces: number; stageCount: number; areaDelta: number };
  steps: ExampleReportStep[];
  budget: ExampleBudget | null;
  building: ExampleReportBuilding | null;
  /** `D.assumptions` : référence, titre, réponse de travail, portée. */
  assumptions: { id: string; title: string; value: string; status: string }[];
  /** Feuille `ex81-css` du prototype, extraite telle quelle. */
  css: string;
}

export const EXAMPLE_REPORT_FILE_NAME = "P118_Exemple_Resolu_V8_19.html";

/** `traceHTML(p, id)` du prototype, les boutons `goto` figés en liens de dossier (`exportBody`). */
export function exampleTraceHtml(t: ExampleReportTrace): string {
  const link = (label: string) => `<span class="ex81-report-link">${esc(label)}</span>`;
  const incoming = t.incoming.length
    ? table(
        ["Origine", "Choix transmis", "État"],
        t.incoming.map((q) => `<tr><td>${link(q.originLabel)}<small>${esc(q.ref)}</small></td><td>${esc(q.text)}</td><td>${q.originStale ? "À réexaminer après modification" : "Retenu dans le scénario"}</td></tr>`),
      )
    : `<p class="ex81-note">${
        t.stage === 1
          ? "Point de départ : le choix du site ne reçoit pas une intention d’un bâtiment déjà distribué. L’organisation du terrain est renseignée ci-dessus."
          : "Aucune transmission ciblée pour cet état de votre adaptation ; le scénario de référence en contient une. Aucun choix nouveau n’est imposé."
      }</p>`;
  const chosen = table(
    ["Référence", "Réponse retenue", "Destinations"],
    t.chosen.map((q) => `<tr><td>${esc(q.ref)}</td><td>${esc(q.text)}</td><td>${q.targets.map(link).join(" ") || "Équipe de conception détaillée — dossier préparé"}</td></tr>`),
  );
  return `<h3>Intentions reçues et utilisées</h3>${incoming}<h3>Choix déjà transmis</h3>${chosen}`;
}

function answersHtml(answers: readonly { label: string; value: string }[]): string {
  return `<dl class="ex81-answers">${answers.map((a) => `<div><dt>${esc(a.label)}</dt><dd>${esc(a.value)}</dd></div>`).join("")}</dl>`;
}

function sourcesTable(sources: readonly { id?: string; url?: string; file?: string; use?: string }[]): string {
  return table(["Source", "Portée"], sources.map((x) => `<tr><td>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.id)}</a>` : esc(x.file)}</td><td>${esc(x.use)}</td></tr>`));
}

/** `layoutHTML(p)` : escalier B, mezzanine et porte X · V8.19. */
export function exampleLayoutHtml(n: ExampleLayoutMeta | null): string {
  if (!n) return "";
  return (
    `<details class="ex81-fold" open><summary>Escalier B, mezzanine et porte X · V8.19</summary><p>${esc(n.choice)}</p><p>${esc(n.scope)}</p><p><strong>${esc(n.status)}</strong></p>${n.detailSvg ?? ""}` +
    table(["Dalle mezzanine", "Avant", "Après", "Gain"], [`<tr><td>Surface nette géométrique</td><td>${exampleNum(n.areas?.mezzNetBefore)} m²</td><td>${exampleNum(n.areas?.mezzNetAfter)} m²</td><td>+${exampleNum(n.areas?.mezzNetGain)} m²</td></tr>`]) +
    `<h3>Interprétation des annotations</h3><ul>${(n.assumptions ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><h3>Incidences sur les locaux</h3>` +
    table(["Niveau", "Local", "Avant", "Après"], (n.roomChanges ?? []).map((r) => `<tr><td>${esc(r.level)}</td><td>${esc(r.name)}</td><td>${exampleNum(r.before)} m²</td><td>${exampleNum(r.after)} m²</td></tr>`)) +
    `<h3>Vérifications et réserves</h3><p>26 contrôles géométriques ciblés réussis : murs / volées / paliers, trémies, mobilier, surfaces et bandes de circulation de 1,20 m. Échappée minimale entre les volées basses superposées : 2,875 m sur la représentation, hors équipements et finitions. Ces contrôles ne constituent pas une validation réglementaire.</p><p>Trémie basse B superposée entre RDC et mezzanine, arrivée raccordée à la galerie, cage au RDC hors mobilier et dans l’emprise. Surfaces et programme recalculés depuis les polygones. La porte X est un objet natif hébergé par le mur de séparation.</p><ul>${(n.issues ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p>Sources : ${(n.sourceFiles ?? []).map(esc).join(" · ")}</p></details>`
  );
}

/** `stairHTML(p)` : escalier A autour de l’ascenseur · V8.18. */
export function exampleStairHtml(n: ExampleStairMeta | null): string {
  if (!n) return "";
  return (
    `<details class="ex81-fold" open><summary>Escalier A autour de l’ascenseur · V8.18</summary><p>${esc(n.choice)}</p><p><strong>${esc(n.status)}</strong></p>${n.detailSvg ?? ""}` +
    table(
      ["Liaison", "Hauteur", "Contremarches", "Hauteur de marche", "Giron", "Paliers"],
      (n.rows ?? []).map((r) => `<tr><td>${esc(`${r.from} → ${r.to}`)}</td><td>${exampleNum(r.rise)} m</td><td>7 + 9 + 7</td><td>${exampleNum(r.riser === undefined ? undefined : r.riser * 100, 2)} cm</td><td>32 / 31,25 / 32 cm</td><td>1,50 × 1,50 m</td></tr>`),
    ) +
    `<p>Gaine et cinq réservations d’ascenseur alignées. Cinq trémies d’escalier en U. Au R+3, les pointillés du plan représentent la montée depuis le R+2 ; le volume entrant appartient au niveau inférieur.</p><h3>Hypothèses et vérifications</h3><ul>${(n.assumptions ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p>Contrôles effectués : raccordements des trois volées aux paliers, hauteurs cumulées entre niveaux, girons, alignement des réservations, dégagement devant l’ascenseur, absence de collision avec la gaine, les façades et les services conservés. Échappée entre volées superposées vérifiée avec la paillasse de représentation ; réception technique non effectuée.</p><h3>Points à finaliser</h3><ul>${(n.issues ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>${sourcesTable(n.sources ?? [])}</details>`
  );
}

/** `servicesHTML(p)` : sanitaires redessinés · revue V8.17 (et monte-charge conservé, V8.15). */
export function exampleServicesHtml(v: ExampleServicesMeta | null, san: ExampleSanitaryMeta | null): string {
  if (!v || !san) return "";
  return (
    `<details class="ex81-fold"><summary>Sanitaires redessinés · revue V8.17</summary><p><strong>${esc(san.status)}</strong></p><p>${esc(san.choice)}</p><h3>Effectifs et appareils dessinés</h3><p>${esc(san.populationNote)}</p>` +
    table(
      ["Niveau", "Personnes", "WC F / H", "Dont adaptés", "Urinoirs", "Lavabos", "Surface utile"],
      (san.rows ?? []).map(
        (r) =>
          `<tr><td>${esc(r.name)}</td><td>${esc(r.occupancy?.people)}</td><td>${esc(r.blocks?.[0]?.wc)} / ${esc(r.blocks?.[1]?.wc)}</td><td>2</td><td>1</td><td>${(r.blocks ?? []).reduce((n, b) => n + (b.basins ?? 0), 0)}</td><td>${Number.isFinite(r.net) ? (r.net as number).toFixed(2) : "Non applicable"} m²</td></tr>`,
      ),
    ) +
    `<p>${esc(san.capacityNote)}</p><p>${esc(san.surfacesNote)}</p><h3>Dessin et contrôles</h3><p>Cabines séparées des espaces de lavage ; WC adaptés et barres d’appui ; urinoirs protégés par un écran ; gaines GT-F / GT-H alignées. Les calques « Gabarits accès », « Cotes sanitaires » et « Réseaux sanitaires » sont consultables dans le dessin.</p><p>Manœuvre 1,50 × 1,50 m et transfert 0,90 × 1,50 m contrôlés contre les parois et appareils dessinés. Un tracé libre de 0,90 m jusqu’à chaque cabine adaptée et l’écran des urinoirs depuis les baies d’entrée ont aussi été vérifiés. Ces contrôles géométriques ne constituent pas une conformité globale.</p><h3>Plans de détail issus de la révision V8.17</h3><p>Plans de référence au moment du redessin ; les modifications ultérieures restent visibles dans les vues natives de l’Atelier.</p>${(san.detailPlans ?? []).map((p) => `<figure style="margin:16px 0;max-width:760px">${p.svg ?? ""}</figure>`).join("")}<h3>Points à coordonner</h3><ul>${(san.issues ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><h3>Incidence sur les locaux voisins</h3>` +
    table(["Niveau", "Local", "Avant", "Après"], (san.roomChanges ?? []).map((c) => `<tr><td>${esc(c.level)}</td><td>${esc(c.name)}</td><td>${Number.isFinite(c.before) ? (c.before as number).toFixed(2) : "Non applicable"} m²</td><td>${Number.isFinite(c.after) ? (c.after as number).toFixed(2) : "Non applicable"} m²</td></tr>`)) +
    `<h3>Monte-charge conservé</h3><p>MC-01 : six arrêts ; gaine extérieure 2,80 × 3,20 m, réservation 2,40 × 2,80 m et porte palière 1,40 m. ${esc(v.pause)}</p><ul>${(v.issues ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><h3>Sources inspectées et hypothèses</h3>${sourcesTable(san.sources ?? [])}</details>`
  );
}

/** `buildingHTML(p, true)` : le bilan Harmonie du bâtiment dessiné de l'exemple. */
export function exampleBuildingHtml(b: ExampleReportBuilding): string {
  return (
    `<section class="ex81-block"><span class="ex81-tag">BILAN HARMONIE · BÂTIMENT DESSINÉ</span><h2>${esc(b.headline)}</h2><p>${esc(b.decision)}</p>` +
    `<div class="ex81-kpis"><div><b>${exampleNum(b.footprint)} m²</b>Emprise du modèle</div><div><b>${b.roomCount} zones</b>Liées au programme</div><div><b>${exampleNum(b.roomArea)} m²</b>Polygones de zones</div></div>` +
    exampleLayoutHtml(b.layout) +
    exampleStairHtml(b.stair) +
    exampleServicesHtml(b.services, b.sanitary) +
    exampleTraceHtml(b.trace) +
    `<h3>Réserves du modèle : une réponse pour chacune</h3>` +
    table(
      ["Constat source", "Réponse choisie", "Portée"],
      b.issues.map(
        (x) =>
          `<tr><td><b>${esc(x.title)}</b><p>${esc(x.body)}</p></td><td>${esc(b.issueAnswers[x.id] ?? "Revue ciblée par le concepteur ; consigner l’écart, tester une correction et ne pas conclure à une conformité automatique.")}</td><td>Choix renseigné ; preuve technique non acquise.</td></tr>`,
      ),
    ) +
    `<h3>Lecture par niveau — géométrie réelle du modèle</h3>` +
    b.floors
      .map(
        (l) =>
          `<details class="ex81-fold" open><summary>${esc(l.name)} · ${exampleNum(l.rooms)} m² de zones</summary><div class="ex81-plan">${l.planSvg}</div><p class="ex81-note">Plan de lecture issu du modèle, pas plan d’exécution. Les propositions de mobilier ne sont pas réputées dessinées.</p>${l.roomsHtml}</details>`,
      )
      .join("") +
    `</section>`
  );
}

/** `assumptionsHTML(p)` : registre des hypothèses (Référence / Réponse de travail / Portée). */
export function exampleAssumptionsHtml(assumptions: readonly { id: string; title: string; value: string; status: string }[]): string {
  return table(["Référence", "Réponse de travail", "Portée"], assumptions.map((a) => `<tr><td><b>${esc(a.id)}</b><br>${esc(a.title)}</td><td>${esc(a.value)}</td><td>${esc(a.status)}</td></tr>`));
}

/** `fullReport(p)` : le document HTML autonome et imprimable (plis ouverts, boutons figés en liens de dossier). */
export function exampleReportHtml(input: ExampleReportInput): string {
  const a = input.audit;
  const body =
    `<main class="ex81 ex81-report"><span class="ex81-tag">PARCOURS V8.19 · EXEMPLE ENTIÈREMENT RENSEIGNÉ</span><h1>${esc(input.projectName)}</h1>` +
    `<p>Choix privilégiés pour les critères et hypothèses indiqués, pas optimum universel. Cas pédagogique sur géométrie réelle du fichier, pas autorisation de construire.</p>` +
    `<p>Source : modèle V8.19 adapté aux annotations utilisateur : escalier B bas à gauche, mezzanine prolongée et porte X. Escalier A V8.18, sanitaires V8.17, monte-charge et modes V8.13 conservés. Contour S01 et altitudes inchangés ; validation structurelle à effectuer.</p>` +
    `<h2>Critères de choix</h2>${input.criteria.map((t) => `<p>${esc(t)}</p>`).join("")}` +
    `<h2>Complétude et transmission</h2><p>${a.filled}/${a.fields} champs métier renseignés ; ${a.linkedSpaces} fiches liées ; ${a.stageCount} étapes ; écart programme/polygones ${exampleNum(a.areaDelta, 6)} m².</p>` +
    table(
      ["Étape", "Choix", "Entrées", "État"],
      input.steps.map((s) => `<tr><td>${pad2(s.number)} · ${esc(s.title)}</td><td>${s.retained}</td><td>${s.trace.incoming.length}</td><td>${s.stale ? "À réexaminer" : "Scénario cohérent avec ses entrées"}</td></tr>`),
    ) +
    `<h2>Réponses aux 21 étapes</h2>` +
    input.steps
      .map(
        (s) =>
          `<section class="ex81-report-step"><h2>${pad2(s.number)} · ${esc(s.title)}</h2><h3>${esc(s.headline)}</h3><p><b>Choix :</b> ${esc(s.decision)}</p><p><b>Justification :</b> ${esc(s.why)}</p><p><b>Compromis :</b> ${esc(s.alternatives)}</p>${answersHtml(s.answers)}${exampleTraceHtml(s.trace)}</section>`,
      )
      .join("") +
    `<h2>Budget du scénario</h2>` +
    (input.budget ? exampleBudgetHtml(input.budget) : `<p class="ex81-note">${EXAMPLE_BUDGET_NOTE}</p><p>Budget non calculé : des postes des étapes 14 / 15 ne sont pas renseignés. Une valeur inconnue n’est pas zéro.</p>`) +
    (input.building ? exampleBuildingHtml(input.building) : `<p class="ex81-note">Aucun modèle natif lisible : le bilan du bâtiment dessiné n’est pas établi.</p>`) +
    `<h2>Registre des hypothèses et non-applicabilités décidées</h2>${exampleAssumptionsHtml(input.assumptions)}` +
    `<p>Les validations structurelles, d’urbanisme, d’accessibilité et de sécurité sont des livrables futurs. Le GO de ce cas est fictif et limité aux études ; aucun chantier ni usage autorisé.</p></main>`;
  // `exportBody` : dans le dossier, tout pli est ouvert et tout bouton devient un lien figé.
  const exportBody = body.replace(/<button\b[^>]*>([\s\S]*?)<\/button>/g, '<span class="ex81-report-link">$1</span>').replace(/<details\b(?! open)/g, "<details open");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P.118 — Exemple résolu V8.1</title><style>${input.css}body{margin:0;background:#f5f7f1;color:#173f35;font:15px/1.6 Arial}.ex81-report{max-width:1150px;margin:auto;padding:30px}button{display:none!important}details>summary{font-weight:bold}details:not([open])> :not(summary){display:block!important}@media print{body{background:white}.ex81-report-step{break-before:page}.ex81-plan{break-inside:avoid}}</style></head><body>${exportBody}</body></html>`;
}
