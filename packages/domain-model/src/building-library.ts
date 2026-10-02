/**
 * Bibliothèque des bâtiments (Parcours V6.1 · building-library-app du
 * prototype) — moteur pur : cas de programme appliqué à un projet
 * (`saveProgramme`), répartition dérivée des fiches espaces
 * (`updateRepartition`), textes métier générés pour les 21 étapes
 * (`draft`), fusion avec les textes déjà saisis (conflits conservés),
 * adaptation d'une ligne d'espace (`editSpace`), schéma d'adjacences,
 * gabarit d'essai dimensionnel et export CSV.
 *
 * Les données (10 types, 21 cas, 3 variantes chacun, références) sont
 * extraites telles quelles dans `apps/api/src/data/building-library.json` et
 * passées en paramètre. Les cas sources et la géométrie native sont
 * immuables ; une application crée des cibles de programme versionnées.
 * « Source » signifie présent dans le fichier, pas confirmé sur le terrain.
 */
import { PROGRAMME_BUCKET_LABELS, programmeCaseSums, type ProgrammeBucket, type ProgrammeSpace, type ProgrammeSums } from "./programme.js";
import type { ParcoursFieldValue } from "./parcours.js";

export interface BuildingProfile {
  id: string;
  label: string;
  tags: string;
  tech: string;
  acc: string;
  safety: string;
  acoustic: string;
  networks: string;
  performance: [string, string, string, string][];
  dims: [string, number | null, number | null, number | null, string][];
  harmony: string[];
  [k: string]: unknown;
}

export interface BuildingReference {
  id: string;
  title: string;
  publisher: string;
  url: string;
  jurisdiction: string;
  kind: string;
  scope: string;
  checked: string;
}

export type LibrarySpaceStatus = "source" | "hypothese" | "calcule";

export interface LibrarySpace extends ProgrammeSpace {
  id: string;
  role: "principal" | "support" | "parois";
  bucket: ProgrammeBucket;
  capacity?: string;
  use?: string;
  links?: string;
  performance?: string;
  maintenance?: string;
  level?: string;
  height?: number | string | null;
  status?: LibrarySpaceStatus | string;
  source?: string;
  harmonyType?: string;
  sourceRoomId?: string;
  [k: string]: unknown;
}

export interface BuildingScenario {
  id: string;
  label: string;
  note: string;
  spaces: LibrarySpace[];
}

export interface BuildingHypothesis {
  id: string;
  topic: string;
  value: string;
  status: string;
  owner: string;
  check: string;
  proof?: string;
}

export type BuildingAdjacency = [string, string, string, string];

export interface BuildingCase {
  id: string;
  sourceKey?: string | null;
  type: string;
  subtype: string;
  title: string;
  capacity: number | null;
  unit: string;
  users: string;
  summary: string;
  spaces: LibrarySpace[];
  adjacencies: BuildingAdjacency[];
  flows: string[];
  components: string[];
  origin: string;
  original?: Record<string, unknown> | null;
  sourceConvention?: string | null;
  requirements: { name: string; needName?: string; spaceName?: string; target: string; priority?: string; verification: string }[];
  profile: BuildingProfile;
  regulatory: { jurisdiction: string; status: string; references: string[]; localDocuments: string[]; foreignScope: string };
  hypotheses: BuildingHypothesis[];
  scenarios: BuildingScenario[];
  dimensionChecks: { element: string; minimumProjet: number | null; recommande: number | null; hauteurLibre: number | null; unit: string; regulatoryMinimum: number | null; source: string; note: string }[];
  drawing: { status: string; units: string; deliverables: string[]; checks: string[]; [k: string]: unknown };
  provenanceNotice: string;
  conflicts: string[];
  fixedGeometry?: boolean;
  site?: { area: number | string; footprint: number | string } | null;
  [k: string]: unknown;
}

export interface BuildingLibraryData {
  schema: string;
  version: string;
  date: string;
  profiles: Record<string, BuildingProfile>;
  references: BuildingReference[];
  cases: BuildingCase[];
  surfaceConvention: string;
}

export const LIBRARY_SPACE_STATUS_LABELS: Record<string, string> = { source: "Source du cas", hypothese: "Hypothèse", calcule: "Calculé depuis modèle" };
export const LIBRARY_RELATION_LABELS: Record<string, string> = { directe: "Liaison directe", proche: "Proximité", separer: "À séparer", technique: "Relation technique" };
export const LIBRARY_TABS: [string, string][] = [
  ["programme", "Programme & surfaces"],
  ["relations", "Adjacences & flux"],
  ["technique", "Exigences & dessin"],
  ["harmony", "Harmony & parcours"],
  ["sources", "Sources & hypothèses"],
];

export const fmtLib = (n: unknown, d = 1): string => (Number.isFinite(Number(n)) && n !== null && n !== "" ? Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d }) : "—");

