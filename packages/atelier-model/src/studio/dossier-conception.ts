import type { Primitive } from "../documents/dessin.js";
import { pdfPages } from "../documents/rendu-pdf.js";
import { bilanQuantitesStudio, type BilanQuantitesStudio, type LigneBilanQuantites, type TotalBilan } from "./bilan-quantites.js";
import { STUDIO_DEFAULT_LAYER_ID, StudioValidationError, validateStudioDocument, type StudioDocument } from "./document-2d.js";
import { studioRapportFidelite, type StudioRapportFidelite } from "./echanges/rapport-fidelite.js";
import { studioSha256 } from "./empreinte-sha256.js";
import {
  composerFeuilleStudio, STUDIO_SHEET_FORMATS, STUDIO_SHEET_SCALES, studioSheetPrimitives, studioSheetSvg,
  type StudioSheet, type StudioSheetFormat, type StudioSheetOrientation, type StudioSheetScaleChoice, type StudioSheetTitleBlock,
} from "./feuille.js";
import { studioJsonStable } from "./projections.js";
import type { EvaluationAjustementsQuantites } from "./quantites-ajustements.js";

/**
 * Production documentaire Studio (lot E.3) : vues documentaires (E.3-01), feuilles composées (E.3-02) et dossier de
 * conception du pilote (E.3-03). Pur et déterministe : ni React, ni DOM, ni stockage ; mêmes entrées, mêmes octets.
 *
 * - **Vue documentaire** : produite à partir d'une source **identifiée** — étude, variante, révision et empreinte
 *   SHA-256 de son document — et d'une vue source déclarée (la planche 2D, réduite aux calques choisis ou visibles).
 *   Elle porte l'empreinte SHA-256 de ses propres données (`empreinteDonnees`) : deux vues de mêmes données ont la même
 *   empreinte, une donnée changée la change.
 * - **Feuille composée** : objet distinct de la planche de travail (type `studio-feuille-composee/1`, définition
 *   propre : numéro, titre, format, échelle, vue source, cartouche). Elle **lit** la révision source ; elle ne la modifie
 *   jamais (aucune commande, aucune écriture). Son cartouche ne porte que des valeurs réelles ou saisies ; toute valeur
 *   absente est imprimée « non évalué », jamais devinée.
 * - **Dossier de conception** : liste ordonnée de feuilles, métré (brut, déductions et net séparés, ajustements manuels
 *   rapportés à part) et rapport de fidélité de chaque feuille ; empreinte SHA-256 du dossier entier. Le PDF assemble un
 *   sommaire, les feuilles, le métré et la fidélité. Les documents produits ne sont pas traduits.
 */

export const STUDIO_VUE_DOCUMENTAIRE_SCHEMA = "studio-vue-documentaire/1" as const;
export const STUDIO_FEUILLE_COMPOSEE_SCHEMA = "studio-feuille-composee/1" as const;
export const STUDIO_DOSSIER_CONCEPTION_SCHEMA = "studio-dossier-conception/1" as const;
/** Valeur absente d'un document produit. */
export const STUDIO_NON_EVALUE = "non évalué" as const;
export const STUDIO_LIMITES_DOSSIER = Object.freeze({ numero: 20, titre: 200, champ: 200, feuilles: 50, calques: 200 });

/** Source identifiée d'une vue : la révision immuable d'une variante, et l'empreinte de son document. */
export interface StudioSourceDocumentaire {
  studyId: string;
  studyName?: string;
  variantId: string;
  variantName?: string;
  revisionId: string;
  /** Date de la révision (ISO 8601). */
  revisionDate?: string;
  /** SHA-256 du JSON canonique du document de la révision (même empreinte que les publications). */
  documentHash: string;
}

/** Vue source déclarée : la planche 2D, réduite aux calques choisis (absents : calques visibles de la révision). */
export interface StudioVueSourceSpec {
  type: "planche-2d";
  calques?: string[];
}

