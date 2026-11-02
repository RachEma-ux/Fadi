/**
 * Saisie des blocs définis par l'utilisateur et des contraintes géométriques (X.1-01) : lecture des champs des boîtes
 * « Blocs » et « Contraintes », commandes produites, état affiché. Pur : ni React ni DOM. Rien n'est supposé : un champ
 * vide ou illisible est une erreur dite, jamais une valeur par défaut ; le modèle (`applyStudioCommands`) reste seul
 * juge — chaque commande est essayée sur le document avant d'être proposée au brouillon, et son refus est dit.
 */
import {
  STUDIO_DEFAULT_LAYER_ID, studioEvaluerContrainte, studioInsertionsParBloc, studioModeTangence, studioPointContrainte,
  type StudioCibleContrainte, type StudioCommand, type StudioContrainte, type StudioDocument, type StudioModeTangence, type StudioPoint, type StudioShape,
  type StudioStatutContrainte, type StudioTypeContrainte,
} from "@parcours/atelier-model";
import { lireNombre } from "../graphismes/graphismes-ui";
import { refusBrouillon } from "../planche2d/brouillon";

export type ResultatSaisie = { commandes: StudioCommand[] } | { erreur: string };

const deg = (d: number) => (d * Math.PI) / 180;
const normal = (a: number) => { const r = a % (2 * Math.PI); const n = r < 0 ? r + 2 * Math.PI : r; return n >= 2 * Math.PI ? 0 : n; };

/** Essaie les commandes sur le document (prévisualisation du brouillon) : refus du modèle dit, jamais deviné. */
function essayer(doc: StudioDocument, commandes: StudioCommand[], quoi: string): ResultatSaisie {
  const refus = refusBrouillon(doc, commandes);
  return refus === null ? { commandes } : { erreur: `${quoi} : ${refus}` };
}

// ——— Blocs ———

export interface SaisieDefinition { nom: string; x: string; y: string; remplacer: boolean }
export const SAISIE_DEFINITION_INITIALE: SaisieDefinition = { nom: "", x: "", y: "", remplacer: false };

/** Formes (ligne, rectangle, cercle, arc, polyligne) de la sélection, dans l'ordre du document. */
export function formesSelectionnees(doc: StudioDocument, selection: readonly string[]): StudioShape[] {
  const choisis = new Set(selection);
  return doc.objects.filter((o) => choisis.has(o.id));
}

/**
 * Définir un bloc depuis les formes sélectionnées (point de base saisi) ; `remplacer` : les formes deviennent une
 * insertion du bloc à son point de base (même dessin). `redefinir` : la définition `ids.bloc` existante est remplacée,
 * toutes ses insertions suivent.
 */
export function commandeDefinirBloc(doc: StudioDocument, selection: readonly string[], s: SaisieDefinition, ids: { bloc: string; insertion: string }, redefinir = false): ResultatSaisie {
  const formes = formesSelectionnees(doc, selection);
  if (!formes.length) return { erreur: "Sélectionnez d’abord, sur la planche, les formes qui composent le bloc (lignes, rectangles, cercles, arcs, polylignes)." };
  if (!s.nom.trim()) return { erreur: "Nom du bloc à saisir." };
  const x = lireNombre(s.x), y = lireNombre(s.y);
  if (x === null || y === null) return { erreur: "Point de base (X, Y) à saisir, en mètres." };
  const params = { id: ids.bloc, nom: s.nom.trim(), base: { x, y }, objets: formes.map((o) => o.id), ...(s.remplacer && !redefinir ? { insertion: ids.insertion } : {}), ...(redefinir ? { redefinir: true } : {}) };
  return essayer(doc, [{ toolId: "studio.bloc.definir", params }], "Bloc");
}

export interface SaisieInsertion { bloc: string; x: string; y: string; rotation: string; echelle: string; symetrie: boolean }
export const SAISIE_INSERTION_INITIALE: SaisieInsertion = { bloc: "", x: "", y: "", rotation: "", echelle: "", symetrie: false };

