import { controlerLiens, studioDimensionValue, validerCote, type StudioDimension } from "../objets/cote.js";
import { studioResolveurCotes } from "../commandes/cotes-murs.js";
import { validerForme } from "../objets/index.js";
import { validerSolide, type StudioSolid } from "../objets-3d/solides.js";
import { studioIdsOperandes, validerSolideExact, type StudioSolideExact } from "../objets-3d/exacts.js";
import { controlerCoteFace, validerCotesFaces, type StudioCoteFace } from "../objets-3d/cotes-faces.js";
import { controlerLiensAnnotation, validerAnnotation } from "../objets/annotation.js";
import { studioAngularValue } from "../objets/cote-angulaire.js";
import { etatCalque, validerCalque, type StudioLayerState } from "../noyau/calques.js";
import type { StudioArchitectureItem } from "../architecture/types.js";
import { controlerArchitecture, validerElementArchitectural } from "../architecture/validation.js";
import { validerProprietes, type StudioPropriete } from "../exigences/proprietes.js";
import { STUDIO_LIMITS } from "../noyau/limites.js";
import { controlerVisualisation, validerElementVisualisation, type StudioElementVisualisation } from "../scenes/scenes.js";
import type { StudioLayer } from "../noyau/types.js";
import { array, fail, identifier, record } from "../noyau/validation.js";
import type { StudioAnnotation, StudioShape } from "../objets/formes.js";
import { validerNonNatif, type StudioNonNatif } from "../non-natifs/non-natifs.js";
import { validerGraphisme, STUDIO_LIMITES_GRAPHISMES, type StudioGraphisme } from "../graphismes/graphismes.js";
import { validerSystemeProjet, type StudioSystemeProjet } from "../reperes.js";
import { validerSources, type StudioSourceExterne } from "../sources/sources.js";
import { controlerBlocs, validerDefinitionBloc, validerInsertionBloc, type StudioDefinitionBloc, type StudioInsertionBloc } from "../blocs/blocs.js";
import { STUDIO_LIMITES_CONTRAINTES, studioRefusContrainte, validerContrainte, type StudioContrainte } from "../contraintes/contraintes.js";
import type { StudioDocument } from "./types.js";
import { validerNiveaux, type StudioNiveau } from "../batiment/niveaux.js";
import { validerComposants, validerOccurrence, type StudioComposant, type StudioOccurrence } from "../batiment/composants.js";

/** Document Studio : forme canonique, validation complète, création, lectures (sélection, mesure d'une cote). */

/** Forme canonique : `layers`, `dimensions`, `solides` et `annotations` vides sont omis. */
export function sortie(id: string, objects: StudioShape[], layers: StudioLayer[], dimensions: StudioDimension[], solides: StudioSolid[] = [], annotations: StudioAnnotation[] = [], architecture: StudioArchitectureItem[] = [], proprietes: StudioPropriete[] = [], scenes: StudioElementVisualisation[] = [], nonNatifs: StudioNonNatif[] = [], exacts: StudioSolideExact[] = [], graphismes: StudioGraphisme[] = [], systemeProjet?: StudioSystemeProjet, sources: StudioSourceExterne[] = [], cotesFaces: StudioCoteFace[] = [], blocs: StudioDefinitionBloc[] = [], insertions: StudioInsertionBloc[] = [], contraintes: StudioContrainte[] = [], batiment: Batiment = {}): StudioDocument {
  const { niveaux = [], composants = [], occurrences = [] } = batiment;
  return {
    id, schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects,
    ...(layers.length ? { layers } : {}),
    ...(dimensions.length ? { dimensions } : {}),
    ...(solides.length ? { solides } : {}),
    ...(exacts.length ? { exacts } : {}),
    ...(cotesFaces.length ? { cotesFaces } : {}),
    ...(annotations.length ? { annotations } : {}),
    ...(architecture.length ? { architecture } : {}),
    ...(proprietes.length ? { proprietes } : {}),
    ...(scenes.length ? { scenes } : {}),
    ...(nonNatifs.length ? { nonNatifs } : {}),
    ...(graphismes.length ? { graphismes } : {}),
    ...(systemeProjet ? { systemeProjet } : {}),
    ...(sources.length ? { sources } : {}),
    ...(niveaux.length ? { niveaux } : {}),
    ...(composants.length ? { composants } : {}),
    ...(occurrences.length ? { occurrences } : {}),
    ...(blocs.length ? { blocs } : {}),
    ...(insertions.length ? { insertions } : {}),
    ...(contraintes.length ? { contraintes } : {}),
  };
}