export interface StudioVueDocumentaire {
  schema: typeof STUDIO_VUE_DOCUMENTAIRE_SCHEMA;
  id: string;
  nature: "plan";
  source: StudioSourceDocumentaire;
  vueSource: { type: "planche-2d"; selection: "calques-visibles" | "calques-choisis"; calques: string[] };
  /** SHA-256 des données de la vue (JSON canonique de la vue source et du document réduit). */
  empreinteDonnees: string;
  /** Éléments de la révision repris par la vue. */
  elements: { objets: number; cotes: number; annotations: number; architecture: number };
  /** Éléments de la révision qui ne sont pas dans la vue (calque non retenu, ou hors plan 2D). */
  exclus: { horsCalques: number; solides: number; proprietes: number; scenes: number };
}

const HEX64 = /^[0-9a-f]{64}$/;
const texte = (v: unknown, max: number, chemin: string, requis = true): string | undefined => {
  if (v === undefined && !requis) return undefined;
  if (typeof v !== "string") throw new StudioValidationError(chemin, "texte attendu");
  const t = v.replace(/\s+/g, " ").trim();
  if (requis && !t) throw new StudioValidationError(chemin, "texte non vide attendu");
  if (t.length > max) throw new StudioValidationError(chemin, `${max} caractères au plus`);
  return t || undefined;
};

function validerSource(s: StudioSourceDocumentaire): StudioSourceDocumentaire {
  if (!s || typeof s !== "object") throw new StudioValidationError("source", "source identifiée attendue");
  for (const k of ["studyId", "variantId", "revisionId"] as const) texte(s[k], 200, `source.${k}`);
  if (typeof s.documentHash !== "string" || !HEX64.test(s.documentHash)) throw new StudioValidationError("source.documentHash", "empreinte SHA-256 attendue");
  return {
    studyId: s.studyId, ...(s.studyName !== undefined ? { studyName: texte(s.studyName, 200, "source.studyName", false) ?? "" } : {}),
    variantId: s.variantId, ...(s.variantName !== undefined ? { variantName: texte(s.variantName, 200, "source.variantName", false) ?? "" } : {}),
    revisionId: s.revisionId, ...(s.revisionDate !== undefined ? { revisionDate: texte(s.revisionDate, 40, "source.revisionDate", false) ?? "" } : {}),
    documentHash: s.documentHash,
  };
}

/** Calques d'un document, le calque implicite compris s'il porte un élément. */
function calquesDe(doc: StudioDocument): { id: string; name: string; visible: boolean }[] {
  const declares = doc.layers ?? [];
  if (declares.some((l) => l.id === STUDIO_DEFAULT_LAYER_ID)) return declares;
  return [{ id: STUDIO_DEFAULT_LAYER_ID, name: "0", visible: true }, ...declares];
}

const calque = (o: { layerId?: string }): string => o.layerId ?? STUDIO_DEFAULT_LAYER_ID;

/**
 * Données d'une vue : le document de la révision réduit aux calques retenus (tous rendus visibles), sans solides,
 * propriétés ni scènes (hors plan 2D). Une cote liée à un objet écarté garde sa géométrie ; son lien est détaché.
 */