/** Insérer un bloc (calque actif) ; avec `modifier`, nouvelle pose de l'insertion `id` existante (même calque). */
export function commandeInsererBloc(doc: StudioDocument, s: SaisieInsertion, id: string, layerId: string | undefined, modifier = false): ResultatSaisie {
  if (!s.bloc) return { erreur: "Choisissez le bloc à insérer." };
  const x = lireNombre(s.x), y = lireNombre(s.y), r = lireNombre(s.rotation), k = lireNombre(s.echelle);
  if (x === null || y === null || r === null || k === null) return { erreur: "Position (X, Y), rotation et échelle de l’insertion sont à saisir." };
  const existante = modifier ? doc.insertions?.find((i) => i.id === id) : undefined;
  if (modifier && !existante) return { erreur: "Sélectionnez d’abord, sur la planche, l’insertion à modifier." };
  const calque = modifier ? existante!.layerId : layerId && layerId !== STUDIO_DEFAULT_LAYER_ID ? layerId : undefined;
  const params = { id, type: "insertion" as const, bloc: s.bloc, ...(calque ? { layerId: calque } : {}), position: { x, y }, rotation: normal(deg(r)), echelle: k, ...(s.symetrie ? { symetrie: true as const } : {}), ...(modifier ? { modifier: true } : {}) };
  return essayer(doc, [{ toolId: "studio.bloc.inserer", params }], "Insertion");
}

/** Saisie pré-remplie depuis une insertion existante (pose affichée, à modifier). */
export function saisieDepuisInsertion(doc: StudioDocument, id: string): SaisieInsertion | null {
  const i = doc.insertions?.find((x) => x.id === id);
  if (!i) return null;
  const r = (v: number) => String(Math.round(v * 1e6) / 1e6);
  return { bloc: i.bloc, x: r(i.position.x), y: r(i.position.y), rotation: r((i.rotation * 180) / Math.PI), echelle: r(i.echelle), symetrie: !!i.symetrie };
}

/** Insertions de la sélection, dans l'ordre du document. */
export const insertionsSelectionnees = (doc: StudioDocument, selection: readonly string[]): string[] => {
  const choisis = new Set(selection);
  return (doc.insertions ?? []).filter((i) => choisis.has(i.id)).map((i) => i.id);
};

/** Éclater les insertions sélectionnées ; erreur dite si la sélection n'en contient aucune. */
export function commandeEclater(doc: StudioDocument, selection: readonly string[]): ResultatSaisie {
  const ids = insertionsSelectionnees(doc, selection);
  if (!ids.length) return { erreur: "Sélectionnez d’abord, sur la planche, l’insertion de bloc à éclater." };
  return essayer(doc, [{ toolId: "studio.bloc.eclater", params: { ids } }], "Éclatement");
}

/** Retirer une définition qui n'est plus insérée (Supprimer) ; le modèle refuse une définition encore insérée. */
export function commandeRetirerBloc(doc: StudioDocument, bloc: string): ResultatSaisie {
  return essayer(doc, [{ toolId: "studio.dessin.supprimer", params: { ids: [bloc] } }], "Retrait du bloc");
}

/** Définitions du dessin et nombre de leurs insertions (liste de la boîte). */
export function listeBlocs(doc: StudioDocument): { id: string; nom: string; elements: number; insertions: number }[] {
  const n = studioInsertionsParBloc(doc.insertions ?? []);
  return (doc.blocs ?? []).map((b) => ({ id: b.id, nom: b.nom, elements: b.elements.length, insertions: n.get(b.id) ?? 0 }));
}

// ——— Contraintes ———

export const NOMS_CONTRAINTES: Readonly<Record<StudioTypeContrainte, string>> = Object.freeze({
  horizontal: "Horizontale", vertical: "Verticale", parallele: "Parallélisme", perpendiculaire: "Perpendicularité",
  tangence: "Tangence", coincidence: "Coïncidence", egalite: "Égalité de longueur (ou de rayon)", distance: "Distance fixée",
});
/** Symbole affiché sur la planche près de la première cible. */
export const SYMBOLES_CONTRAINTES: Readonly<Record<StudioTypeContrainte, string>> = Object.freeze({
  horizontal: "H", vertical: "V", parallele: "∥", perpendiculaire: "⊥", tangence: "T", coincidence: "◎", egalite: "=", distance: "↔",
});
export const NOMS_STATUTS_CONTRAINTE: Readonly<Record<StudioStatutContrainte, string>> = Object.freeze({
  satisfaite: "Satisfaite", "a-resoudre": "À résoudre", "non-satisfaite": "Non satisfaite", "cible-incompatible": "Cible incompatible",
});

