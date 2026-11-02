import type { StudioArchitectureItem } from "../architecture/types.js";
import type { Etat, Gestionnaire } from "../commandes/etat.js";
import { editable } from "../commandes/etat.js";
import type { StudioShape } from "../objets/formes.js";
import { array, fail, identifier, record } from "../noyau/validation.js";
import { STUDIO_LIMITES_PROPRIETES } from "./limites.js";

/**
 * Propriétés BIM déclarées (E.1-01) sur le périmètre pilote : murs et ouvertures (`architecture`) et objets extrudés
 * (`objects` portant une `extrusion`). Extension additive et facultative du document (`StudioDocument.proprietes`),
 * séparée des objets pour qu'un lecteur antérieur ne l'interprète jamais à tort ; absente ou vide : aucune (forme
 * canonique).
 *
 * - Une propriété est **déclarée** par l'utilisateur : nom, valeur, unité et source facultative. Fadi ne remplit jamais
 *   une valeur : une propriété sans `valeur` est « non évaluée » (`valeurPropriete` rend `null`).
 * - Clé : (`cibleId`, `nom`) ; déclarer de nouveau la même clé remplace la propriété (commande `studio.propriete.definir`),
 *   `studio.propriete.retirer` la retire. Un calque verrouillé refuse les deux (l'ouverture suit le calque de son mur).
 * - Une propriété suit l'existence de son objet : l'objet supprimé (ou le mur supprimé avec ses ouvertures), ses
 *   propriétés disparaissent avec lui ; une copie n'emporte pas les propriétés de sa source. Un objet qui sortirait du
 *   périmètre (aplati) alors qu'il porte des propriétés : le lot est **refusé** (retirer d'abord ses propriétés).
 * - Aucune valeur réglementaire, aucun nom imposé, aucune propriété fournie par défaut.
 */
export interface StudioPropriete {
  /** Objet porteur : mur, ouverture ou objet extrudé du document. */
  cibleId: string;
  nom: string;
  /** Valeur déclarée (nombre fini ou texte) ; absente = non évaluée. */
  valeur?: number | string;
  /** Unité déclarée, telle que saisie (exigée pour une valeur numérique) ; jamais convertie. */
  unite?: string;
  /** Source déclarée de la valeur (document, fiche, relevé…). */
  source?: string;
}

/** Bornes techniques (pas des valeurs métier) : `limites.ts`. */
export { STUDIO_LIMITES_PROPRIETES };

function texte(value: unknown, path: string, max: number, nom: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) fail(path, `${nom} non vide attendu`);
  if (value.length > max) fail(path, `${nom} de ${max} caractères au plus`);
  if (value !== value.trim()) fail(path, `${nom} sans espace de bord attendu`);
  return value;
}

export function validerPropriete(value: unknown, path: string): StudioPropriete {
  const o = record(value, ["cibleId", "nom"], path, ["valeur", "unite", "source"]);
  const cibleId = identifier(o.cibleId, `${path}.cibleId`);
  const nom = texte(o.nom, `${path}.nom`, STUDIO_LIMITES_PROPRIETES.nom, "nom");
  let valeur: number | string | undefined;
  if (Object.hasOwn(o, "valeur")) {
    if (typeof o.valeur === "number") {
      if (!Number.isFinite(o.valeur)) fail(`${path}.valeur`, "nombre fini attendu");
      valeur = Object.is(o.valeur, -0) ? 0 : o.valeur;
    } else if (typeof o.valeur === "string") valeur = texte(o.valeur, `${path}.valeur`, STUDIO_LIMITES_PROPRIETES.texte, "texte");
    else fail(`${path}.valeur`, "nombre ou texte attendu (ou absent : non évaluée)");
  }
  const unite = Object.hasOwn(o, "unite") ? texte(o.unite, `${path}.unite`, STUDIO_LIMITES_PROPRIETES.unite, "unité") : undefined;
  const source = Object.hasOwn(o, "source") ? texte(o.source, `${path}.source`, STUDIO_LIMITES_PROPRIETES.source, "source") : undefined;
  if (typeof valeur === "number" && unite === undefined) fail(`${path}.unite`, "unité déclarée attendue pour une valeur numérique");
  return {
    cibleId, nom,
    ...(valeur !== undefined ? { valeur } : {}),
    ...(unite !== undefined ? { unite } : {}),
    ...(source !== undefined ? { source } : {}),
  };
}

/** Nature de la cible dans le périmètre pilote, ou motif de refus. */
export type CiblePropriete = { type: "mur" | "ouverture" | "echelle-acces" | "poteau" | "poutre" | "dalle" | "objet-extrude"; layerId?: string } | { refus: string };

