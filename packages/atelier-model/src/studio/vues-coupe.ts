import type { Primitive, Trait } from "../documents/dessin.js";
import { couperStudio, type StudioCoupe } from "./composition/coupe.js";
import { StudioValidationError, type StudioDocument } from "./document-2d.js";
import { studioSha256 } from "./empreinte-sha256.js";
import { STUDIO_SHEET_SCALES } from "./feuille.js";
import { studioJsonStable } from "./projections.js";

/**
 * Vue de coupe enregistrée (EX-075). Pur : ni React, ni DOM, ni stockage (le serveur range la définition à part des
 * révisions, table `studio_section_views`).
 *
 * Une vue conserve : ses **révisions sources** (étude, variante, révision, empreinte du document), son **niveau et son
 * repère** (plan horizontal z = cote du `local-3d`, conversion explicite vers le `local-2d` de la vue), son **cadrage**
 * (fenêtre de la vue, en mètres du `local-2d`), son **échelle de présentation**, sa **visibilité** (calques coupés), ses
 * **styles** (trait de coupe, hachure) et ses **annotations propres**.
 *
 * - La coupe est **dérivée** du modèle (`couperStudio`) puis découpée au cadrage : jamais une donnée du document.
 * - Une vue dérivée du 3D devient **périmée** quand la tête de sa variante n'est plus sa révision source
 *   (`actualiteVueCoupe`) ; elle n'est jamais réécrite en silence : `rebaserVueCoupe` la recalcule sur une nouvelle
 *   révision en gardant cadrage, échelle, visibilité, styles et annotations.
 * - Ses annotations propres appartiennent à la vue : les ajouter, les modifier ou les retirer (`annoterVueCoupe`) ne
 *   touche jamais le document ni les paramètres d'un objet source (aucune commande, aucune écriture du modèle).
 */

export const STUDIO_VUE_COUPE_SCHEMA = "studio-vue-coupe/1" as const;
export const STUDIO_LIMITES_VUE_COUPE = Object.freeze({ nom: 200, texte: 500, annotations: 200, calques: 200 });

export type StudioTraitCoupe = "fin" | "moyen" | "fort";
export type StudioHachureCoupe = "aucune" | "diagonale" | "croisee";
export const STUDIO_TRAITS_COUPE: readonly StudioTraitCoupe[] = Object.freeze(["fin", "moyen", "fort"] as const);
export const STUDIO_HACHURES_COUPE: readonly StudioHachureCoupe[] = Object.freeze(["aucune", "diagonale", "croisee"] as const);

export interface StudioCadrage { xMin: number; yMin: number; xMax: number; yMax: number }

/** Annotation propre de la vue (repère `local-2d` de la vue). */
export interface StudioAnnotationVueCoupe {
  id: string;
  type: "texte" | "repere";
  position: { x: number; y: number };
  texte: string;
}

export interface StudioVueCoupeDefinition {
  nom: string;
  /** Niveau de coupe : plan horizontal z = cote, dans le repère `local-3d`. */
  niveau: { repere: "local-3d"; z: number };
  cadrage: StudioCadrage;
  /** Échelle de présentation 1:n. */
  echelle: (typeof STUDIO_SHEET_SCALES)[number];
  /** Calques coupés ; absent : calques visibles de la révision. */
  visibilite?: { calques: string[] };
  styles: { trait: StudioTraitCoupe; hachure: StudioHachureCoupe };
  annotations: StudioAnnotationVueCoupe[];
}

export interface StudioSourceVueCoupe {
  studyId: string;
  variantId: string;
  revisionId: string;
  documentHash: string;
}