/** Cible lue : objet, et selon le cas segment, point nommé ou sommet. */
export interface SaisieCible { objet: string; precision: string }
export interface SaisieContrainte { type: StudioTypeContrainte; cibles: [SaisieCible, SaisieCible]; valeur: string; tangence: "" | StudioModeTangence }
export const SAISIE_CONTRAINTE_INITIALE: SaisieContrainte = { type: "parallele", cibles: [{ objet: "", precision: "" }, { objet: "", precision: "" }], valeur: "", tangence: "" };

/** Nombre de cibles du type (la distance : deux points, ou un segment si la seconde cible est vide). */
export const ciblesDuType = (t: StudioTypeContrainte): 1 | 2 => (t === "horizontal" || t === "vertical" ? 1 : 2);
/** Le type porte-t-il sur des points (coïncidence, distance entre points) ? */
export const surDesPoints = (t: StudioTypeContrainte): boolean => t === "coincidence" || t === "distance";

/** Objets contraignables : lignes, polylignes, cercles, arcs (un rectangle ne l'est pas). */
export function objetsContraignables(doc: StudioDocument): { id: string; type: StudioShape["type"] }[] {
  return doc.objects.filter((o) => o.type !== "rectangle").map((o) => ({ id: o.id, type: o.type }));
}

/**
 * Précisions possibles d'une cible : segment `segment-k` (polyligne), point `debut` / `fin` / `centre`, sommet
 * `sommet-k` (polyligne) ; « » : l'objet entier (ligne, cercle, arc).
 */
export function precisionsPossibles(doc: StudioDocument, objet: string, points: boolean): { valeur: string; libelle: string }[] {
  const o = doc.objects.find((x) => x.id === objet);
  if (!o) return [];
  if (o.type === "polyline") {
    if (points) return o.points.map((_, k) => ({ valeur: `sommet-${k}`, libelle: `Sommet ${k + 1}` }));
    const n = o.closed ? o.points.length : o.points.length - 1;
    return Array.from({ length: n }, (_, k) => ({ valeur: `segment-${k}`, libelle: `Segment ${k + 1}` })).filter((_, k) => (o.bulges?.[k] ?? 0) === 0);
  }
  if (!points) return [{ valeur: "", libelle: o.type === "line" ? "Ligne entière" : "Courbe entière" }];
  if (o.type === "line") return [{ valeur: "debut", libelle: "Début" }, { valeur: "fin", libelle: "Fin" }];
  if (o.type === "circle") return [{ valeur: "centre", libelle: "Centre" }];
  return [{ valeur: "centre", libelle: "Centre" }, { valeur: "debut", libelle: "Début" }, { valeur: "fin", libelle: "Fin" }];
}

function cibleLue(c: SaisieCible): StudioCibleContrainte | null {
  if (!c.objet) return null;
  const m = /^(segment|sommet)-(\d+)$/.exec(c.precision);
  if (m) return m[1] === "segment" ? { objet: c.objet, segment: Number(m[2]) } : { objet: c.objet, sommet: Number(m[2]) };
  if (c.precision === "debut" || c.precision === "fin" || c.precision === "centre") return { objet: c.objet, point: c.precision };
  return { objet: c.objet };
}

/** Saisie pré-remplie depuis la sélection de la planche (les deux premières formes contraignables). */
export function saisieDepuisSelection(doc: StudioDocument, selection: readonly string[], type: StudioTypeContrainte): SaisieContrainte {
  const ok = new Set(objetsContraignables(doc).map((o) => o.id));
  const [a = "", b = ""] = selection.filter((id) => ok.has(id));
  const premiere = (objet: string) => (objet ? precisionsPossibles(doc, objet, surDesPoints(type))[0]?.valeur ?? "" : "");
  return { type, cibles: [{ objet: a, precision: premiere(a) }, { objet: b, precision: premiere(b) }], valeur: "", tangence: "" };
}