export function studioDonneesVue(source: StudioDocument, spec: StudioVueSourceSpec): { document: StudioDocument; vueSource: StudioVueDocumentaire["vueSource"]; exclus: StudioVueDocumentaire["exclus"] } {
  const doc = validateStudioDocument(source);
  if (!spec || spec.type !== "planche-2d") throw new StudioValidationError("vueSource.type", "« planche-2d » attendu");
  const tous = calquesDe(doc);
  let retenus: string[];
  let selection: "calques-visibles" | "calques-choisis";
  if (spec.calques === undefined) {
    retenus = tous.filter((l) => l.visible).map((l) => l.id);
    selection = "calques-visibles";
  } else {
    if (!Array.isArray(spec.calques) || spec.calques.length > STUDIO_LIMITES_DOSSIER.calques) throw new StudioValidationError("vueSource.calques", "liste de calques attendue");
    const connus = new Set(tous.map((l) => l.id));
    for (const [i, id] of spec.calques.entries()) if (typeof id !== "string" || !connus.has(id)) throw new StudioValidationError(`vueSource.calques.${i}`, "calque inconnu de la révision");
    // Ordre du document, sans doublon.
    const voulus = new Set(spec.calques);
    retenus = tous.filter((l) => voulus.has(l.id)).map((l) => l.id);
    selection = "calques-choisis";
  }
  const garde = new Set(retenus);
  const objects = doc.objects.filter((o) => garde.has(calque(o)));
  const ids = new Set(objects.map((o) => o.id));
  const detacher = <L extends { objectId: string } | null>(l: L): L | null => (l && !ids.has(l.objectId) ? null : l);
  const dimensions = (doc.dimensions ?? []).filter((d) => garde.has(calque(d))).map((d) => ({ ...d, links: { start: detacher(d.links.start), end: detacher(d.links.end) } }));
  const annotations = (doc.annotations ?? []).filter((a) => garde.has(calque(a))).map((a) => (a.type === "angular-dimension" ? { ...a, links: { first: detacher(a.links.first), second: detacher(a.links.second) } } : a));
  const archi = doc.architecture ?? [];
  const murs = new Set(archi.filter((x) => x.type === "wall" && garde.has(calque(x))).map((x) => x.id));
  const architecture = archi.filter((x) => (x.type === "wall" ? murs.has(x.id) : murs.has(x.hostId)));
  const layers = (doc.layers ?? []).filter((l) => garde.has(l.id)).map((l) => ({ ...l, visible: true }));
  const reduit: StudioDocument = {
    id: doc.id, schemaVersion: doc.schemaVersion, units: doc.units, frame: doc.frame, objects,
    ...(layers.length ? { layers } : {}), ...(dimensions.length ? { dimensions } : {}), ...(annotations.length ? { annotations } : {}), ...(architecture.length ? { architecture } : {}),
  } as StudioDocument;
  const horsCalques = (doc.objects.length - objects.length) + ((doc.dimensions ?? []).length - dimensions.length) + ((doc.annotations ?? []).length - annotations.length) + (archi.length - architecture.length);
  return {
    document: validateStudioDocument(reduit),
    vueSource: { type: "planche-2d", selection, calques: retenus },
    exclus: { horsCalques, solides: doc.solides?.length ?? 0, proprietes: doc.proprietes?.length ?? 0, scenes: doc.scenes?.length ?? 0 },
  };
}

/** Vue documentaire d'une révision identifiée ; renvoie aussi le document réduit qu'elle dessine. */
export function produireVueDocumentaire(doc: StudioDocument, source: StudioSourceDocumentaire, spec: StudioVueSourceSpec, id: string): { vue: StudioVueDocumentaire; document: StudioDocument } {
  const s = validerSource(source);
  texte(id, 200, "vue.id");
  const d = studioDonneesVue(doc, spec);
  const empreinteDonnees = studioSha256(studioJsonStable({ schema: "studio-vue-donnees/1", vueSource: d.vueSource, document: d.document }));
  const r = d.document;
  return {
    document: r,
    vue: {
      schema: STUDIO_VUE_DOCUMENTAIRE_SCHEMA, id, nature: "plan", source: s, vueSource: d.vueSource, empreinteDonnees,
      elements: { objets: r.objects.length, cotes: r.dimensions?.length ?? 0, annotations: r.annotations?.length ?? 0, architecture: r.architecture?.length ?? 0 },
      exclus: d.exclus,
    },
  };
}

// ——— Feuilles composées (E.3-02) ———

/** Définition d'une feuille composée : objet propre, distinct de la planche de travail (qu'il ne modifie jamais). */
export interface StudioFeuilleComposeeDefinition {
  numero: string;
  titre: string;
  format: StudioSheetFormat;
  orientation: StudioSheetOrientation;
  echelle: StudioSheetScaleChoice;
  vueSource: StudioVueSourceSpec;
  /** Champs saisis du cartouche ; un champ absent est imprimé « non évalué ». */
  cartouche?: { auteur?: string };
}

/** Projet du cartouche : valeurs réelles seulement. */
export interface StudioProjetDocumentaire {
  projectCode?: string;
  projectName?: string;
}