export interface StudioVueCoupe {
  schema: typeof STUDIO_VUE_COUPE_SCHEMA;
  id: string;
  definition: StudioVueCoupeDefinition;
  /** Révisions sources examinées. */
  sources: StudioSourceVueCoupe[];
  repere: { source: "local-3d"; vue: "local-2d"; conversion: "(x, y, z) → (x, y)" };
  /** Section dérivée, découpée au cadrage et réduite aux calques retenus. */
  coupe: StudioCoupe;
  /** Segments écartés par le cadrage (entièrement hors fenêtre). */
  horsCadrage: number;
  /** SHA-256 de la section dérivée (sources et coupe) : change quand le modèle change, pas quand une annotation change. */
  empreinteSection: string;
  /** SHA-256 de la vue entière (définition comprise). */
  empreinte: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const fini = (v: unknown, chemin: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 2e9) throw new StudioValidationError(chemin, "nombre fini attendu");
  return v;
};
const texte = (v: unknown, max: number, chemin: string): string => {
  if (typeof v !== "string") throw new StudioValidationError(chemin, "texte attendu");
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) throw new StudioValidationError(chemin, "texte non vide attendu");
  if (t.length > max) throw new StudioValidationError(chemin, `${max} caractères au plus`);
  return t;
};

function validerAnnotation(a: StudioAnnotationVueCoupe, chemin: string): StudioAnnotationVueCoupe {
  if (!a || typeof a !== "object") throw new StudioValidationError(chemin, "annotation attendue");
  if (a.type !== "texte" && a.type !== "repere") throw new StudioValidationError(`${chemin}.type`, "« texte » ou « repere » attendu");
  return { id: texte(a.id, 128, `${chemin}.id`), type: a.type, position: { x: fini(a.position?.x, `${chemin}.position.x`), y: fini(a.position?.y, `${chemin}.position.y`) }, texte: texte(a.texte, STUDIO_LIMITES_VUE_COUPE.texte, `${chemin}.texte`) };
}

/** Définition contrôlée et normalisée ; lève `StudioValidationError`. */
export function validerVueCoupe(def: StudioVueCoupeDefinition): StudioVueCoupeDefinition {
  if (!def || typeof def !== "object") throw new StudioValidationError("vue", "définition attendue");
  const nom = texte(def.nom, STUDIO_LIMITES_VUE_COUPE.nom, "vue.nom");
  if (def.niveau?.repere !== "local-3d") throw new StudioValidationError("vue.niveau.repere", "repère « local-3d » attendu");
  const z = fini(def.niveau.z, "vue.niveau.z");
  const c = def.cadrage;
  const cadrage = { xMin: fini(c?.xMin, "vue.cadrage.xMin"), yMin: fini(c?.yMin, "vue.cadrage.yMin"), xMax: fini(c?.xMax, "vue.cadrage.xMax"), yMax: fini(c?.yMax, "vue.cadrage.yMax") };
  if (!(cadrage.xMax > cadrage.xMin && cadrage.yMax > cadrage.yMin)) throw new StudioValidationError("vue.cadrage", "fenêtre non vide attendue (xMax > xMin, yMax > yMin)");
  if (!(STUDIO_SHEET_SCALES as readonly number[]).includes(def.echelle)) throw new StudioValidationError("vue.echelle", "échelle 1:20, 1:50, 1:100, 1:200 ou 1:500 attendue");
  if (!STUDIO_TRAITS_COUPE.includes(def.styles?.trait)) throw new StudioValidationError("vue.styles.trait", "trait fin, moyen ou fort attendu");
  if (!STUDIO_HACHURES_COUPE.includes(def.styles.hachure)) throw new StudioValidationError("vue.styles.hachure", "hachure aucune, diagonale ou croisée attendue");
  let visibilite: StudioVueCoupeDefinition["visibilite"];
  if (def.visibilite !== undefined) {
    const calques = def.visibilite?.calques;
    if (!Array.isArray(calques) || calques.length > STUDIO_LIMITES_VUE_COUPE.calques || calques.some((x) => typeof x !== "string" || !x)) throw new StudioValidationError("vue.visibilite.calques", "liste de calques attendue");
    visibilite = { calques: [...new Set(calques)] };
  }
  if (!Array.isArray(def.annotations) || def.annotations.length > STUDIO_LIMITES_VUE_COUPE.annotations) throw new StudioValidationError("vue.annotations", "liste d'annotations attendue");
  const annotations = def.annotations.map((a, i) => validerAnnotation(a, `vue.annotations.${i}`));
  if (new Set(annotations.map((a) => a.id)).size !== annotations.length) throw new StudioValidationError("vue.annotations", "identifiant d'annotation en double");
  return { nom, niveau: { repere: "local-3d", z }, cadrage, echelle: def.echelle, ...(visibilite ? { visibilite } : {}), styles: { trait: def.styles.trait, hachure: def.styles.hachure }, annotations };
}