/** Poser une contrainte et résoudre son système ; l'insatisfaisable ou la sur-contrainte est dite, jamais résolue en silence. */
export function commandePoserContrainte(doc: StudioDocument, s: SaisieContrainte, id: string): ResultatSaisie {
  const n = s.type === "distance" && !s.cibles[1].objet ? 1 : ciblesDuType(s.type);
  const cibles = s.cibles.slice(0, n).map(cibleLue);
  if (cibles.some((c) => c === null)) return { erreur: n === 1 ? "Choisissez l’objet à contraindre." : "Choisissez les deux objets à contraindre." };
  let liste = cibles as StudioCibleContrainte[];
  // Distance fixée d'un segment : une seule cible (la seconde laissée vide).
  if (s.type === "distance" && !s.cibles[1].objet) liste = [{ objet: s.cibles[0].objet, ...(/^segment-(\d+)$/.test(s.cibles[0].precision) ? { segment: Number(s.cibles[0].precision.slice(8)) } : {}) }];
  const c: StudioContrainte = { id, type: s.type, cibles: liste };
  if (s.type === "distance") {
    const v = lireNombre(s.valeur);
    if (v === null) return { erreur: "Distance à saisir, en mètres : aucune valeur n’est supposée." };
    c.valeur = v;
  }
  if (s.type === "tangence" && s.tangence) c.tangence = s.tangence;
  return essayer(doc, [{ toolId: "studio.contrainte.poser", params: { contraintes: [c] } }], "Contrainte");
}

/** Résoudre des contraintes « à résoudre » (et le système qu'elles forment). */
export function commandeResoudre(doc: StudioDocument, ids: readonly string[]): ResultatSaisie {
  if (!ids.length) return { erreur: "Cochez d’abord les contraintes à résoudre." };
  return essayer(doc, [{ toolId: "studio.contrainte.poser", params: { resoudre: [...ids] } }], "Résolution");
}

/** Retirer des contraintes (Supprimer). */
export function commandeRetirerContraintes(doc: StudioDocument, ids: readonly string[]): ResultatSaisie {
  if (!ids.length) return { erreur: "Cochez d’abord les contraintes à retirer." };
  return essayer(doc, [{ toolId: "studio.dessin.supprimer", params: { ids: [...ids] } }], "Retrait");
}

export interface EtatContrainte { id: string; type: StudioTypeContrainte; libelle: string; statut: StudioStatutContrainte; cibles: string; point: StudioPoint | null; raison?: string }

/** Contraintes du dessin et leur état (évalué par le modèle), libellés en français. */
export function etatsContraintes(doc: StudioDocument): EtatContrainte[] {
  const formes = new Map(doc.objects.map((o) => [o.id, o]));
  return (doc.contraintes ?? []).map((c) => {
    const e = studioEvaluerContrainte(c, formes);
    const cibles = c.cibles.map((x) => `${x.objet}${x.segment !== undefined ? ` (segment ${x.segment + 1})` : x.sommet !== undefined ? ` (sommet ${x.sommet + 1})` : x.point ? ` (${x.point === "debut" ? "début" : x.point})` : ""}`).join(" ; ");
    const libelle = `${NOMS_CONTRAINTES[c.type]}${c.valeur !== undefined ? ` ${c.valeur} m` : ""}${c.tangence ? ` (${c.tangence === "interieure" ? "intérieure" : "extérieure"})` : ""}`;
    return { id: c.id, type: c.type, libelle, statut: e.statut, cibles, point: studioPointContrainte(c, formes), ...(e.raison ? { raison: e.raison } : {}) };
  });
}

/** Mode de tangence que la pose retiendrait (aperçu), ou null. */
export function tangencePrevue(doc: StudioDocument, s: SaisieContrainte): StudioModeTangence | null {
  if (s.type !== "tangence" || !s.cibles[0].objet || !s.cibles[1].objet) return null;
  return studioModeTangence({ id: "-", type: "tangence", cibles: [{ objet: s.cibles[0].objet }, { objet: s.cibles[1].objet }] }, new Map(doc.objects.map((o) => [o.id, o]))) ?? null;
}