/** Définition contrôlée et normalisée (espaces réduits, champs vides retirés) ; lève `StudioValidationError`. */
export function validerFeuilleComposee(def: StudioFeuilleComposeeDefinition): StudioFeuilleComposeeDefinition {
  if (!def || typeof def !== "object") throw new StudioValidationError("feuille", "définition attendue");
  const numero = texte(def.numero, STUDIO_LIMITES_DOSSIER.numero, "feuille.numero")!;
  const titre = texte(def.titre, STUDIO_LIMITES_DOSSIER.titre, "feuille.titre")!;
  if (!(def.format in STUDIO_SHEET_FORMATS)) throw new StudioValidationError("feuille.format", "format A4, A3, A2 ou A1 attendu");
  if (def.orientation !== "portrait" && def.orientation !== "paysage") throw new StudioValidationError("feuille.orientation", "portrait ou paysage attendu");
  if (def.echelle !== "ajuster" && !(STUDIO_SHEET_SCALES as readonly number[]).includes(def.echelle)) throw new StudioValidationError("feuille.echelle", "échelle 1:20, 1:50, 1:100, 1:200, 1:500 ou « ajuster » attendue");
  if (!def.vueSource || def.vueSource.type !== "planche-2d") throw new StudioValidationError("feuille.vueSource.type", "« planche-2d » attendu");
  if (def.vueSource.calques !== undefined && (!Array.isArray(def.vueSource.calques) || def.vueSource.calques.some((c) => typeof c !== "string"))) {
    throw new StudioValidationError("feuille.vueSource.calques", "liste de calques attendue");
  }
  const auteur = def.cartouche?.auteur === undefined ? undefined : texte(def.cartouche.auteur, STUDIO_LIMITES_DOSSIER.champ, "feuille.cartouche.auteur", false);
  return {
    numero, titre, format: def.format, orientation: def.orientation, echelle: def.echelle,
    vueSource: { type: "planche-2d", ...(def.vueSource.calques !== undefined ? { calques: [...new Set(def.vueSource.calques)] } : {}) },
    ...(auteur ? { cartouche: { auteur } } : {}),
  };
}

const ou = (v: string | undefined): string => (v && v.trim() ? v.trim() : STUDIO_NON_EVALUE);

export interface StudioFeuilleComposee {
  schema: typeof STUDIO_FEUILLE_COMPOSEE_SCHEMA;
  id: string;
  definition: StudioFeuilleComposeeDefinition;
  vue: StudioVueDocumentaire;
  /** Cartouche imprimé, valeur par valeur (« non évalué » pour toute valeur absente). */
  cartouche: Required<StudioSheetTitleBlock>;
  echelle: string;
  decoupee: boolean;
  /** SHA-256 de la feuille : définition, empreinte des données de sa vue et cartouche. */
  empreinte: string;
}

/** Ligne de provenance imprimée sous le cadre de la feuille. */
export function studioLigneProvenance(f: Pick<StudioFeuilleComposee, "definition" | "vue">): string {
  const v = f.vue;
  const calques = v.vueSource.calques.length ? v.vueSource.calques.join(", ") : "aucun";
  return `Feuille ${f.definition.numero} · vue ${v.id} : planche 2D (${v.vueSource.selection === "calques-visibles" ? "calques visibles" : "calques choisis"} : ${calques})`
    + ` · variante ${ou(v.source.variantName)} · révision ${v.source.revisionId} · empreinte des données ${v.empreinteDonnees.slice(0, 16)}`;
}

/** Compose une feuille : vue documentaire de la révision source, cartouche sans donnée inventée, provenance imprimée. */
export function composerFeuilleComposee(id: string, definition: StudioFeuilleComposeeDefinition, doc: StudioDocument, source: StudioSourceDocumentaire, projet: StudioProjetDocumentaire = {}): { feuille: StudioFeuilleComposee; rendu: StudioSheet } {
  const def = validerFeuilleComposee(definition);
  const { vue, document } = produireVueDocumentaire(doc, source, def.vueSource, `${id}:vue`);
  const cartouche: Required<StudioSheetTitleBlock> = {
    projectCode: ou(projet.projectCode), projectName: ou(projet.projectName), study: ou(vue.source.studyName), variant: ou(vue.source.variantName),
    title: `${def.numero} — ${def.titre}`, revisionId: vue.source.revisionId, revisionDate: ou(vue.source.revisionDate?.slice(0, 10)), author: ou(def.cartouche?.auteur),
  };
  const provenance = studioLigneProvenance({ definition: def, vue });
  const rendu = composerFeuilleStudio(document, { format: def.format, orientation: def.orientation, scale: def.echelle, titleBlock: cartouche, architecture: true, provenance });
  const empreinte = studioSha256(studioJsonStable({ schema: STUDIO_FEUILLE_COMPOSEE_SCHEMA, definition: def, empreinteDonnees: vue.empreinteDonnees, source: vue.source, cartouche }));
  return {
    feuille: { schema: STUDIO_FEUILLE_COMPOSEE_SCHEMA, id, definition: def, vue, cartouche, echelle: rendu.scale.label, decoupee: rendu.clipped, empreinte },
    rendu,
  };
}