/** Découpe d'un segment à la fenêtre (Liang-Barsky) ; null s'il est entièrement dehors. */
function decouperSegment(a: { x: number; y: number }, b: { x: number; y: number }, f: StudioCadrage): [{ x: number; y: number }, { x: number; y: number }] | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - f.xMin], [dx, f.xMax - a.x], [-dy, a.y - f.yMin], [dy, f.yMax - a.y]] as const) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}

function deriver(def: StudioVueCoupeDefinition, doc: StudioDocument): { coupe: StudioCoupe; horsCadrage: number } {
  const brute = couperStudio(doc, { z: def.niveau.z });
  const calqueDe = new Map<string, string>([...(doc.solides ?? []), ...(doc.exacts ?? [])].map((s) => [s.id, s.layerId ?? "default"]));
  const garde = def.visibilite ? new Set(def.visibilite.calques) : null;
  let horsCadrage = 0;
  const segments = brute.segments.filter((s) => !garde || garde.has(calqueDe.get(s.source) ?? "default")).flatMap((s) => {
    const d = decouperSegment(s.start, s.end, def.cadrage);
    if (!d) { horsCadrage++; return []; }
    return [{ ...s, start: d[0], end: d[1] }];
  });
  const compte = new Map<string, number>();
  for (const s of segments) compte.set(s.source, (compte.get(s.source) ?? 0) + 1);
  // Solides non coupés (plan sur une face horizontale d'un maillage, section non dérivable) : gardés, filtrés seulement
  // par la visibilité déclarée de la vue — jamais tus (la page et le manifeste les nomment, AGENTS.md L9).
  const exactsNonCoupes = brute.exactsNonCoupes.filter((id) => !garde || garde.has(calqueDe.get(id) ?? "default"));
  return { coupe: { ...brute, segments, sources: brute.sources.filter((s) => compte.has(s.id)).map((s) => ({ id: s.id, segments: compte.get(s.id)! })), exactsNonCoupes }, horsCadrage };
}

function validerSource(s: StudioSourceVueCoupe): StudioSourceVueCoupe {
  for (const k of ["studyId", "variantId", "revisionId"] as const) texte(s?.[k], 200, `source.${k}`);
  if (typeof s.documentHash !== "string" || !HEX64.test(s.documentHash)) throw new StudioValidationError("source.documentHash", "empreinte SHA-256 attendue");
  return { studyId: s.studyId, variantId: s.variantId, revisionId: s.revisionId, documentHash: s.documentHash };
}

/** Vue de coupe d'une révision identifiée : section dérivée, découpée au cadrage ; le document n'est jamais modifié. */
export function creerVueCoupe(id: string, definition: StudioVueCoupeDefinition, doc: StudioDocument, source: StudioSourceVueCoupe): StudioVueCoupe {
  texte(id, 200, "vue.id");
  const def = validerVueCoupe(definition);
  const s = validerSource(source);
  const { coupe, horsCadrage } = deriver(def, doc);
  const empreinteSection = studioSha256(studioJsonStable({ schema: "studio-section/1", sources: [s], niveau: def.niveau, cadrage: def.cadrage, visibilite: def.visibilite ?? null, coupe }));
  const corps = { schema: STUDIO_VUE_COUPE_SCHEMA, id, definition: def, sources: [s], repere: { source: "local-3d" as const, vue: "local-2d" as const, conversion: "(x, y, z) → (x, y)" as const }, coupe, horsCadrage, empreinteSection };
  return { ...corps, empreinte: studioSha256(studioJsonStable(corps)) };
}