export function buildingCase(data: BuildingLibraryData, id: string): BuildingCase | null {
  return data.cases.find((c) => c.id === id) ?? null;
}

export function buildingScenario(c: BuildingCase, scenarioId: string): BuildingScenario | null {
  return c.scenarios.find((s) => s.id === scenarioId) ?? null;
}

export function referenceRows(data: BuildingLibraryData, c: BuildingCase): BuildingReference[] {
  return c.regulatory.references.map((id) => data.references.find((r) => r.id === id)).filter((r): r is BuildingReference => !!r);
}

/** Recherche de la bibliothèque (`fold()` + filtre du prototype) : type, sous-type, usagers et mots-clés du profil. */
export const foldText = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function searchBuildingCases(data: BuildingLibraryData, query: string, type: string): { profile: BuildingProfile; cases: BuildingCase[] }[] {
  const q = foldText(query);
  return Object.values(data.profiles)
    .filter((p) => type === "all" || p.id === type)
    .map((p) => ({ profile: p, cases: data.cases.filter((c) => c.type === p.id && (!q || foldText(`${c.title} ${c.subtype} ${c.users} ${p.tags}`).includes(q))) }))
    .filter((g) => g.cases.length > 0);
}

// ---------------------------------------------------------------------------
// Cas de programme appliqué à un projet
// ---------------------------------------------------------------------------

