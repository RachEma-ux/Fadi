/**
 * Analyses métier — quantités, contrôles traçables et comparaison de
 * scénarios (docs/architecture.md, « Business expertise as traceable
 * functions ») : chaque contrôle porte son domaine, sa source — la règle du
 * prototype dont il provient —, sa version et son résultat ; une donnée
 * manquante donne « non évalué », une règle sans objet « sans objet »,
 * jamais une estimation. Les règles sont celles de `flow-v62` (`analyse` →
 * réserves du bilan du bâtiment, `audit` → transmissions du dossier), du KPI
 * finance (« chiffrage incomplet ») et des exigences de structure déclarées
 * du dossier d'étude ; aucune règle réglementaire n'est ajoutée ici.
 *
 * Toutes les fonctions sont pures ; l'API les exécute sur les mêmes entrées
 * que le bilan de conception et tague chaque résultat de la révision du
 * modèle et de l'empreinte des entrées (`CalculatedResult`).
 */
import type { BusinessCheck, CheckStatus } from "./entities.js";
import { DESIGN_REVIEW_VERSION, type DesignAnalysis, type DesignAuditRow, type DesignReviewInput } from "./design-review.js";
import { FINANCE_REQUIRED_KEYS, financeKpis, scoreKpis, type FieldValues, type FinanceKpis, type ScoreKpis } from "./kpis.js";
import type { ModelFloor } from "./model-analysis.js";
import { programmeCaseSums, type ProgrammeSpace, type ProgrammeSums } from "./programme.js";

export const BUSINESS_CHECKS_VERSION = "1.0.0";

export type CheckKind = "donnee" | "regle" | "etude";

/** Une règle du prototype, décrite une fois : d'où elle vient, ce qu'elle contrôle, ce que donnent ses deux issues. */
export interface CheckRule {
  id: string;
  domain: string;
  label: string;
  /** Règle du prototype dont le contrôle provient. */
  source: string;
  kind: CheckKind;
  /** Statut quand la règle est évaluée sans réserve. */
  passed: CheckStatus;
  /** Statut quand la réserve est levée par le prototype. */
  raised: CheckStatus;
  /** Étape du Parcours concernée. */
  step: number;
}

export const DESIGN_CHECK_RULES: readonly CheckRule[] = [
  {
    id: "NO-MODEL",
    domain: "Modèle",
    label: "Géométrie de bâtiment dessinée",
    source: "flow-v62 analyse — projet natif sans niveau",
    kind: "donnee",
    passed: "conforme",
    raised: "non-evalue",
    step: 10,
  },
  {
    id: "IMPLANTATION",
    domain: "Implantation",
    label: "Emprise dans le contour de la parcelle et le recul de travail",
    source: "flow-v62 analyse — inclusion polygonale de l'emprise (contour, enveloppe de recul)",
    kind: "regle",
    passed: "conforme",
    raised: "non-conforme",
    step: 9,
  },
  {
    id: "TARGETS",
    domain: "Programme",
    label: "Surfaces dessinées des locaux liés et cibles programmatiques",
    source: "flow-v62 analyse — |dessiné − cible| > 0,05 m² sur un local lié",
    kind: "regle",
    passed: "conforme",
    raised: "a-verifier",
    step: 7,
  },
  {
    id: "HEIGHT",
    domain: "Hauteurs",
    label: "Hauteur d'étage et référence du dossier (3,50 m sous plafond, dossier I5)",
    source: "flow-v62 analyse — étage hors sol < 3,50 m, dossier P.118 uniquement",
    kind: "regle",
    passed: "conforme",
    raised: "a-verifier",
    step: 8,
  },
  {
    id: "DENSITY",
    domain: "Densité des postes",
    label: "Surface par poste des bureaux (hypothèse de confort 6 m²/poste)",
    source: "flow-v62 analyse — bureau / direction avec capacité indiquée et ratio < 6 m²/poste",
    kind: "regle",
    passed: "conforme",
    raised: "a-verifier",
    step: 7,
  },
  {
    id: "MEZZ",
    domain: "Mezzanine",
    label: "Mezzanine partielle : acoustique, intimité, sécurité de rive",
    source: "flow-v62 analyse — présence d'un niveau « mezz »",
    kind: "etude",
    passed: "sans-objet",
    raised: "a-verifier",
    step: 10,
  },
  {
    id: "RAMP",
    domain: "Accès technique",
    label: "Rampe d'accès au sous-sol dans le recul",
    source: "flow-v62 analyse — méta « basementAccess » du modèle",
    kind: "etude",
    passed: "sans-objet",
    raised: "a-verifier",
    step: 13,
  },
  {
    id: "CONTEXT",
    domain: "Contexte extérieur",
    label: "Observation du contexte extérieur (satellite / terrain)",
    source: "flow-v62 analyse — géoréférencement et observation déclarée",
    kind: "donnee",
    passed: "conforme",
    raised: "non-evalue",
    step: 1,
  },
  {
    id: "COMPASS",
    domain: "Références directionnelles",
    label: "Nord, déclinaison et mesure magnétique confirmés",
    source: "harmony-engine-v6 compass — références nécessaires au calcul",
    kind: "donnee",
    passed: "conforme",
    raised: "non-evalue",
    step: 10,
  },
  {
    id: "FLYING",
    domain: "Harmonie (carte natale)",
    label: "Carte natale des Étoiles Volantes établie",
    source: "harmony-engine-v6 natal — période et orientation établies",
    kind: "donnee",
    passed: "conforme",
    raised: "non-evalue",
    step: 10,
  },
];