/** Extensions du bâtiment (lot W3-B) : niveaux, définitions de composants et occurrences. */
export interface Batiment { niveaux?: StudioNiveau[]; composants?: StudioComposant[]; occurrences?: StudioOccurrence[] }

/** Returns a private, canonical copy (empty `layers` / `dimensions` / `annotations` omitted) or throws `StudioValidationError`. */
export function validateStudioDocument(value: unknown): StudioDocument {
  const d = record(value, ["id", "schemaVersion", "units", "frame", "objects"], "document", ["layers", "dimensions", "solides", "annotations", "architecture", "proprietes", "scenes", "nonNatifs", "exacts", "graphismes", "systemeProjet", "sources", "cotesFaces", "blocs", "insertions", "contraintes", "niveaux", "composants", "occurrences"]);
  if (d.schemaVersion !== "studio-document/1") fail("studioDocument.schemaVersion", "version non prise en charge");
  if (d.units !== "m") fail("studioDocument.units", "unité m attendue");
  if (d.frame !== "local-2d") fail("studioDocument.frame", "repère local-2d attendu");
  const rawObjects = array(d.objects, "studioDocument.objects");
  const rawLayers = Object.hasOwn(d, "layers") ? array(d.layers, "studioDocument.layers") : [];
  const rawDimensions = Object.hasOwn(d, "dimensions") ? array(d.dimensions, "studioDocument.dimensions") : [];
  const rawSolides = Object.hasOwn(d, "solides") ? array(d.solides, "studioDocument.solides") : [];
  if (rawLayers.length > STUDIO_LIMITS.layers) fail("studioDocument.layers", `${STUDIO_LIMITS.layers} calques au plus`);
  const rawAnnotations = Object.hasOwn(d, "annotations") ? array(d.annotations, "studioDocument.annotations") : [];
  if (rawObjects.length + rawDimensions.length + rawAnnotations.length > STUDIO_LIMITS.objects) fail("studioDocument.objects", `${STUDIO_LIMITS.objects} objets au plus`);
  if (rawObjects.length + rawDimensions.length + rawAnnotations.length + rawSolides.length > STUDIO_LIMITS.objects) fail("studioDocument.solides", `${STUDIO_LIMITS.objects} objets au plus, solides compris`);
  const layers = rawLayers.map((l, i) => validerCalque(l, `studioDocument.layers[${i}]`));
  const objects = rawObjects.map((o, i) => validerForme(o, `studioDocument.objects[${i}]`));
  const dimensions = rawDimensions.map((o, i) => validerCote(o, `studioDocument.dimensions[${i}]`));
  const solides = rawSolides.map((o, i) => validerSolide(o, `studioDocument.solides[${i}]`));
  const layerIds = new Set<string>();
  for (const l of layers) {
    if (layerIds.has(l.id)) fail("studioDocument.layers", "identifiant de calque dupliqué");
    layerIds.add(l.id);
  }
  const shapes = new Map<string, StudioShape>();
  for (const o of objects) {
    if (shapes.has(o.id)) fail("studioDocument.objects", "identifiant dupliqué");
    shapes.set(o.id, o);
  }
  const dimensionIds = new Set<string>();
  for (const o of dimensions) {
    if (shapes.has(o.id) || dimensionIds.has(o.id)) fail("studioDocument.dimensions", "identifiant dupliqué");
    dimensionIds.add(o.id);
  }
  for (const o of [...objects, ...dimensions]) {
    if (o.layerId !== undefined && !layerIds.has(o.layerId)) fail(`studioDocument.${o.type === "dimension" ? "dimensions" : "objects"}`, "calque inconnu");
  }
  for (const s of solides) {
    if (shapes.has(s.id) || dimensionIds.has(s.id)) fail("studioDocument.solides", "identifiant dupliqué");
    dimensionIds.add(s.id);
    if (s.layerId !== undefined && !layerIds.has(s.layerId)) fail("studioDocument.solides", "calque inconnu");
  }
  // Solides exacts (lot F2) : identifiants uniques dans tout le document, opérandes conservés compris ; calque connu.
  const rawExacts = Object.hasOwn(d, "exacts") ? array(d.exacts, "studioDocument.exacts") : [];
  if (rawObjects.length + rawDimensions.length + rawAnnotations.length + rawSolides.length + rawExacts.length > STUDIO_LIMITS.objects) fail("studioDocument.exacts", `${STUDIO_LIMITS.objects} objets au plus, solides exacts compris`);
  const exacts = rawExacts.map((o, i) => validerSolideExact(o, `studioDocument.exacts[${i}]`));
  for (const s of exacts) {
    for (const id of [s.id, ...studioIdsOperandes(s)]) {
      if (shapes.has(id) || dimensionIds.has(id)) fail("studioDocument.exacts", "identifiant dupliqué");
      dimensionIds.add(id);
    }
    if (s.layerId !== undefined && !layerIds.has(s.layerId)) fail("studioDocument.exacts", "calque inconnu");
  }
  const annotations = rawAnnotations.map((o, i) => validerAnnotation(o, `studioDocument.annotations[${i}]`));
  const annotationIds = new Set<string>();
  annotations.forEach((o, i) => {
    if (shapes.has(o.id) || dimensionIds.has(o.id) || annotationIds.has(o.id)) fail("studioDocument.annotations", "identifiant dupliqué");
    annotationIds.add(o.id);
    controlerLiensAnnotation(o, shapes, `studioDocument.annotations[${i}]`);
    if (o.layerId !== undefined && !layerIds.has(o.layerId)) fail("studioDocument.annotations", "calque inconnu");
  });
  // Objets architecturaux (A.4) : identifiants uniques dans tout le document, calque connu, compatibilité ouverture / mur.
  const rawArchitecture = Object.hasOwn(d, "architecture") ? array(d.architecture, "studioDocument.architecture") : [];
  if (rawObjects.length + rawDimensions.length + rawAnnotations.length + rawSolides.length + rawArchitecture.length > STUDIO_LIMITS.objects) fail("studioDocument.architecture", `${STUDIO_LIMITS.objects} objets au plus, objets architecturaux compris`);
  const architecture = rawArchitecture.map((o, i) => validerElementArchitectural(o, `studioDocument.architecture[${i}]`));
  for (const o of architecture) {
    if (shapes.has(o.id) || dimensionIds.has(o.id) || annotationIds.has(o.id)) fail("studioDocument.architecture", "identifiant dupliqué");
    annotationIds.add(o.id);
    if (o.type !== "opening" && o.layerId !== undefined && !layerIds.has(o.layerId)) fail("studioDocument.architecture", "calque inconnu");
  }
  controlerArchitecture(architecture, "studioDocument.architecture");
  // Bâtiment (lot W3-B) : niveaux, définitions de composants et occurrences, identifiants uniques dans tout le document ;
  // chaque niveau désigné existe, chaque occurrence désigne une définition existante, sur un calque connu.
  const unique = (id: string, champ: string) => {
    if (shapes.has(id) || dimensionIds.has(id) || annotationIds.has(id)) fail(`studioDocument.${champ}`, "identifiant dupliqué");
    annotationIds.add(id);
  };
  const niveaux = Object.hasOwn(d, "niveaux") ? validerNiveaux(array(d.niveaux, "studioDocument.niveaux"), "studioDocument.niveaux") : [];
  for (const n of niveaux) unique(n.id, "niveaux");
  const niveauIds = new Set(niveaux.map((n) => n.id));
  architecture.forEach((o, i) => {
    if (o.type !== "opening" && o.niveauId !== undefined && !niveauIds.has(o.niveauId)) fail(`studioDocument.architecture[${i}].niveauId`, `niveau introuvable : ${o.niveauId}`);
  });
  const composants = Object.hasOwn(d, "composants") ? validerComposants(array(d.composants, "studioDocument.composants"), "studioDocument.composants") : [];
  for (const c of composants) unique(c.id, "composants");
  const composantIds = new Set(composants.map((c) => c.id));
  const rawOccurrences = Object.hasOwn(d, "occurrences") ? array(d.occurrences, "studioDocument.occurrences") : [];
  if (rawOccurrences.length > STUDIO_LIMITS.objects) fail("studioDocument.occurrences", `${STUDIO_LIMITS.objects} occurrences au plus`);
  const occurrences = rawOccurrences.map((o, i) => validerOccurrence(o, `studioDocument.occurrences[${i}]`));
  occurrences.forEach((o, i) => {
    unique(o.id, "occurrences");
    if (!composantIds.has(o.composantId)) fail(`studioDocument.occurrences[${i}].composantId`, `définition de composant introuvable : ${o.composantId}`);
    if (o.niveauId !== undefined && !niveauIds.has(o.niveauId)) fail(`studioDocument.occurrences[${i}].niveauId`, `niveau introuvable : ${o.niveauId}`);
    if (o.layerId !== undefined && !layerIds.has(o.layerId)) fail("studioDocument.occurrences", "calque inconnu");
  });
  // Liens des cotes : vers une forme, ou vers un mur (cote associative sur objet architectural, AC-001).
  const ciblesCotes = studioResolveurCotes(shapes.values(), architecture);
  dimensions.forEach((o, i) => controlerLiens(o, ciblesCotes, `studioDocument.dimensions[${i}]`));
  // Propriétés déclarées (E.1-01) : cible présente et dans le périmètre pilote, clé (cible, nom) unique.
  const proprietes = Object.hasOwn(d, "proprietes") ? validerProprietes(d.proprietes, objects, architecture, "studioDocument.proprietes") : [];
  // Visualisation (lot E.5) : scènes et apparences, identifiants propres à la liste, calques et objets 3D connus.
  const rawScenes = Object.hasOwn(d, "scenes") ? array(d.scenes, "studioDocument.scenes") : [];
  const scenes = rawScenes.map((o, i) => validerElementVisualisation(o, `studioDocument.scenes[${i}]`));
  if (scenes.length) controlerVisualisation(scenes, { calques: layerIds, objets: new Set([...shapes.keys(), ...solides.map((s) => s.id), ...exacts.map((s) => s.id), ...architecture.map((a) => a.id), ...occurrences.map((o) => o.id)]) }, "studioDocument.scenes");
  // Éléments non natifs (lot F3) : identifiants uniques dans tout le document, calque connu ; jamais métrés ni exportés.
  const rawNonNatifs = Object.hasOwn(d, "nonNatifs") ? array(d.nonNatifs, "studioDocument.nonNatifs") : [];
  if (rawNonNatifs.length > STUDIO_LIMITS.objects) fail("studioDocument.nonNatifs", `${STUDIO_LIMITS.objects} éléments non natifs au plus`);
  const nonNatifs = rawNonNatifs.map((o, i) => validerNonNatif(o, `studioDocument.nonNatifs[${i}]`));
  for (const n of nonNatifs) {
    if (shapes.has(n.id) || dimensionIds.has(n.id) || annotationIds.has(n.id)) fail("studioDocument.nonNatifs", "identifiant dupliqué");
    annotationIds.add(n.id);
    if (n.layerId !== undefined && !layerIds.has(n.layerId)) fail("studioDocument.nonNatifs", "calque inconnu");
  }
  // Graphismes (EX-055) : identifiants uniques dans tout le document, calque connu ; dessin 2D seulement.
  const rawGraphismes = Object.hasOwn(d, "graphismes") ? array(d.graphismes, "studioDocument.graphismes") : [];
  if (rawGraphismes.length > STUDIO_LIMITES_GRAPHISMES.graphismes) fail("studioDocument.graphismes", `${STUDIO_LIMITES_GRAPHISMES.graphismes} graphismes au plus`);
  const graphismes = rawGraphismes.map((o, i) => validerGraphisme(o, `studioDocument.graphismes[${i}]`));
  for (const g of graphismes) {
    if (shapes.has(g.id) || dimensionIds.has(g.id) || annotationIds.has(g.id)) fail("studioDocument.graphismes", "identifiant dupliqué");
    annotationIds.add(g.id);
    if (g.layerId !== undefined && !layerIds.has(g.layerId)) fail("studioDocument.graphismes", "calque inconnu");
  }
  // Système de projet (EX-023) : versions 1, 2, 3… sans trou, la dernière en vigueur.
  const systemeProjet = Object.hasOwn(d, "systemeProjet") ? validerSystemeProjet(d.systemeProjet, "studioDocument.systemeProjet") : undefined;
  // Sources externes (EX-014) : identifiants propres à la liste, provenance validée.
  const sources = Object.hasOwn(d, "sources") ? validerSources(d.sources, "studioDocument.sources") : [];
  // Cotes de faces 3D (lot G2, INV-013) : identifiants uniques dans tout le document, calque connu ; une cote rattachée
  // porte sur deux faces parallèles existantes d'un solide libre ; une cote « à résoudre » est conservée telle quelle.
  const cotesFaces = Object.hasOwn(d, "cotesFaces") ? validerCotesFaces(d.cotesFaces, "studioDocument.cotesFaces") : [];
  for (const [i, c] of cotesFaces.entries()) {
    if (shapes.has(c.id) || dimensionIds.has(c.id) || annotationIds.has(c.id)) fail("studioDocument.cotesFaces", "identifiant dupliqué");
    dimensionIds.add(c.id);
    if (c.layerId !== undefined && !layerIds.has(c.layerId)) fail("studioDocument.cotesFaces", "calque inconnu");
    controlerCoteFace(c, solides, `studioDocument.cotesFaces[${i}]`);
  }
  // Blocs (X.1-01) : définitions et insertions, identifiants uniques dans tout le document, noms uniques, calque connu.
  const blocs = (Object.hasOwn(d, "blocs") ? array(d.blocs, "studioDocument.blocs") : []).map((o, i) => validerDefinitionBloc(o, `studioDocument.blocs[${i}]`));
  const insertions = (Object.hasOwn(d, "insertions") ? array(d.insertions, "studioDocument.insertions") : []).map((o, i) => validerInsertionBloc(o, `studioDocument.insertions[${i}]`));
  controlerBlocs(blocs, insertions, "studioDocument");
  for (const x of [...blocs, ...insertions]) {
    if (shapes.has(x.id) || dimensionIds.has(x.id) || annotationIds.has(x.id)) fail(`studioDocument.${x.type === "bloc" ? "blocs" : "insertions"}`, "identifiant dupliqué");
    annotationIds.add(x.id);
    if (x.type === "insertion" && x.layerId !== undefined && !layerIds.has(x.layerId)) fail("studioDocument.insertions", "calque inconnu");
  }
  // Contraintes (X.1-01) : identifiants uniques ; une contrainte qui n'est pas « à résoudre » vise des cibles présentes
  // et compatibles (une contrainte rompue garde sa cible même disparue, jusqu'à sa résolution ou son retrait).
  const rawContraintes = Object.hasOwn(d, "contraintes") ? array(d.contraintes, "studioDocument.contraintes") : [];
  if (rawContraintes.length > STUDIO_LIMITES_CONTRAINTES.contraintes) fail("studioDocument.contraintes", `${STUDIO_LIMITES_CONTRAINTES.contraintes} contraintes au plus`);
  const contraintes = rawContraintes.map((o, i) => validerContrainte(o, `studioDocument.contraintes[${i}]`));
  contraintes.forEach((c, i) => {
    if (shapes.has(c.id) || dimensionIds.has(c.id) || annotationIds.has(c.id)) fail("studioDocument.contraintes", "identifiant dupliqué");
    annotationIds.add(c.id);
    const refus = c.aResoudre ? null : studioRefusContrainte(c, shapes);
    if (refus) fail(`studioDocument.contraintes[${i}]`, `contrainte ${c.id} : ${refus}`);
  });
  return sortie(identifier(d.id, "studioDocument.id"), objects, layers, dimensions, solides, annotations, architecture, proprietes, scenes, nonNatifs, exacts, graphismes, systemeProjet, sources, cotesFaces, blocs, insertions, contraintes, { niveaux, composants, occurrences });
}