/** SVG d'une feuille composée : la feuille de présentation et ses métadonnées de provenance. */
export function studioFeuilleComposeeSvg(f: StudioFeuilleComposee, rendu: StudioSheet): string {
  const svg = studioSheetSvg(rendu);
  const attrs = ` data-feuille="${esc(f.id)}" data-vue="${esc(f.vue.id)}" data-variante="${esc(f.vue.source.variantId)}" data-revision="${esc(f.vue.source.revisionId)}" data-document-hash="${f.vue.source.documentHash}" data-empreinte-donnees="${f.vue.empreinteDonnees}" data-empreinte-feuille="${f.empreinte}"`;
  return svg.replace(/<svg /, `<svg${attrs} `);
}
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ——— Dossier de conception (E.3-03) ———

export interface StudioDossierFeuilleEntree {
  id: string;
  definition: StudioFeuilleComposeeDefinition;
  document: StudioDocument;
  source: StudioSourceDocumentaire;
}

export interface StudioDossierEntree {
  titre: string;
  projet?: StudioProjetDocumentaire;
  etude: { id: string; nom?: string };
  /** Feuilles dans l'ordre du dossier. */
  feuilles: StudioDossierFeuilleEntree[];
  /** Métré d'une révision identifiée ; absent : le métré n'est pas joint (et le dossier le dit). */
  metre?: { document: StudioDocument; source: StudioSourceDocumentaire; ajustements?: EvaluationAjustementsQuantites } | null;
  /** Joindre le rapport de fidélité de chaque feuille. */
  fidelite?: boolean;
}

export interface StudioDossierFidelite {
  feuilleId: string;
  numero: string;
  /** Tracé 2D de la feuille (capacités SVG : même tracé que la feuille), sur les données de sa vue. */
  rapport: StudioRapportFidelite;
  exclus: StudioVueDocumentaire["exclus"];
}

export interface StudioDossierConception {
  schema: typeof STUDIO_DOSSIER_CONCEPTION_SCHEMA;
  titre: string;
  projet: { code: string; nom: string };
  etude: { id: string; nom: string };
  feuilles: (Omit<StudioFeuilleComposee, "schema"> & { ordre: number })[];
  metre: null | {
    source: StudioSourceDocumentaire;
    bilan: BilanQuantitesStudio;
    /** Ajustements manuels (E.3-05), rapportés à part ; le bilan reste celui des valeurs calculées. */
    ajustements: { enVigueur: number; aRevoir: number } | typeof STUDIO_NON_EVALUE;
  };
  fidelite: null | StudioDossierFidelite[];
  /** Sources distinctes des feuilles et du métré. */
  sources: StudioSourceDocumentaire[];
  /** SHA-256 du dossier (JSON canonique de tout ce qui précède). */
  empreinte: string;
}