/** Un contrôle traçable, prêt à afficher : le `BusinessCheck` du modèle de domaine, plus ce que la règle a lu. */
export interface TraceableCheck extends BusinessCheck {
  kind: CheckKind;
  label: string;
  /** Ce que la règle a constaté (texte du prototype quand la réserve existe). */
  detail: string;
  /** Objets concernés (identifiants de locaux…). */
  refs: string[];
  /** Priorité donnée par le prototype à la réserve, sinon `null`. */
  priority: string | null;
  step: number;
}

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  conforme: "Conforme à la règle",
  "non-conforme": "Écart constaté",
  "a-verifier": "Réserve — à vérifier",
  "non-evalue": "Non évalué",
  "sans-objet": "Sans objet",
};

const fmtFr = (x: number | null | undefined, n = 2): string => (Number.isFinite(x as number) ? (x as number).toLocaleString("fr-FR", { maximumFractionDigits: n }) : "Non renseigné");

/**
 * Les dix règles de `analyse` (flow-v62) lues comme des contrôles : la
 * réserve levée par le prototype donne le statut `raised`, son absence le
 * statut `passed` ; une règle dont les entrées manquent est « non évaluée »,
 * une règle qui ne s'applique pas au dossier « sans objet ».
 */
export function designChecks(input: DesignReviewInput, r: DesignAnalysis): TraceableCheck[] {
  const issues = new Map(r.issues.map((x) => [x.id, x]));
  const a = input.programmeCase;
  const linked = r.rooms.filter((x) => x.target !== null);
  const offices = r.rooms.filter((x) => (x.usage === "bureau" || x.usage === "direction") && x.capacity);
  return DESIGN_CHECK_RULES.map((rule) => {
    const issue = issues.get(rule.id) ?? null;
    let status: CheckStatus = issue ? rule.raised : rule.passed;
    let detail = issue?.body ?? "";
    if (!issue) {
      switch (rule.id) {
        case "NO-MODEL":
          if (!input.nativeId) {
            status = "non-evalue";
            detail = "Aucun modèle natif relié au dossier.";
          } else detail = `${r.floors.length} niveau(x), ${r.rooms.length} zone(s) lues sur le modèle courant.`;
          break;
        case "IMPLANTATION":
          if (r.facts.inside === null) {
            status = "non-evalue";
            detail = "Parcelle ou emprise absente : comparaison polygonale impossible.";
          } else
            detail = `Emprise ${fmtFr(r.facts.footprint)} m² dans le contour (${fmtFr(r.facts.parcelArea)} m²)${r.facts.insideSetback === null ? "" : r.facts.insideSetback ? " et dans le recul de travail" : ""} ; reculs ${r.facts.setbacks.map((d) => fmtFr(d)).join(" / ")} m.`;
          break;
        case "TARGETS":
          if (!a) {
            status = "non-evalue";
            detail = "Aucun cas de programme appliqué : pas de cible à comparer.";
          } else if (!linked.length) {
            status = "non-evalue";
            detail = "Aucun local lié à une ligne du programme.";
          } else detail = `${linked.length} local(aux) lié(s) : écarts tous ≤ 0,05 m².`;
          break;
        case "HEIGHT":
          if (!input.example) {
            status = "sans-objet";
            detail = "Référence de hauteur propre au dossier P.118 (dossier I5) ; aucune valeur réglementaire n'est présumée pour ce projet.";
          } else detail = "Tous les étages hors sol atteignent 3,50 m.";
          break;
        case "DENSITY":
          if (!offices.length) {
            status = "non-evalue";
            detail = "Aucun bureau avec capacité indiquée au nom du local.";
          } else detail = `${offices.length} bureau(x) avec capacité : tous ≥ 6 m²/poste.`;
          break;
        case "MEZZ":
          detail = "Aucun niveau « mezz » dans le modèle.";
          break;
        case "RAMP":
          detail = "Aucune rampe d'accès au sous-sol déclarée dans le modèle.";
          break;
        case "CONTEXT":
          detail = "Géoréférencement établi et contexte extérieur observé.";
          break;
        case "COMPASS":
          detail = "Références directionnelles enregistrées et confirmées.";
          break;
        case "FLYING":
          detail = "Carte natale établie à partir des références enregistrées.";
          break;
      }
    }
    return {
      id: `design:${rule.id}`,
      kind: rule.kind,
      domain: rule.domain,
      label: rule.label,
      source: rule.source,
      version: DESIGN_REVIEW_VERSION,
      status,
      detail,
      refs: issue?.refs ?? [],
      priority: issue?.priority ?? null,
      step: issue?.step ?? rule.step,
    };
  });
}