/** Actualité d'une vue dérivée du 3D : périmée dès que la tête d'une variante source n'est plus sa révision. */
export function actualiteVueCoupe(vue: Pick<StudioVueCoupe, "sources">, tetes: ReadonlyMap<string, string | null>): { actualite: "a-jour" | "perimee"; ecarts: { variantId: string; revisionSource: string; revisionCourante: string | null }[] } {
  const ecarts = vue.sources.filter((s) => (tetes.get(s.variantId) ?? null) !== s.revisionId)
    .map((s) => ({ variantId: s.variantId, revisionSource: s.revisionId, revisionCourante: tetes.get(s.variantId) ?? null }));
  return { actualite: ecarts.length ? "perimee" : "a-jour", ecarts };
}

export type StudioOperationAnnotationVue =
  | { op: "ajouter"; annotation: StudioAnnotationVueCoupe }
  | { op: "modifier"; annotation: StudioAnnotationVueCoupe }
  | { op: "retirer"; id: string };

/**
 * Modifie les annotations propres de la vue (définition seule) : la section, ses sources et le document ne changent pas.
 * Renvoie la nouvelle définition contrôlée ; lève `StudioValidationError` (annotation inconnue, en double…).
 */
export function annoterVueCoupe(def: StudioVueCoupeDefinition, operation: StudioOperationAnnotationVue): StudioVueCoupeDefinition {
  const d = validerVueCoupe(def);
  let annotations = d.annotations;
  if (operation.op === "ajouter") {
    if (annotations.some((a) => a.id === operation.annotation?.id)) throw new StudioValidationError("annotation.id", "annotation déjà présente");
    annotations = [...annotations, operation.annotation];
  } else if (operation.op === "modifier") {
    if (!annotations.some((a) => a.id === operation.annotation?.id)) throw new StudioValidationError("annotation.id", "annotation inconnue de la vue");
    annotations = annotations.map((a) => (a.id === operation.annotation.id ? operation.annotation : a));
  } else {
    if (!annotations.some((a) => a.id === operation.id)) throw new StudioValidationError("annotation.id", "annotation inconnue de la vue");
    annotations = annotations.filter((a) => a.id !== operation.id);
  }
  return validerVueCoupe({ ...d, annotations });
}

/** Recalcule une vue périmée sur une nouvelle révision : cadrage, échelle, visibilité, styles et annotations conservés. */
export function rebaserVueCoupe(vue: StudioVueCoupe, doc: StudioDocument, source: StudioSourceVueCoupe): StudioVueCoupe {
  return creerVueCoupe(vue.id, vue.definition, doc, source);
}

const A4_PAYSAGE = { largeur: 297, hauteur: 210 };
const TRAIT_DE: Readonly<Record<StudioTraitCoupe, Trait>> = Object.freeze({ fin: "fin", moyen: "vue", fort: "coupe" });

/** Mention portée par une page de coupe incomplète (solides non coupés), ou null si la section est complète. */
export function mentionSolidesOmis(omis: readonly string[]): string | null {
  return omis.length ? `Section incomplète : ${omis.length} solide(s) non coupé(s) — plan sur une face horizontale ou section non dérivable — absents de cette page : ${omis.join(", ")}` : null;
}

/**
 * Page A4 paysage d'une vue de coupe (dossier, publication) : fenêtre du cadrage à l'échelle déclarée (réduite si elle
 * déborde, et alors déclarée), segments de la section au trait choisi, annotations propres, cartouche de provenance
 * (révision, empreinte de la section, repère et niveau). Rien n'est ajouté au modèle. Une section incomplète (solides
 * non coupés, `coupe.exactsNonCoupes`) n'est jamais présentée comme complète : la page porte la mention nommant chaque
 * solide omis et rend la liste (`omis`), reprise au manifeste de publication.
 */