/** Assemble le dossier : feuilles dans l'ordre, métré, fidélité ; renvoie aussi le rendu de chaque feuille. */
export function assemblerDossierConception(e: StudioDossierEntree): { dossier: StudioDossierConception; rendus: StudioSheet[] } {
  const titre = texte(e?.titre, STUDIO_LIMITES_DOSSIER.titre, "dossier.titre")!;
  texte(e.etude?.id, 200, "dossier.etude.id");
  if (!Array.isArray(e.feuilles) || e.feuilles.length === 0) throw new StudioValidationError("dossier.feuilles", "au moins une feuille attendue");
  if (e.feuilles.length > STUDIO_LIMITES_DOSSIER.feuilles) throw new StudioValidationError("dossier.feuilles", `${STUDIO_LIMITES_DOSSIER.feuilles} feuilles au plus`);
  const vus = new Set<string>();
  for (const f of e.feuilles) { if (vus.has(f.id)) throw new StudioValidationError("dossier.feuilles", `feuille en double : ${f.id}`); vus.add(f.id); }
  const projet = e.projet ?? {};
  const rendus: StudioSheet[] = [];
  const feuilles: StudioDossierConception["feuilles"] = [];
  const fidelite: StudioDossierFidelite[] = [];
  e.feuilles.forEach((f, i) => {
    const { feuille, rendu } = composerFeuilleComposee(f.id, f.definition, f.document, f.source, projet);
    rendus.push(rendu);
    const { schema: _schema, ...reste } = feuille;
    feuilles.push({ ordre: i + 1, ...reste });
    if (e.fidelite) {
      const { document } = studioDonneesVue(f.document, feuille.definition.vueSource);
      fidelite.push({ feuilleId: f.id, numero: feuille.definition.numero, rapport: studioRapportFidelite(document, "svg"), exclus: feuille.vue.exclus });
    }
  });
  let metre: StudioDossierConception["metre"] = null;
  if (e.metre) {
    const source = validerSource(e.metre.source);
    const doc = validateStudioDocument(e.metre.document);
    const aj = e.metre.ajustements;
    metre = { source, bilan: bilanQuantitesStudio(doc), ajustements: aj ? { enVigueur: aj.objets.length + aj.calques.length, aRevoir: aj.aRevoir.length } : STUDIO_NON_EVALUE };
  }
  const cle = (s: StudioSourceDocumentaire) => `${s.variantId}\u0000${s.revisionId}`;
  const sources = new Map<string, StudioSourceDocumentaire>();
  for (const f of feuilles) if (!sources.has(cle(f.vue.source))) sources.set(cle(f.vue.source), f.vue.source);
  if (metre && !sources.has(cle(metre.source))) sources.set(cle(metre.source), metre.source);
  const corps = {
    schema: STUDIO_DOSSIER_CONCEPTION_SCHEMA, titre,
    projet: { code: ou(projet.projectCode), nom: ou(projet.projectName) }, etude: { id: e.etude.id, nom: ou(e.etude.nom) },
    feuilles, metre, fidelite: e.fidelite ? fidelite : null, sources: [...sources.values()],
  };
  return { dossier: { ...corps, empreinte: studioSha256(studioJsonStable(corps)) }, rendus };
}

// ——— PDF du dossier ———

const A4 = { largeur: 210, hauteur: 297 };
const LIGNE_MM = 5.2;
const TEXTE_MM = 2.8;
const fmt = (v: number | null): string => (v === null ? STUDIO_NON_EVALUE : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false }).format(v));
const fmtTotal = (t: TotalBilan): string => `${fmt(t.valeur)}${t.nonEvalues ? ` (partiel : ${t.nonEvalues} non évalué${t.nonEvalues > 1 ? "s" : ""})` : ""}`;

/** Pages de texte A4 : titre, puis lignes à colonnes (positions en mm), paginées. */
function pagesTexte(titre: string, entete: string[], colonnes: number[], lignes: string[][]): { largeurMm: number; hauteurMm: number; primitives: Primitive[] }[] {
  const parPage = Math.floor((A4.hauteur - 60) / LIGNE_MM);
  const pages: { largeurMm: number; hauteurMm: number; primitives: Primitive[] }[] = [];
  const corps = lignes.length ? lignes : [[STUDIO_NON_EVALUE]];
  for (let debut = 0; debut < corps.length; debut += parPage) {
    const p: Primitive[] = [
      { type: "poly", points: [{ x: 0, y: 0 }, { x: A4.largeur, y: 0 }, { x: A4.largeur, y: A4.hauteur }, { x: 0, y: A4.hauteur }], ferme: true, trait: null, remplissage: "blanc", objetId: null },
      { type: "texte", position: { x: 20, y: A4.hauteur - 25 }, texte: titre, hauteurMm: 5, ancre: "debut", angle: 0, trait: "annotation", objetId: "titre" },
    ];
    const ligne = (cells: string[], y: number, trait: "fin" | "annotation") => cells.forEach((c, i) => p.push({ type: "texte", position: { x: colonnes[i] ?? 20, y }, texte: c, hauteurMm: TEXTE_MM, ancre: "debut", angle: 0, trait, objetId: null }));
    let y = A4.hauteur - 38;
    ligne(entete, y, "fin");
    p.push({ type: "ligne", a: { x: 20, y: y - 1.5 }, b: { x: A4.largeur - 10, y: y - 1.5 }, trait: "fin", objetId: null });
    for (const l of corps.slice(debut, debut + parPage)) { y -= LIGNE_MM; ligne(l, y, "annotation"); }
    pages.push({ largeurMm: A4.largeur, hauteurMm: A4.hauteur, primitives: p });
  }
  return pages;
}

