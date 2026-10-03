/**
 * Rapports Harmonie — `reportHTML(id, p)` de h7-app (Parcours V7.1) : le
 * « Rapport de cette étape » (`Harmonie_Etape_NN_V7.html`) et la « Synthèse
 * des choix Harmonie » du projet (`Harmonie_Choix_Parcours_V7.html`), un
 * document HTML autonome, imprimable, qui reprend les cartes de propositions
 * (partis et choix retenus), les intentions reçues et les choix à
 * transmettre de chaque étape, avec l'état de péremption.
 *
 * Moteur pur : la feuille de style du panneau (`h7-css` du prototype, extraite
 * telle quelle) et les textes sont passés en entrée ; aucune donnée n'est
 * lue ici.
 */
import type { HarmonieProposal, IncomingIntention } from "./harmonie.js";
import type { HarmonieProposalStatus, ParcoursStepDefinition } from "./parcours.js";
import { siteSvg, type SiteSketchInput } from "./site.js";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `bizEsc` : échappement HTML des textes. */
export const escapeHtml = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export interface HarmonieReportStep {
  def: ParcoursStepDefinition;
  /** Propositions construites avec l'empreinte courante (`stale` renseigné). */
  proposals: HarmonieProposal[];
  incoming: IncomingIntention[];
  /** `isStageStale` : « Données modifiées depuis la génération : revue nécessaire. » */
  stale: boolean;
  /** Étape 01 : la source de la géolocalisation et le contour pour les schémas des propositions. */
  site?: { geoSource: string; sketch: SiteSketchInput | null } | null;
}

export interface HarmonieReportInput {
  projectName: string;
  /** Une étape (rapport d'étape) ou `null` (synthèse des étapes ouvertes). */
  stepNumber: number | null;
  steps: HarmonieReportStep[];
  /** Les 21 définitions : intitulés (`label`) et périmètres (`META[t].scope`) des destinations. */
  definitions: readonly ParcoursStepDefinition[];
  /** Libellés des états (`STATES`). */
  states: Record<HarmonieProposalStatus, string>;
  /** Feuille de style du panneau Harmonie (`h7-css`). */
  css: string;
  /** Date d'édition (ISO). */
  now: string;
}

/** `label(id)` : « 01 · Parcelle existante ». */
export function stepLabel(def: Pick<ParcoursStepDefinition, "number" | "title">): string {
  return `${pad2(def.number)} · ${def.title}`;
}

/** Nom du fichier téléchargé (`stage-report` / `summary-export` du prototype). */
export function harmonieReportFileName(stepNumber: number | null): string {
  return stepNumber === null ? "Harmonie_Choix_Parcours_V7.html" : `Harmonie_Etape_${pad2(stepNumber)}_V7.html`;
}