const AUDIT_STATUS: Record<DesignAuditRow["status"], CheckStatus> = { OK: "conforme", "À documenter": "non-evalue", Écart: "a-verifier" };

/** Les quatorze transmissions du dossier (`audit` de flow-v62) lues comme des contrôles de cohérence. */
export function transmissionChecks(audit: readonly DesignAuditRow[]): TraceableCheck[] {
  return audit.map((row) => ({
    id: `audit:${row.id}`,
    kind: "regle",
    domain: "Transmissions du dossier",
    label: row.name,
    source: `flow-v62 audit — ${row.name}`,
    version: DESIGN_REVIEW_VERSION,
    status: AUDIT_STATUS[row.status],
    detail: row.detail,
    refs: [],
    priority: null,
    step: 10,
  }));
}

/** Étape 14 : « Investissement, financement et solde non calculés tant que les postes nécessaires ne sont pas renseignés. Une valeur inconnue n'est pas zéro. » */
export function financeCheck(fields14: FieldValues): TraceableCheck {
  const missing = FINANCE_REQUIRED_KEYS.filter((k) => {
    const v = fields14[k];
    return v === null || v === undefined || v === "" || !Number.isFinite(Number(v));
  });
  const kpis = financeKpis(fields14);
  return {
    id: "finance:complet",
    kind: "donnee",
    domain: "Chiffrage",
    label: "Postes du chiffrage renseignés (investissement f1–f6, financement f9–f10)",
    source: "flow-v62 financeKPIs — « chiffrage incomplet » : une valeur inconnue n'est pas zéro",
    version: DESIGN_REVIEW_VERSION,
    status: kpis ? "conforme" : "non-evalue",
    detail: kpis
      ? `Investissement ${fmtFr(kpis.investissement, 0)} ; financement ${fmtFr(kpis.financement, 0)} ; solde ${fmtFr(kpis.solde, 0)}.`
      : `Chiffrage incomplet : ${missing.length} poste(s) manquant(s) (${missing.join(", ")}).`,
    refs: [],
    priority: null,
    step: 14,
  };
}

// --- Dossier d'étude déclaré : structure ------------------------------------

/** `project.data.structure` du dossier d'étude (exemple P.118) : exigences enregistrées, charges supposées, état de dimensionnement. */
export interface DeclaredStructure {
  system?: string;
  requiredSpanM?: number;
  loadKgM2?: number;
  loadKNM2?: number;
  loadNature?: string;
  selfWeightIncluded?: boolean;
  columnRule?: string;
  thicknessStatus?: string;
  designStatus?: string;
  columnCountPerLevel?: number;
  columnStations?: unknown[];
  [k: string]: unknown;
}