/** `Parcours.ProgrammeCase` : la variante d'un cas appliquée à un projet, versionnée. */
export interface ProgrammeCase {
  schema: "Parcours.ProgrammeCase";
  version: 1;
  libraryVersion: string;
  caseId: string;
  title: string;
  type: string;
  subtype: string;
  capacity: number | null;
  unit: string;
  users: string;
  scenarioId: string;
  scenarioLabel: string;
  scenarioNote: string;
  spaces: LibrarySpace[];
  jurisdiction: string;
  revision: number;
  created: string;
  updated: string;
  roomLinks: Record<string, string[]>;
  hypotheses: BuildingHypothesis[];
  adjacencies: BuildingAdjacency[];
  flows: string[];
  requirements: BuildingCase["requirements"];
  referenceIds: string[];
  sourceConvention: string;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** `saveProgramme` (première partie) : le cas de programme à enregistrer, révision suivante, liens de locaux conservés si le cas ne change pas. */
export function buildProgrammeCase(data: BuildingLibraryData, c: BuildingCase, s: BuildingScenario, jurisdiction: string, prev: ProgrammeCase | null, now: string): ProgrammeCase {
  return {
    schema: "Parcours.ProgrammeCase",
    version: 1,
    libraryVersion: data.version,
    caseId: c.id,
    title: c.title,
    type: c.type,
    subtype: c.subtype,
    capacity: c.capacity,
    unit: c.unit,
    users: c.users,
    scenarioId: s.id,
    scenarioLabel: s.label,
    scenarioNote: s.note,
    spaces: clone(s.spaces),
    jurisdiction,
    revision: (prev?.revision ?? 0) + 1,
    created: prev?.created ?? now,
    updated: now,
    roomLinks: prev?.caseId === c.id ? clone(prev.roomLinks ?? {}) : {},
    hypotheses: clone(c.hypotheses),
    adjacencies: clone(c.adjacencies),
    flows: clone(c.flows),
    requirements: clone(c.requirements),
    referenceIds: c.regulatory.references.slice(),
    sourceConvention: c.sourceConvention ?? data.surfaceConvention,
  };
}

export interface RepartitionFromCase {
  type: string;
  mode: "cas";
  baseArea: number;
  custom: Record<string, number>;
  caseId: string;
  caseScenario: string;
  caseVersion: number;
  caseTotals: ProgrammeSums;
}

/** `updateRepartition` : la répartition est chargée depuis les fiches espaces, famille par famille — pas un pourcentage arbitraire. */
export function repartitionFromCase(a: ProgrammeCase): RepartitionFromCase {
  const t = programmeCaseSums(a.spaces);
  const custom = Object.fromEntries((Object.keys(PROGRAMME_BUCKET_LABELS) as ProgrammeBucket[]).filter((k) => k !== "principal").map((k) => [k, t.total ? (t[k] / t.total) * 100 : 0]));
  return { type: a.type, mode: "cas", baseArea: t.total, custom, caseId: a.caseId, caseScenario: a.scenarioId, caseVersion: a.revision, caseTotals: t };
}

// ---------------------------------------------------------------------------
// Textes métier générés pour les 21 étapes (`draft`)
// ---------------------------------------------------------------------------

export type DraftTexts = Record<number, Record<string, string>>;

/** `draft(c, s, jurisdiction)` du prototype, à l'identique : chaque texte porte l'en-tête « [EXEMPLE / HYPOTHÈSE · … ] ». */
export function draftProgrammeTexts(data: BuildingLibraryData, c: BuildingCase, s: BuildingScenario, jurisdiction: string, now: string): DraftTexts {
  const t = programmeCaseSums(s.spaces);
  const p = c.profile;
  const fmt = fmtLib;
  const labels = PROGRAMME_BUCKET_LABELS;
  const header = `[EXEMPLE / HYPOTHÈSE · ${c.title} · ${s.label} · V${data.version}]`;
  const spaceText = s.spaces.map((x) => `${x.id} · ${x.name} : ${x.quantity} × ${x.unitArea} = ${fmt(x.quantity * x.unitArea, 3)} m² ; ${labels[x.bucket] ?? labels.supportAutres} ; ${x.capacity || "capacité à préciser"}`).join("\n");
  const area = `Programme ${fmt(t.programme, 3)} m² = principaux ${fmt(t.principal, 3)} + support/circulations ${fmt(t.support, 3)}. ${t.parois ? "Parois séparées " + fmt(t.parois, 3) + " m²" : "Parois / gaines non chiffrées (0 m² alloué)"} ; total de travail ${fmt(t.total, 3)} m². Ni surface réglementaire, ni emprise.`;
  const adj = c.adjacencies.map(([a, b, r, d]) => `${a} ↔ ${b} : ${LIBRARY_RELATION_LABELS[r] ?? r} · ${d}`).join("\n");
  const hyp = c.hypotheses.map((x) => `${x.id} : ${x.value}`).join("\n");
  const objectives = p.performance.map((x) => `${x[0]} : ${x[1]} ; ${x[2]} ; ${x[3]}`).join("\n");
  const reg = `Cadre déclaré : ${jurisdiction}. Textes applicables, classement et version à confirmer. Références : ${referenceRows(data, c)
    .map((x) => x.id + " — " + x.title + " [" + x.jurisdiction + "]")
    .join("; ")}.`;
  const st: DraftTexts = {};
  const put = (id: number, values: Record<string, unknown>) => {
    st[id] = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, header + "\n" + String(v)]));
  };
  const original = (c.original ?? {}) as Record<string, string | undefined>;
  const [s0, s1, s2] = c.scenarios;
  put(1, { summary: c.site ? `P.118 : parcelle ${c.site.area} m² et emprise du modèle ${c.site.footprint} m². Sources et conformité à distinguer.` : "Site à choisir / documenter. Aucune géométrie, adresse ni orientation créée par cet exemple." });
  put(2, { f1: reg, f2: "Usages à confirmer auprès de l’autorité pour le site réel. Un type dans la bibliothèque n’est pas une autorisation.", f11: reg, f12: "Enveloppe constructible non vérifiée par le programme." });
  put(3, {
    f1: "Périmètre et date à confirmer ; exemple pédagogique, pas étude actuelle du marché.",
    f2: c.users,
    f3: original.marketStudy || "Hypothèses de fréquentation à confirmer par enquête locale.",
    f8: c.summary,
    f9: "Capacité de paiement, offre et exploitation à vérifier ; aucune recette réelle fournie.",
  });
  put(4, {
    f1: p.label + " → " + c.subtype,
    f2: "Intervention à arbitrer : neuf / adaptation / location selon site et diagnostics.",
    f3: c.users,
    f6: original.operatingModel || "Organisation et horaires à formaliser avec l’exploitant.",
    f8: objectives,
    f9: s.note,
  });
  put(5, {
    f1: "Maître d’ouvrage, usagers, exploitant, architecte, BET et personnes concernées par l’accessibilité.",
    f2: c.users,
    f3: s.spaces.filter((x) => x.role === "principal").map((x) => x.name).join("; "),
    f4: c.users,
    f6: c.flows.join("\n"),
    f7: c.summary,
    f8: c.conflicts.join("\n") || "Réserves à instruire : accessibilité, dimensions, site et financement.",
    f9: original.consultationPlan || "Entretiens, observation de pointes, parcours test et revue de plans meublés.",
    f10: "Restitution à valider, aucune concertation réelle simulée comme réalisée.",
  });
  put(6, {
    f1: original.objective || c.summary,
    f2: s.spaces.filter((x) => x.role === "principal").map((x) => x.name).join("; "),
    f3: c.users,
    f4: area,
    f5: objectives,
    f6: "Budget non autorisé par cet exemple ; devis, provisions et financement à instruire.",
    f7: "Scénarios de phasage à construire après diagnostics ; dates non inventées.",
    f8: c.profile.harmony.join("\n"),
    f9: "Sécurité, accessibilité, hygiène et exigences techniques prioritaires ; conformité non acquise.",
  });
  put(7, {
    f1: p.label + " · " + c.subtype,
    f2: spaceText,
    f3: c.users,
    f4: area,
    f5: (Object.entries(labels) as [ProgrammeBucket, string][]).map(([k, l]) => `${l} : ${fmt(t[k], 3)} m²`).join("\n"),
    f6: adj,
    f7: p.dims.map((x) => `${x[0]} : ${x[1] ?? "à définir"} / ${x[2] ?? "à définir"} m proposés, non réglementaires`).join("\n"),
    f8: c.flows.join("\n"),
    f9: "Mutualisation uniquement avec planning et pointe vérifiés ; les usagers successifs ne sont pas sommés.",
    f10: s.note,
  });
  put(8, {
    f1: p.tech,
    f2: c.dimensionChecks.map((x) => `${x.element} : largeur recommandée test ${x.recommande ?? "à définir"} m ; hauteur libre cible ${x.hauteurLibre ?? "à définir"} m ; minimum réglementaire inconnu.`).join("\n"),
    f3: p.acc,
    f4: p.safety,
    f5: p.acoustic,
    f6: "Confort visuel et air à étudier avec occupation, équipements, climat et objectifs de l’exploitant.",
    f7: "Étude thermique, eau et carbone à commander selon objectifs et cadre local.",
    f8: p.networks,
    f9: "Accès maintenance, remplacement équipements et documentation à produire.",
    f10: objectives,
  });
  put(9, {
    f1: "Aucune satisfaction réglementaire ou technique automatiquement déduite.",
    f2: "Programme modifiable selon résultats des études.",
    f3: "Compatibilité géométrique entre locaux programmés et modèle réel à démontrer.",
    f5: area,
    f7: c.conflicts.join("\n") || hyp,
  });
  put(10, { summary: area + "\n" + c.drawing.deliverables.join("\n") + "\nLe programme est transmis sans créer ni écraser les objets du modèle." });
  put(11, { summary: c.drawing.checks.join("\n") + "\nLes cotes proposées restent séparées des cotes mesurées." });
  put(12, {
    f1: "Scénario 0 : report / maintien, hypothèse distincte à instruire.",
    f2: (s0?.label ?? "") + " : " + (s0?.note ?? ""),
    f3: (s1?.label ?? "") + " : " + (s1?.note ?? ""),
    f4: (s2?.label ?? "") + " : " + (s2?.note ?? ""),
    f5: "Comparer service rendu, surface par convention, confort, interfaces, risques, coût et souplesse.",
    f6: s.label + " · scénario de travail, non décision validée.",
    f7: "Choix à motiver avec mesures, besoins et faisabilités. Les scénarios économiques historiques restent dans la source.",
  });
  put(13, { f1: p.tech, f3: p.networks, f4: c.flows.join("\n"), f5: p.safety, f8: "Vérifier plans d’accès, équipements et protocoles.", f9: hyp, f10: "Faisabilité non démontrée par la bibliothèque." });
  put(14, {
    f11: jurisdiction === "Maroc" ? "MAD à confirmer selon montage ; aucun montant transféré automatiquement." : "Devise à définir.",
    f12: "Chiffrage manquant. Les nombres nuls des anciens compteurs ne signifient pas absence de coût. Scénarios : adaptation de l’existant / neuf / phasage, à chiffrer sur mêmes fonctions.",
  });
  put(15, {
    f7: "Maintenance et renouvellement à inventorier par équipement.",
    f8: "Variantes de programme A/B/C : faire chiffrer les écarts sans inférer un coût depuis la seule surface.",
    f9: "Plafond d’investissement et seuils d’exploitation à décider.",
  });
  put(16, {
    f1: "Documents fonciers et limites à contrôler indépendamment du cas.",
    f3: reg,
    f4: p.tech,
    f5: p.networks,
    f6: "Besoins et exploitation à confirmer avec acteurs réels.",
    f7: "Budget et financement non validés.",
    f10: c.conflicts.join("\n") + "\n" + hyp,
  });
  put(17, { f9: objectives + "\nAucune note préremplie ; apprécier seulement sur preuves." });
  put(18, {
    f1: "Constructibilité à confirmer.",
    f2: "Aucune capacité constructible déduite automatiquement des surfaces cibles.",
    f3: spaceText,
    f4: area,
    f5: s.label + " · à arbitrer",
    f6: "Investissement à chiffrer.",
    f9: c.conflicts.join("\n") || hyp,
    f11: "Site, programme, études techniques et cadre réglementaire à valider avant décision.",
  });
  put(19, {
    f1: s.label + " · proposition non approuvée",
    f3: "Décision réservée au maître d’ouvrage ; aucune conclusion GO importée.",
    f4: "Programme de travail uniquement. Budget non autorisé.",
    f5: c.conflicts.join("\n") || hyp,
    f6: reg,
    f9: "V6.1 · " + now,
  });
  put(20, {
    f1: "Missions proposées à lancer seulement après décision autorisant les études.",
    f2: "Programmiste, architecte, géomètre, BET structure/fluides/incendie, accessibilité et acoustique.",
    f3: "Valideurs à nommer ; pas de nom fictif.",
    f4: area,
    f5: "Diagnostics, simulation, revue utilisateur et vérification des références.",
    f6: c.drawing.deliverables.join("\n"),
    f9: "Site et autorisations → programme → études → validations.",
    f10: "Revues de programme et Harmony avec réserves documentées.",
  });
  put(21, { summary: area + "\n" + objectives + "\n" + hyp + "\nDossier transmis comme hypothèses de travail, non autorisation de construire." });
  return st;
}