function table(headers: string[], rows: string[]): string {
  return `<div class="h7-table-wrap"><table><thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

/** `card(q, id, p)` sans ses commandes (masquées dans le rapport). */
export function proposalCardHtml(q: HarmonieProposal, states: Record<HarmonieProposalStatus, string>, sketch: SiteSketchInput | null): string {
  const esc = escapeHtml;
  const kicker = q.group === "local" ? `${esc(q.ref.split("-LOCAL-")[0])} · LOCAL` : `${esc(q.ref)} · ${esc(q.key)}`;
  const chip = q.stale ? "À réexaminer · choix conservé" : esc(states[q.decision.status]);
  const plan = q.zoning && sketch && sketch.local.length >= 3 ? `<div class="h7-mini-plan">${siteSvg(sketch, q.zoning)}</div>` : "";
  return (
    `<article class="h7-proposal ${q.recommended ? "recommended" : ""}" data-proposal="${esc(q.id)}">` +
    `<div class="h7-proposal-top"><span class="h7-kicker">${kicker}</span><span class="h7-chip ${q.stale ? "warn" : q.retained ? "ok" : ""}">${chip}</span></div>` +
    `<h3>${esc(q.title)}</h3>${q.recommended ? '<p class="h7-reco">Proposition de départ privilégiée · à arbitrer</p>' : ""}<p>${esc(q.text)}</p>` +
    `<dl><dt>Pourquoi ici</dt><dd>${esc(q.why)}</dd><dt>Intérêt</dt><dd>${esc(q.benefit)}</dd><dt>Compromis</dt><dd>${esc(q.tradeoff)}</dd><dt>Conditions</dt><dd>${esc(q.conditions)}</dd></dl>` +
    plan +
    `<small class="h7-muted">${esc(q.source)}</small></article>`
  );
}

/** `receivedHTML(id, p)` : les intentions reçues, avec « Source à réexaminer » quand l'origine est périmée. */
export function receivedHtml(incoming: readonly IncomingIntention[]): string {
  const esc = escapeHtml;
  if (!incoming.length) {
    return '<p class="h7-muted">Aucune intention amont retenue n’est encore transmise à cette étape. Les propositions restent possibles à partir de ses données disponibles.</p>';
  }
  return table(
    ["Origine", "Intention reçue", "État"],
    incoming.map((q) => `<tr><td>${esc(q.originLabel)}<small>${esc(q.ref)}</small></td><td>${esc(q.text)}</td><td>${q.originStale ? '<span class="h7-chip warn">Source à réexaminer</span>' : esc(q.stateLabel)}</td></tr>`),
  );
}

/** `transferHTML(id, p)` : intentions reçues et choix à transmettre (destinations en texte, pas en boutons). */
export function transferHtml(step: HarmonieReportStep, definitions: readonly ParcoursStepDefinition[]): string {
  const esc = escapeHtml;
  const scopeOf = (t: number) => {
    const d = definitions.find((x) => x.number === t);
    return d ? `${pad2(t)} · ${d.scope ?? d.title}` : pad2(t);
  };
  const retained = step.proposals.filter((q) => q.retained);
  const choices = retained.length
    ? table(
        ["Référence", "Choix retenu", "Destinations", "État"],
        retained.map(
          (q) =>
            `<tr><td>${esc(q.ref)}</td><td>${esc(q.text)}</td><td>${q.targets.map((t) => `<span class="h7-chip">${esc(scopeOf(t))}</span>`).join(" ") || "Dossier de conception détaillée"}</td><td>${q.stale ? "À réexaminer" : esc(q.stateLabel)}</td></tr>`,
        ),
      )
    : "<p>Aucune proposition retenue à cette étape. Retenir ou adapter une proposition crée sa transmission.</p>";
  return `<h3>Intentions reçues</h3>${receivedHtml(step.incoming)}<h3>Choix à transmettre</h3>${choices}<p class="h7-callout">La transmission ajoute une intention liée au dossier. Elle ne remplace pas vos textes manuels et ne dessine pas automatiquement un aménagement.</p>`;
}

/** `reportHTML(id, p)` : le document complet. */
export function harmonieReportHtml(input: HarmonieReportInput): string {
  const esc = escapeHtml;
  const one = input.stepNumber !== null;
  const title = `Harmonie · ${esc(input.projectName)}${one ? ` · ${esc(stepLabel(input.steps.find((s) => s.def.number === input.stepNumber)?.def ?? { number: input.stepNumber!, title: "Étape" }))}` : ""}`;
  const sections = input.steps
    .map((s) => {
      const cards = s.proposals
        .filter((q) => q.group === "parti" || q.retained)
        .map((q) => proposalCardHtml(q, input.states, s.site?.sketch ?? null))
        .join("");
      return (
        `<section><h2>${esc(stepLabel(s.def))}</h2><p>${esc(s.def.goal ?? "")}</p>` +
        (s.stale ? '<p class="h7-callout warn">Données modifiées depuis la génération : revue nécessaire.</p>' : "") +
        (s.def.number === 1 && s.site ? `<p>${esc(s.site.geoSource)}</p>` : "") +
        cards +
        transferHtml(s, input.definitions) +
        `</section>`
      );
    })
    .join("");
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<style>${input.css}body{font:14px/1.6 Arial;background:#f7f9f4;color:#214a40;margin:0}main{max-width:1120px;margin:auto;padding:25px}.h7-proposal{break-inside:avoid}.h7-proposals{display:block}.h7-proposal{margin-bottom:20px}button,.h7-editor{display:none!important}@media print{body{background:white}}</style></head>` +
    `<body><main><span class="h7-kicker">PARCOURS V7 · DIMENSION HARMONIE PAR ÉTAPE</span><h1>${esc(input.projectName)}</h1>` +
    `<p>Édition ${esc(input.now)}. ${one ? "Rapport limité à l’objet de cette étape." : "Synthèse des étapes effectivement ouvertes ; ce document n’est pas une étape du parcours."}</p>` +
    `<p>Une proposition retenue n’est pas un ouvrage dessiné ni une vérification technique. Les hypothèses et les données non observées restent explicites.</p>` +
    sections +
    `<h2>Cadre et références</h2><p>Lecture traditionnelle : formes extérieures, entrée, relations d’usage, Cinq Éléments et Yin–Yang ; aucune garantie de santé ou de prospérité.</p>` +
    `<p>MapTiler : <a href="https://docs.maptiler.com/cloud/api/maps/">Maps API</a> · <a href="https://docs.maptiler.com/cloud/api/elevation/">Elevation API</a>. Consultés le 28 septembre 2026. Aucune clé incluse dans ce rapport.</p>` +
    `</main></body></html>`
  );
}