export type StatementKind = "exigence" | "hypothese" | "representation" | "etat";

/** Une déclaration du dossier de structure, classée sans jamais être recalculée. */
export interface StructureStatement {
  kind: StatementKind;
  label: string;
  value: string;
}

/**
 * Lecture du dossier de structure déclaré : la portée requise et la règle
 * d'implantation des poteaux sont des exigences, la charge « supposée, à
 * confirmer » une hypothèse, l'épaisseur « conservée pour la
 * représentation » une donnée de représentation, et l'état de
 * dimensionnement est reporté tel quel. Rien n'est calculé ici.
 */
export function structureStatements(s: DeclaredStructure): StructureStatement[] {
  const out: StructureStatement[] = [];
  if (s.system) out.push({ kind: "exigence", label: "Système porteur retenu", value: s.system });
  if (Number.isFinite(s.requiredSpanM)) out.push({ kind: "exigence", label: "Portée libre requise", value: `${fmtFr(s.requiredSpanM)} m` });
  if (s.columnRule) out.push({ kind: "exigence", label: "Implantation des poteaux", value: s.columnRule });
  if (Number.isFinite(s.loadKgM2)) {
    const nature = s.loadNature ?? "";
    out.push({
      kind: /suppos|hypoth|à confirmer/i.test(nature) ? "hypothese" : "exigence",
      label: "Charge d'exploitation",
      value: `${fmtFr(s.loadKgM2, 0)} kg/m²${Number.isFinite(s.loadKNM2) ? ` (${fmtFr(s.loadKNM2, 3)} kN/m²)` : ""}${nature ? ` — ${nature}` : ""}${s.selfWeightIncluded === false ? " ; poids propre non inclus" : ""}`,
    });
  }
  if (Number.isFinite(s.columnCountPerLevel))
    out.push({
      kind: "representation",
      label: "Poteaux par niveau (modèle)",
      value: `${s.columnCountPerLevel}${Array.isArray(s.columnStations) ? ` positions, ${s.columnStations.length} stations enregistrées` : ""}`,
    });
  if (s.thicknessStatus) out.push({ kind: "representation", label: "Épaisseur de dalle", value: s.thicknessStatus });
  if (s.designStatus) out.push({ kind: "etat", label: "Dimensionnement", value: s.designStatus });
  return out;
}

/** Le contrôle « Structure » : évalué seulement si le dossier déclare un dimensionnement ; « non calculés » dans l'état → non évalué. */
export function structureCheck(s: DeclaredStructure | null): TraceableCheck {
  const designStatus = s?.designStatus ?? "";
  const computed = !!s && designStatus !== "" && !/non calcul/i.test(designStatus);
  return {
    id: "structure:dimensionnement",
    kind: "donnee",
    domain: "Structure",
    label: "Dimensionnement structurel (résistance, flèche, poinçonnement, pertes, ancrages, appuis)",
    source: "dossier d'étude — exigences de structure enregistrées (project.data.structure)",
    version: BUSINESS_CHECKS_VERSION,
    status: !s ? "non-evalue" : computed ? "a-verifier" : "non-evalue",
    detail: !s ? "Aucune exigence de structure enregistrée pour ce dossier." : designStatus || "Dimensionnement non renseigné.",
    refs: [],
    priority: null,
    step: 9,
  };
}

// --- Quantités dérivées ----------------------------------------------------

export interface LevelQuantity {
  id: string;
  name: string;
  elevation: number | null;
  height: number | null;
  gross: number | null;
  slabNet: number | null;
  voidArea: number | null;
  rooms: number;
  roomArea: number;
  objects: number;
}

/** Les métrés dérivés du modèle courant (jamais la contenance déclarée), par niveau, avec les faits de la parcelle. */
export interface DerivedQuantities {
  method: string;
  version: string;
  parcel: { area: number | null; officialArea: number | null; footprint: number | null; setbackArea: number | null; setbacks: number[]; inside: boolean | null; insideSetback: boolean | null };
  building: { gross: number | null; net: number | null; roomArea: number; roomCount: number; height: number | null; levels: number };
  levels: LevelQuantity[];
  programme: { total: number; programme: number; support: number; linkedTarget: number; linkedDrawn: number; linkedRooms: number } | null;
}