export interface ProgrammeFieldConflict {
  stage: number;
  field: string;
  current: string;
  proposed: string;
}

export interface MergedProgrammeTexts {
  business: Record<number, Record<string, ParcoursFieldValue>>;
  generated: Record<number, Record<string, string>>;
  conflicts: ProgrammeFieldConflict[];
}

/**
 * `saveProgramme` (seconde partie) : un texte généré remplace une réponse
 * vide ou une réponse précédemment générée ; une réponse saisie à la main
 * est conservée et l'écart signalé — sauf `replaceText` (réinitialisation
 * volontaire). Seuls les champs typés texte sont alimentés : les textes
 * générés sont des textes.
 */
export function mergeGeneratedTexts(
  business: Record<number, Record<string, ParcoursFieldValue>>,
  oldGenerated: Record<number, Record<string, string>>,
  next: DraftTexts,
  replaceText: boolean,
  isTextField: (stage: number, key: string) => boolean,
): MergedProgrammeTexts {
  const out: Record<number, Record<string, ParcoursFieldValue>> = clone(business);
  const generated: Record<number, Record<string, string>> = clone(oldGenerated);
  const conflicts: ProgrammeFieldConflict[] = [];
  for (const [idStr, values] of Object.entries(next)) {
    const id = Number(idStr);
    out[id] ??= {};
    generated[id] ??= {};
    for (const [key, value] of Object.entries(values)) {
      if (!isTextField(id, key)) continue;
      const old = out[id]![key];
      if (replaceText || old === undefined || old === null || old === "" || old === oldGenerated[id]?.[key]) {
        out[id]![key] = value;
        generated[id]![key] = value;
      } else if (old !== value) {
        conflicts.push({ stage: id, field: key, current: String(old), proposed: value });
      }
    }
  }
  return { business: out, generated, conflicts };
}