export function ciblePropriete(objects: readonly StudioShape[], architecture: readonly StudioArchitectureItem[], id: string): CiblePropriete {
  const a = architecture.find((x) => x.id === id);
  if (a?.type === "wall") return { type: "mur", ...(a.layerId !== undefined ? { layerId: a.layerId } : {}) };
  if (a?.type === "ladder") return { type: "echelle-acces", ...(a.layerId !== undefined ? { layerId: a.layerId } : {}) };
  // Lot W3-B : éléments structurels typés (EX-064 : un objet architectural porte ses propriétés).
  if (a?.type === "column" || a?.type === "beam" || a?.type === "slab") return { type: a.type === "column" ? "poteau" : a.type === "beam" ? "poutre" : "dalle", ...(a.layerId !== undefined ? { layerId: a.layerId } : {}) };
  if (a?.type === "opening") {
    const hote = architecture.find((x) => x.id === a.hostId);
    return { type: "ouverture", ...(hote?.type === "wall" && hote.layerId !== undefined ? { layerId: hote.layerId } : {}) };
  }
  const o = objects.find((x) => x.id === id);
  if (o?.extrusion) return { type: "objet-extrude", ...(o.layerId !== undefined ? { layerId: o.layerId } : {}) };
  if (o) return { refus: `objet non extrudé : ${id} (périmètre : murs, ouvertures, objets extrudés)` };
  return { refus: `objet introuvable : ${id}` };
}

/**
 * Contrôle des propriétés d'un document (éléments déjà validés) : cible existante et dans le périmètre, clé unique,
 * nombre borné. Refus au premier motif.
 */
export function controlerProprietes(proprietes: readonly StudioPropriete[], objects: readonly StudioShape[], architecture: readonly StudioArchitectureItem[], path: string): void {
  if (proprietes.length > STUDIO_LIMITES_PROPRIETES.proprietes) fail(path, `${STUDIO_LIMITES_PROPRIETES.proprietes} propriétés au plus`);
  const cles = new Set<string>();
  const parCible = new Map<string, number>();
  proprietes.forEach((p, i) => {
    const c = ciblePropriete(objects, architecture, p.cibleId);
    if ("refus" in c) fail(`${path}[${i}]`, `propriété « ${p.nom} » : ${c.refus}`);
    const cle = JSON.stringify([p.cibleId, p.nom]);
    if (cles.has(cle)) fail(`${path}[${i}]`, `propriété « ${p.nom} » déclarée deux fois sur ${p.cibleId}`);
    cles.add(cle);
    const n = (parCible.get(p.cibleId) ?? 0) + 1;
    if (n > STUDIO_LIMITES_PROPRIETES.parCible) fail(`${path}[${i}]`, `${STUDIO_LIMITES_PROPRIETES.parCible} propriétés au plus par objet`);
    parCible.set(p.cibleId, n);
  });
}

export function validerProprietes(value: unknown, objects: readonly StudioShape[], architecture: readonly StudioArchitectureItem[], path: string): StudioPropriete[] {
  const raw = array(value, path);
  if (raw.length > STUDIO_LIMITES_PROPRIETES.proprietes) fail(path, `${STUDIO_LIMITES_PROPRIETES.proprietes} propriétés au plus`);
  const out = raw.map((p, i) => validerPropriete(p, `${path}[${i}]`));
  controlerProprietes(out, objects, architecture, path);
  return out;
}

/** Valeur d'une propriété : la valeur déclarée, ou `null` (« non évaluée ») ; jamais une valeur proposée. */
export function valeurPropriete(p: StudioPropriete | undefined): number | string | null {
  return p?.valeur ?? null;
}

/** Propriétés d'un objet, dans l'ordre du document. */
export function proprietesDe(proprietes: readonly StudioPropriete[] | undefined, cibleId: string): StudioPropriete[] {
  return (proprietes ?? []).filter((p) => p.cibleId === cibleId);
}

/** État d'un lot augmenté des propriétés (champ facultatif de l'état, posé par `applyStudioCommands`). */
type EtatProprietes = Etat & { proprietes?: StudioPropriete[] };

function cibleModifiable(state: EtatProprietes, cibleId: string, path: string): void {
  const c = ciblePropriete(state.objects, state.architecture, cibleId);
  if ("refus" in c) fail(path, c.refus);
  editable(state, c, path);
}

export const definirPropriete: Gestionnaire = (state, params, path) => {
  const s = state as EtatProprietes;
  const p = validerPropriete(params, `${path}.params`);
  cibleModifiable(s, p.cibleId, path);
  const liste = s.proprietes ?? [];
  const i = liste.findIndex((x) => x.cibleId === p.cibleId && x.nom === p.nom);
  s.proprietes = i < 0 ? [...liste, p] : liste.map((x, j) => (j === i ? p : x));
};

export const retirerPropriete: Gestionnaire = (state, params, path) => {
  const s = state as EtatProprietes;
  const o = record(params, ["cibleId", "nom"], `${path}.params`);
  const cibleId = identifier(o.cibleId, `${path}.params.cibleId`);
  const nom = texte(o.nom, `${path}.params.nom`, STUDIO_LIMITES_PROPRIETES.nom, "nom");
  const liste = s.proprietes ?? [];
  if (!liste.some((x) => x.cibleId === cibleId && x.nom === nom)) fail(path, `propriété introuvable : « ${nom} » sur ${cibleId}`);
  cibleModifiable(s, cibleId, path);
  s.proprietes = liste.filter((x) => !(x.cibleId === cibleId && x.nom === nom));
};

/**
 * Fin de lot : les propriétés d'un objet qui n'existe plus disparaissent avec lui (suppression, mur supprimé avec ses
 * ouvertures). Un objet encore présent mais hors du périmètre n'est pas élagué : la validation finale refuse le lot.
 */
export function elaguerProprietes(proprietes: readonly StudioPropriete[], ids: (id: string) => boolean): StudioPropriete[] {
  return proprietes.filter((p) => ids(p.cibleId));
}