export function derivedQuantities(r: DesignAnalysis, floors: readonly ModelFloor[], programme: ProgrammeSums | null): DerivedQuantities {
  const linked = r.rooms.filter((x) => x.target !== null);
  return {
    method: "flow-v62 analyse — surfaces de dalle brutes / nettes et polygones de zones du modèle natif (repère local), parcelle et emprise (repère cadastral)",
    version: DESIGN_REVIEW_VERSION,
    parcel: {
      area: r.facts.parcelArea,
      officialArea: r.facts.officialArea,
      footprint: r.facts.footprint,
      setbackArea: r.facts.setbackArea,
      setbacks: r.facts.setbacks,
      inside: r.facts.inside,
      insideSetback: r.facts.insideSetback,
    },
    building: { gross: r.facts.gross, net: r.facts.net, roomArea: r.facts.roomArea, roomCount: r.facts.roomCount, height: r.facts.height, levels: floors.length },
    levels: floors.map((f) => {
      const rooms = r.rooms.filter((x) => x.level === f.id);
      return {
        id: f.id,
        name: f.name,
        elevation: f.elevation,
        height: f.height,
        gross: f.gross,
        slabNet: f.slabNet,
        voidArea: f.voidArea,
        rooms: rooms.length,
        roomArea: rooms.reduce((n, x) => n + x.area, 0),
        objects: f.count,
      };
    }),
    programme: programme
      ? {
          total: programme.total,
          programme: programme.programme,
          support: programme.support,
          linkedTarget: linked.reduce((n, x) => n + (x.target ?? 0), 0),
          linkedDrawn: linked.reduce((n, x) => n + x.area, 0),
          linkedRooms: linked.length,
        }
      : null,
  };
}

// --- Comparaison de scénarios ----------------------------------------------

export interface ProgrammeScenarioRow {
  revision: number;
  title: string;
  scenarioLabel: string;
  updated: string;
  /** Date d'archivage de la variante remplacée ; `null` pour la variante courante. */
  archived: string | null;
  current: boolean;
  sums: ProgrammeSums;
  /** Écart du total de programme (hors parois) par rapport à la variante courante. */
  deltaProgramme: number;
}

/** Les variantes de programme appliquées au dossier (courante et archivées), sommées depuis leurs fiches — jamais recopiées. */
export function programmeScenarios(
  cases: readonly { revision: number; title: string; scenarioLabel: string; updated: string; archived: string | null; spaces: readonly ProgrammeSpace[] }[],
): ProgrammeScenarioRow[] {
  const sorted = [...cases].sort((a, b) => b.revision - a.revision);
  const current = sorted.find((c) => c.archived === null) ?? sorted[0] ?? null;
  const currentSums = current ? programmeCaseSums(current.spaces) : null;
  return sorted.map((c) => {
    const sums = programmeCaseSums(c.spaces);
    return {
      revision: c.revision,
      title: c.title,
      scenarioLabel: c.scenarioLabel,
      updated: c.updated,
      archived: c.archived,
      current: c === current,
      sums,
      deltaProgramme: currentSums ? sums.programme - currentSums.programme : 0,
    };
  });
}

// --- Résultats calculés des étapes -----------------------------------------

export interface StepResults {
  finance: FinanceKpis | null;
  score: ScoreKpis;
  decision: string | null;
}

export function stepResults(fields14: FieldValues, fields17: FieldValues, fields19: FieldValues): StepResults {
  const decision = fields19["decision"];
  return { finance: financeKpis(fields14), score: scoreKpis(fields17), decision: typeof decision === "string" && decision ? decision : null };
}

/** Compte par statut, pour l'en-tête du module. */
export function checkTotals(checks: readonly TraceableCheck[]): Record<CheckStatus, number> {
  const out: Record<CheckStatus, number> = { conforme: 0, "non-conforme": 0, "a-verifier": 0, "non-evalue": 0, "sans-objet": 0 };
  for (const c of checks) out[c.status] += 1;
  return out;
}