/** `editSpace` : adaptation d'une ligne du programme appliqué (quantité entière ou surface unitaire), statut « hypothèse », révision avancée. */
export function editProgrammeSpace(a: ProgrammeCase, spaceId: string, key: "quantity" | "unitArea", value: unknown, now: string): ProgrammeCase {
  const next = clone(a);
  const s = next.spaces.find((x) => x.id === spaceId);
  if (!s) throw new Error("Espace inconnu");
  if (key !== "quantity" && key !== "unitArea") throw new Error("Champ de surface interdit");
  if (String(value ?? "").trim() === "") throw new Error("Saisie vide : utilisez une valeur ou conservez la donnée existante.");
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000 || (key === "quantity" && !Number.isInteger(n))) throw new Error("Quantité entière et surface ≥ 0 attendues (limite de sécurité 100 000).");
  s[key] = n;
  s.status = "hypothese";
  s.source = "Saisie projet · " + now;
  next.revision += 1;
  next.updated = now;
  next.scenarioLabel = "Adaptation projet · " + next.scenarioId;
  return next;
}

/** Étapes dont les revues sont à reprendre après modification du programme (prototype : `p.done[k]=false`). */
export const PROGRAMME_REVIEW_STEPS: readonly number[] = [6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19];

// ---------------------------------------------------------------------------
// Schémas et exports
// ---------------------------------------------------------------------------

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** `graph(c)` : schéma fonctionnel des adjacences, hors échelle. */
export function adjacencyGraphSvg(c: BuildingCase): string {
  const names = [...new Set(c.adjacencies.flatMap((a) => a.slice(0, 2)))];
  const W = 1020;
  const Hh = Math.max(320, Math.ceil(names.length / 3) * 135 + 90);
  const pos = Object.fromEntries(names.map((n, i) => [n, { x: 25 + (i % 3) * 335, y: 50 + Math.floor(i / 3) * 135 }]));
  const wrap = (s: string, n = 29) => {
    const lines: string[] = [];
    let cur = "";
    for (const w of s.split(" ")) {
      if ((cur + " " + w).length > n && cur) {
        lines.push(cur);
        cur = w;
      } else cur += (cur ? " " : "") + w;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  };
  const edges = c.adjacencies
    .map(([a, b, r], i) => {
      const p = pos[a];
      const q = pos[b];
      if (!p || !q) return "";
      return `<path d="M${p.x + 145} ${p.y + 68} C${p.x + 145} ${p.y + 100 + i * 5} ${q.x + 145} ${q.y + 105 + i * 5} ${q.x + 145} ${q.y + 68}" fill="none" stroke="${r === "separer" ? "#a57240" : "#557d68"}" stroke-width="${r === "directe" ? 3 : 1.6}" stroke-dasharray="${r === "separer" ? "6 4" : "none"}" marker-end="url(#bl-arrow)"/>`;
    })
    .join("");
  const boxes = names
    .map((n) => {
      const p = pos[n]!;
      return `<rect x="${p.x}" y="${p.y}" width="290" height="70" rx="8" fill="#f1f6ee" stroke="#b6cab9"/>${wrap(n)
        .map((t, i) => `<text x="${p.x + 12}" y="${p.y + 22 + i * 18}" font-family="Arial" font-size="13" fill="#214b3a">${esc(t)}</text>`)
        .join("")}`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Schéma fonctionnel des adjacences, hors échelle"><title>${esc(c.title)} · adjacences fonctionnelles</title>` +
    `<defs><marker id="bl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="#48685b"/></marker></defs>` +
    `<rect width="100%" height="100%" fill="#fff"/><text x="25" y="24" font-family="Arial" font-size="12" fill="#62766a">SCHÉMA FONCTIONNEL · hors échelle · aucune implantation ni conformité déduite</text>${edges}${boxes}</svg>`
  );
}

/** `roomSvg(c, s)` : gabarit d'essai dimensionnel — hypothèse rectangulaire indépendante du site, pas un plan. */
export function roomSketchSvg(s: BuildingScenario, roomIndex: number, widthInput: number): string {
  const rooms = s.spaces.filter((x) => x.role === "principal");
  const r = rooms[Math.min(Math.max(0, roomIndex), rooms.length - 1)];
  if (!r) return "";
  const fmt = fmtLib;
  const width = Math.max(0.5, Number(widthInput) || 4);
  const depth = r.unitArea / width;
  const scale = Math.min(430 / Math.max(width, 1), 350 / Math.max(depth, 1));
  const x = 120;
  const y = 80;
  const w = width * scale;
  const d = depth * scale;
  const door = Math.min(0.9, width * 0.3) * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 570" role="img" aria-label="Gabarit hypothétique de surface, non issu d’un plan"><title>Gabarit test · ${esc(r.name)}</title>` +
    `<defs><pattern id="bl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" x2="0" y1="0" y2="6" stroke="#bbc8bf" stroke-width="2"/></pattern></defs>` +
    `<rect width="800" height="570" fill="white"/><g font-family="Arial" fill="#24483d"><text x="30" y="28" font-size="16">GABARIT D’ESSAI · ${esc(r.name).slice(0, 75)}</text>` +
    `<text x="30" y="49" font-size="11">Hypothèse rectangulaire indépendante du site · pas un plan d’exécution · orientation non définie</text>` +
    `<rect x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${d + 16}" fill="url(#bl-hatch)" stroke="#24483d" stroke-width="2"/><rect x="${x}" y="${y}" width="${w}" height="${d}" fill="white" stroke="#24483d" stroke-width="1"/>` +
    `<path d="M${x + 10} ${y + d + 9}V${y + d - 1}H${x + 10 + door}V${y + d + 9}" fill="white" stroke="white" stroke-width="2"/><path d="M${x + 10} ${y + d}V${y + d - door}M${x + 10} ${y + d - door} A${door} ${door} 0 0 1 ${x + 10 + door} ${y + d}" fill="none" stroke="#24483d" stroke-width="1.2"/>` +
    `<text x="${x + w / 2}" y="${y + d / 2}" text-anchor="middle" font-size="16">${fmt(r.unitArea, 2)} m²</text><text x="${x + w / 2}" y="${y + d / 2 + 19}" text-anchor="middle" font-size="11">surface cible / unité</text>` +
    `<g fill="none" stroke="#738779" stroke-width="1"><path d="M${x} ${y - 12}V${y - 30}M${x + w} ${y - 12}V${y - 30}M${x - 5} ${y - 23}H${x + w + 5}"/><path d="M${x + w + 12} ${y}H${x + w + 36}M${x + w + 12} ${y + d}H${x + w + 36}M${x + w + 28} ${y - 5}V${y + d + 5}"/></g>` +
    `<text x="${x + w / 2}" y="${y - 30}" text-anchor="middle" font-size="12">${fmt(width, 2)} m · saisi</text><text x="${x + w + 42}" y="${y + d / 2}" font-size="12" transform="rotate(90 ${x + w + 42} ${y + d / 2})">${fmt(depth, 2)} m · calculé S/L</text>` +
    `<text x="30" y="492" font-size="12">Largeur × profondeur = surface unitaire. Ni capacité, ni accessibilité, ni évacuation validées par ce seul gabarit.</text>` +
    `<text x="30" y="515" font-size="11">Double trait / hachure de mur et arc de porte : symboles de lecture. Épaisseur et porte restent schématiques.</text>` +
    `<path d="M30 540h${scale}m-${scale} -5v10m${scale} -10v10" fill="none" stroke="#24483d" stroke-width="2"/><text x="${35 + scale}" y="544" font-size="11">1 m · échelle graphique ; impression sans échelle imposée</text></g></svg>`
  );
}

/** `csv(c, s)` : programme d'une variante, séparateur « ; », BOM, cellules protégées contre l'injection de formules. */
export function programmeCsv(c: BuildingCase, s: { label: string; spaces: LibrarySpace[] }): string {
  const safe = (x: unknown) => {
    let v = String(x ?? "");
    if (/^[=+@-]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  };
  const rows: unknown[][] = [
    ["Cas", "Scénario", "ID", "Type", "Sous-type", "Espace", "Famille", "Quantité", "Surface_unitaire_m2", "Surface_totale_m2", "Capacité", "Statut", "Source", "Niveau"],
    ...s.spaces.map((x) => [c.title, s.label, x.id, c.type, c.subtype, x.name, PROGRAMME_BUCKET_LABELS[x.bucket] ?? x.bucket, x.quantity, x.unitArea, x.unitArea * x.quantity, x.capacity, LIBRARY_SPACE_STATUS_LABELS[String(x.status)] ?? x.status, x.source, x.level || ""]),
  ];
  return "﻿" + rows.map((r) => r.map(safe).join(";")).join("\r\n");
}

// --- Programme ↔ modèle dessiné (`modelView` / `linkRoom`) ------------------

/** La fiche Harmony d'un local (`h.roomData[roomId]`) : type et cible de programme posés par la liaison. */
export interface HarmonyRoomRecord {
  type?: string;
  programmeSpaceId?: string;
  programmeTargetArea?: number;
  programmeCaseId?: string;
  [k: string]: unknown;
}

export const HYPOTHESIS_STATUSES = ["À confirmer", "À documenter", "À chiffrer", "En étude", "Confirmée par preuve", "Écartée avec motif"] as const;

/**
 * `linkRoom(spaceId, roomId, remove)` : une liaison se fait par identifiant,
 * jamais par ressemblance du nom ; une même zone ne peut pas être affectée à
 * deux lignes ; la fiche Harmony du local reçoit le type et la cible de
 * surface de la ligne. La révision du cas avance en place.
 */
export function linkProgrammeRoom(
  a: ProgrammeCase,
  roomData: Record<string, HarmonyRoomRecord>,
  spaceId: string,
  roomId: string,
  options: { remove?: boolean; roomExists: boolean; now: string },
): { programmeCase: ProgrammeCase; roomData: Record<string, HarmonyRoomRecord> } {
  const space = a.spaces.find((s) => s.id === spaceId);
  if (!space) throw new Error("Espace inconnu");
  const next = clone(a);
  next.roomLinks ??= {};
  const rooms = clone(roomData);
  if (options.remove) {
    next.roomLinks[spaceId] = (next.roomLinks[spaceId] ?? []).filter((x) => x !== roomId);
    const rd = rooms[roomId];
    if (rd?.programmeSpaceId === spaceId) {
      delete rd.programmeSpaceId;
      delete rd.programmeTargetArea;
      delete rd.programmeCaseId;
    }
  } else {
    if (!options.roomExists) throw new Error("Zone absente du modèle");
    if (Object.entries(next.roomLinks).some(([id, arr]) => id !== spaceId && arr.includes(roomId))) throw new Error("Zone déjà affectée à une autre ligne");
    next.roomLinks[spaceId] = [...new Set([...(next.roomLinks[spaceId] ?? []), roomId])];
    const rd = (rooms[roomId] ??= {});
    if ((!rd.type || rd.type === "auto") && space.harmonyType) rd.type = space.harmonyType;
    rd.programmeSpaceId = spaceId;
    rd.programmeTargetArea = space.quantity * space.unitArea;
    rd.programmeCaseId = a.caseId;
  }
  next.updated = options.now;
  next.revision += 1;
  return { programmeCase: next, roomData: rooms };
}

/** Une ligne du tableau « Programme ↔ modèle dessiné » : zones liées, surface dessinée, écart, zones encore disponibles. */
export interface ProgrammeModelLinkRow {
  space: { id: string; name: string; target: number; role: string };
  linked: { id: string; levelName: string; name: string; area: number }[];
  /** Liaisons dont la zone n'est plus dans le modèle (jamais effacées en silence). */
  missing: string[];
  drawnArea: number | null;
  delta: number | null;
  options: { id: string; levelName: string; name: string; area: number }[];
}

/** `modelView()` : les lignes (hors parois) avec leurs zones liées et les zones encore libres. */
export function programmeModelLinks(a: ProgrammeCase, rooms: readonly { id: string; levelName: string; name: string; area: number }[]): ProgrammeModelLinkRow[] {
  const links = a.roomLinks ?? {};
  return a.spaces
    .filter((s) => s.role !== "parois")
    .map((s) => {
      const ids = links[s.id] ?? [];
      const linked = ids.map((id) => rooms.find((r) => r.id === id)).filter((r): r is (typeof rooms)[number] => !!r).map((r) => ({ id: r.id, levelName: r.levelName, name: r.name, area: r.area }));
      const area = linked.reduce((n, r) => n + r.area, 0);
      const options = rooms.filter((r) => !Object.entries(links).some(([sid, arr]) => sid !== s.id && arr.includes(r.id)) && !ids.includes(r.id)).map((r) => ({ id: r.id, levelName: r.levelName, name: r.name, area: r.area }));
      const target = s.unitArea * s.quantity;
      return { space: { id: s.id, name: s.name, target, role: s.role }, linked, missing: ids.filter((id) => !rooms.some((r) => r.id === id)), drawnArea: linked.length ? area : null, delta: linked.length ? area - target : null, options };
    });
}

/** `hypothesisView` : une confirmation ou un écart exige responsable et preuve / motif. */
export function setProgrammeHypothesis(a: ProgrammeCase, hypothesisId: string, key: "status" | "owner" | "proof", value: string, now: string): ProgrammeCase {
  const next = clone(a);
  const h = next.hypotheses.find((x) => x.id === hypothesisId) as (BuildingHypothesis & { updated?: string }) | undefined;
  if (!h) throw new Error("Hypothèse inconnue");
  if (key === "status" && !(HYPOTHESIS_STATUSES as readonly string[]).includes(value)) throw new Error("Statut d’hypothèse inconnu");
  if (key === "status" && (value === "Confirmée par preuve" || value === "Écartée avec motif") && (!(h.proof ?? "").trim() || !(h.owner ?? "").trim())) {
    throw new Error("Renseignez d’abord responsable et preuve / motif.");
  }
  h[key] = value;
  h.updated = now;
  return next;
}

// --- Transfert surfacique à total constant (h7-app, étape 07) ---------------

export interface SurfaceTransfer {
  projectId: string;
  revision: number;
  /** Empreinte des fiches au moment de la comparaison : l'application est refusée si le programme a changé. */
  hash: string;
  from: string;
  to: string;
  amount: number;
  reason: string;
  before: { from: number; to: number; total: number };
  after: { from: number; to: number; total: number };
}

/** `previewTransfer` : deux fiches distinctes, une surface positive disponible, une justification (8 caractères). */
export function previewSurfaceTransfer(a: ProgrammeCase, projectId: string, from: string, to: string, amount: unknown, reason: unknown, hashOf: (v: unknown) => string): SurfaceTransfer {
  const s = a.spaces.find((x) => x.id === from);
  const t = a.spaces.find((x) => x.id === to);
  const n = Number(amount);
  if (!s || !t || from === to || !(s.quantity > 0) || !(t.quantity > 0) || !Number.isFinite(n) || n <= 0 || n > s.quantity * s.unitArea) {
    throw new Error("Deux fiches distinctes et une surface positive disponible sont nécessaires.");
  }
  if (String(reason ?? "").trim().length < 8) throw new Error("Justifiez le transfert et ses conséquences.");
  const total = programmeCaseSums(a.spaces).total;
  return {
    projectId,
    revision: a.revision,
    hash: hashOf(a.spaces),
    from,
    to,
    amount: n,
    reason: String(reason).trim(),
    before: { from: s.quantity * s.unitArea, to: t.quantity * t.unitArea, total },
    after: { from: s.quantity * s.unitArea - n, to: t.quantity * t.unitArea + n, total },
  };
}

/** `applyTransfer` : les deux surfaces unitaires sont recalculées (`editSpace`), le total du programme est inchangé, la géométrie aussi. */
export function applySurfaceTransfer(a: ProgrammeCase, projectId: string, t: SurfaceTransfer, hashOf: (v: unknown) => string, now: string): { programmeCase: ProgrammeCase; total: number } {
  if (!t || t.projectId !== projectId || t.hash !== hashOf(a.spaces)) throw new Error("Le programme a changé. Recalculez la comparaison.");
  const s = a.spaces.find((x) => x.id === t.from);
  const r = a.spaces.find((x) => x.id === t.to);
  if (!s || !r) throw new Error("Deux fiches distinctes et une surface positive disponible sont nécessaires.");
  const sArea = t.after.from / s.quantity;
  const tArea = t.after.to / r.quantity;
  const step1 = editProgrammeSpace(a, s.id, "unitArea", sArea, now);
  // `editSpace` avance la révision à chaque appel : deux appels, comme le prototype.
  const step2 = editProgrammeSpace(step1, r.id, "unitArea", tArea, now);
  return { programmeCase: step2, total: programmeCaseSums(step2.spaces).total };
}
