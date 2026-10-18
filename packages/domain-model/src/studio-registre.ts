/**
 * Registre des outils de Studio (orientations du propriétaire, Issue #166) : chaque outil de Studio est déclaré ici,
 * une seule fois, sous un identifiant `studio.<domaine>.<outil>`. Le registre décrit ; il n'accorde aucun droit :
 * l'écriture reste décidée par le rôle du membre, relu par le serveur à chaque enregistrement de révision.
 *
 * Chaque entrée déclare la version de son contrat, le schéma de son entrée (objet de type JSON Schema, données pures),
 * la référence du schéma de sa sortie (`outputSchemaRef`), sa capacité d'essai à blanc (`supportsDryRun` : la commande
 * est une fonction pure du document, l'appliquer en mémoire sans enregistrer en est l'essai) et son exposition aux
 * agents (`agentExposure`, « none » par défaut et seule valeur admise : aucun outil n'est offert à un agent ni par MCP).
 *
 * Pur : ni React, ni DOM, ni stockage. Icônes et barres appartiennent à l'interface (`apps/web`), pas au registre.
 */
import { SCHEMA_DOCUMENT2D } from "./studio-document2d.js";

export const VERSION_CONTRAT_OUTILS = "studio.outil/1";
export const MOTIF_ID_OUTIL = /^studio\.[a-z]+\.[a-z-]+$/;

/** Schéma d'entrée : sous-ensemble déclaratif de JSON Schema, sans fonction ni référence externe. */
export type SchemaJson = { readonly [cle: string]: unknown };

export interface OutilStudio {
  readonly id: string;
  readonly domaine: "dessin";
  readonly libelle: string;
  /** Raccourci canonique, au format de la lecture du clavier de Studio (« L », « Maj+C », « Espace »). */
  readonly raccourci: string;
  readonly contractVersion: typeof VERSION_CONTRAT_OUTILS;
  readonly inputSchema: SchemaJson;
  readonly outputSchemaRef: typeof SCHEMA_DOCUMENT2D;
  readonly supportsDryRun: boolean;
  readonly agentExposure: "none";
}

const nombre = { type: "number" } as const;
const positif = { type: "number", exclusiveMinimum: 0 } as const;
const identifiant = { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" } as const;
const point = { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: nombre, y: nombre } } as const;
const lien = {
  oneOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["primitiveId", "extremite"], properties: { primitiveId: identifiant, extremite: { enum: ["a", "b"] } } }],
} as const;
const objet = (proprietes: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(proprietes), properties: proprietes });

function geler<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const enfant of Object.values(v)) geler(enfant);
    Object.freeze(v);
  }
  return v;
}

const commun = { domaine: "dessin", contractVersion: VERSION_CONTRAT_OUTILS, outputSchemaRef: SCHEMA_DOCUMENT2D, supportsDryRun: true, agentExposure: "none" } as const;

/** Catalogue figé : aucune entrée ne s'ajoute, ne se retire ni ne se modifie à l'exécution. */
export const REGISTRE_OUTILS_STUDIO: readonly OutilStudio[] = geler([
  // La sélection ne modifie pas le document : sa sortie est le document inchangé.
  { ...commun, id: "studio.dessin.selection", libelle: "Sélection", raccourci: "Espace", inputSchema: objet({ ids: { type: "array", uniqueItems: true, items: identifiant } }) },
  { ...commun, id: "studio.dessin.ligne", libelle: "Ligne", raccourci: "L", inputSchema: objet({ id: identifiant, calqueId: identifiant, a: point, b: point }) },
  { ...commun, id: "studio.dessin.rectangle", libelle: "Rectangle", raccourci: "R", inputSchema: objet({ id: identifiant, calqueId: identifiant, origine: point, largeur: positif, hauteur: positif }) },
  {
    ...commun,
    id: "studio.dessin.cote",
    libelle: "Cote",
    raccourci: "Maj+C",
    inputSchema: objet({ id: identifiant, calqueId: identifiant, a: point, b: point, decalage: nombre, liens: objet({ a: lien, b: lien }) }),
  },
  { ...commun, id: "studio.dessin.deplacer", libelle: "Déplacer", raccourci: "M", inputSchema: objet({ ids: { type: "array", minItems: 1, uniqueItems: true, items: identifiant }, dx: nombre, dy: nombre }) },
]);

export function outilStudio(id: string): OutilStudio | null {
  return REGISTRE_OUTILS_STUDIO.find((o) => o.id === id) ?? null;
}