/** Valeur mesurée d'une cote angulaire (degrés), dérivée ; « non évaluée » (null) tant qu'elle est à résoudre. */
export interface StudioAngularMeasure {
  id: string;
  status: "resolved" | "to-resolve";
  value: number | null;
  unit: "deg";
  frame: "local-2d";
}
export function measureStudioAngularDimension(document: StudioDocument, id: string): StudioAngularMeasure | null {
  const d = validateStudioDocument(document);
  identifier(id, "measure.id");
  const found = d.annotations?.find((o) => o.id === id);
  if (!found || found.type !== "angular-dimension") return null;
  const value = studioAngularValue(found);
  return { id, status: value === null ? "to-resolve" : "resolved", value, unit: "deg", frame: "local-2d" };
}

/** État d'affichage et d'édition d'un calque du document ; le calque implicite non matérialisé est visible et déverrouillé. */
export function studioLayerState(doc: StudioDocument, layerId: string | undefined): StudioLayerState | null {
  return etatCalque(doc.layers, layerId);
}

export function newStudioDocument(id: string): StudioDocument {
  return { id: identifier(id, "studioDocument.id"), schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] };
}

/** Selection is a read, never a persisted command or revision. */
export function selectStudioShape(document: StudioDocument, id: string): StudioShape | null {
  const d = validateStudioDocument(document);
  identifier(id, "selection.id");
  return d.objects.find((o) => o.id === id) ?? null;
}

/** Valeur mesurée d'une cote, dérivée de ses extrémités ; « non évaluée » (null) tant qu'elle est à résoudre. */
export interface StudioDimensionMeasure {
  id: string;
  status: "resolved" | "to-resolve";
  value: number | null;
  unit: "m";
  frame: "local-2d";
}
export function measureStudioDimension(document: StudioDocument, id: string): StudioDimensionMeasure | null {
  const d = validateStudioDocument(document);
  identifier(id, "measure.id");
  const found = d.dimensions?.find((o) => o.id === id);
  if (!found) return null;
  const value = studioDimensionValue(found);
  return { id, status: value === null ? "to-resolve" : "resolved", value, unit: "m", frame: "local-2d" };
}