export function pageVueCoupe(vue: StudioVueCoupe): { largeurMm: number; hauteurMm: number; primitives: Primitive[]; echelleImprimee: number; omis: string[] } {
  const d = vue.definition;
  const zone = { x: 15, y: 30, l: A4_PAYSAGE.largeur - 30, h: A4_PAYSAGE.hauteur - 55 };
  const lm = d.cadrage.xMax - d.cadrage.xMin, hm = d.cadrage.yMax - d.cadrage.yMin;
  // Millimètres de feuille par mètre : 1000 / n à l'échelle 1:n, réduit si la fenêtre ne tient pas.
  const voulu = 1000 / d.echelle;
  const mmParM = Math.min(voulu, zone.l / lm, zone.h / hm);
  const echelleImprimee = Math.round(1000 / mmParM);
  const versFeuille = (p: { x: number; y: number }) => ({ x: zone.x + (p.x - d.cadrage.xMin) * mmParM, y: zone.y + (p.y - d.cadrage.yMin) * mmParM });
  const primitives: Primitive[] = [
    { type: "poly", points: [{ x: 0, y: 0 }, { x: A4_PAYSAGE.largeur, y: 0 }, { x: A4_PAYSAGE.largeur, y: A4_PAYSAGE.hauteur }, { x: 0, y: A4_PAYSAGE.hauteur }], ferme: true, trait: null, remplissage: "blanc", objetId: null },
    { type: "poly", points: [versFeuille({ x: d.cadrage.xMin, y: d.cadrage.yMin }), versFeuille({ x: d.cadrage.xMax, y: d.cadrage.yMin }), versFeuille({ x: d.cadrage.xMax, y: d.cadrage.yMax }), versFeuille({ x: d.cadrage.xMin, y: d.cadrage.yMax })], ferme: true, trait: "fin", remplissage: null, objetId: "cadrage" },
    { type: "texte", position: { x: 15, y: A4_PAYSAGE.hauteur - 15 }, texte: d.nom, hauteurMm: 5, ancre: "debut", angle: 0, trait: "annotation", objetId: "titre" },
  ];
  for (const s of vue.coupe.segments) primitives.push({ type: "ligne", a: versFeuille(s.start), b: versFeuille(s.end), trait: TRAIT_DE[d.styles.trait], objetId: s.source });
  for (const a of d.annotations) primitives.push({ type: "texte", position: versFeuille(a.position), texte: a.texte, hauteurMm: 2.5, ancre: "debut", angle: 0, trait: "annotation", objetId: a.id });
  const src = vue.sources[0]!;
  const ligne = `Coupe à z = ${d.niveau.z} m (local-3d → local-2d) · échelle 1:${echelleImprimee}${echelleImprimee !== d.echelle ? ` (déclarée 1:${d.echelle}, réduite pour tenir)` : ""} · hachure ${d.styles.hachure} · variante ${src.variantId} · révision ${src.revisionId} · empreinte de la section ${vue.empreinteSection.slice(0, 16)}`;
  primitives.push({ type: "texte", position: { x: 15, y: 12 }, texte: ligne, hauteurMm: 2.2, ancre: "debut", angle: 0, trait: "annotation", objetId: "provenance" });
  const omis = [...(vue.coupe.exactsNonCoupes ?? [])];
  const mention = mentionSolidesOmis(omis);
  if (mention) primitives.push({ type: "texte", position: { x: 15, y: 20 }, texte: mention, hauteurMm: 3, ancre: "debut", angle: 0, trait: "coupe", objetId: "solides-omis" });
  return { largeurMm: A4_PAYSAGE.largeur, hauteurMm: A4_PAYSAGE.hauteur, primitives, echelleImprimee, omis };
}