const ligneMetre = (l: LigneBilanQuantites): string[] => [
  l.objetId, l.type, fmt(l.brut), l.deductions.length ? `${fmt(l.deduit)} (${l.deductions.map((d) => d.sourceId).join(", ")})` : fmt(l.deduit), fmt(l.net),
];

/** PDF du dossier : sommaire, feuilles dans l'ordre, métré (brut, déductions, net), fidélité. */
export function pdfDossierConception(d: StudioDossierConception, rendus: readonly StudioSheet[]): Uint8Array {
  if (rendus.length !== d.feuilles.length) throw new RangeError("un rendu par feuille attendu");
  const sommaire = pagesTexte(`${d.titre} — sommaire`, ["N°", "Feuille", "Variante · révision", "Empreinte des données"], [20, 40, 110, 160], [
    ...d.feuilles.map((f) => [f.definition.numero, f.definition.titre, `${ou(f.vue.source.variantName)} · ${f.vue.source.revisionId.slice(-8)}`, f.vue.empreinteDonnees.slice(0, 16)]),
    [],
    ["", `Projet : ${d.projet.code} — ${d.projet.nom}`],
    ["", `Étude : ${d.etude.nom}`],
    ["", `Métré : ${d.metre ? "joint" : "non joint"} · fidélité : ${d.fidelite ? "jointe" : "non jointe"}`],
    ["", `Empreinte du dossier : ${d.empreinte}`],
  ]);
  const feuilles = rendus.map((r) => ({ largeurMm: r.width, hauteurMm: r.height, primitives: studioSheetPrimitives(r) }));
  const pages = [...sommaire, ...feuilles];
  if (d.metre) {
    const b = d.metre.bilan;
    pages.push(...pagesTexte(`Métré — volumes (m³), révision ${d.metre.source.revisionId.slice(-8)}`, ["Objet", "Type", "Brut", "Déductions (sources)", "Net"], [20, 60, 95, 120, 175], [
      ...b.lignes.map(ligneMetre),
      [],
      ["Total brut", "", fmtTotal(b.totaux.brut)],
      ["Total des déductions", "", fmtTotal(b.totaux.deduit)],
      ["Total net", "", fmtTotal(b.totaux.net)],
      ["Contrôle net = brut − déductions", "", b.controle.coherent ? "cohérent" : "INCOHÉRENT"],
      ["Ajustements manuels", "", typeof d.metre.ajustements === "string" ? d.metre.ajustements : `${d.metre.ajustements.enVigueur} en vigueur, ${d.metre.ajustements.aRevoir} à revoir (hors bilan)`],
    ]));
  }
  if (d.fidelite) {
    pages.push(...pagesTexte("Rapport de fidélité des feuilles", ["Feuille", "Catégorie · type", "Statut", "Raison", "Nombre"], [20, 45, 105, 130, 185], d.fidelite.flatMap((f) => [
      ...f.rapport.lignes.map((l) => [f.numero, `${l.categorie} · ${l.type}`, l.statut, l.raison, String(l.nombre)]),
      [f.numero, "hors calques retenus", "exclu", "vue-source", String(f.exclus.horsCalques)],
      [f.numero, "solides, propriétés, scènes", "exclu", "hors-plan-2d", String(f.exclus.solides + f.exclus.proprietes + f.exclus.scenes)],
    ])));
  }
  return pdfPages(pages, d.titre);
}
