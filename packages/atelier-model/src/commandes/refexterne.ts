/**
 * Références externes (DA-05-11) : le plan d'un niveau d'une **publication** d'un autre projet Fadi, superposé en
 * lecture seule à un niveau du projet. Rien de la source n'est copié (R15) : la référence est une définition
 * `reference-externe` qui épingle la source (projet, publication, révision, empreinte, niveau) et la conversion
 * explicite du repère local de la source vers le repère local du projet (position, angle ; R5).
 *
 * Commandes : `refexterne.rattacher` (créer, ou épingler une publication plus récente) et `refexterne.detacher`.
 * Les droits sur la source, l'existence de la publication et l'absence de référence circulaire sont contrôlés par
 * le serveur avant l'application (le modèle ne connaît pas les autres projets).
 */
import type { Definition, ModeleAtelier } from "../modele.js";
import type { Point2 } from "../unites.js";
import type { Angle } from "../unites.js";
import { effetsVides, ErreurCommande, lire, type ContexteCommande, type Reducteur } from "./base.js";

export const REFERENCE_EXTERNE = "reference-externe" as Definition["classe"];

export interface ParamsReferenceExterne {
  nom: string;
  projetSourceId: string;
  publicationId: string;
  revisionSource: number;
  empreinteSource: string;
  niveauSourceId: string;
  niveauId: string;
  position: Point2;
  angle: Angle;
  calqueId: string | null;
}

type Brut = Record<string, unknown>;

export function lireParamsReferenceExterne(etat: ModeleAtelier, p: Brut): ParamsReferenceExterne {
  const niveauId = lire.chaine(p, "niveauId");
  if (!etat.niveaux[niveauId]) throw new ErreurCommande("precondition", "niveauId", `niveau inconnu : ${niveauId}`);
  const calqueId = lire.chaineOuNull(p, "calqueId");
  if (calqueId !== null && !etat.calques[calqueId]) throw new ErreurCommande("precondition", "calqueId", `calque inconnu : ${calqueId}`);
  const revisionSource = lire.nombre(p, "revisionSource", { entier: true, min: 0 })!;
  return {
    nom: lire.chaine(p, "nom"),
    projetSourceId: lire.chaine(p, "projetSourceId"),
    publicationId: lire.chaine(p, "publicationId"),
    revisionSource,
    empreinteSource: lire.chaine(p, "empreinteSource"),
    niveauSourceId: lire.chaine(p, "niveauSourceId"),
    niveauId,
    position: lire.point(p, "position")!,
    angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" },
    calqueId,
  };
}

export const referencesExternes = (etat: ModeleAtelier) => Object.values(etat.definitions).filter((d) => d.classe === REFERENCE_EXTERNE);

export const reducteursRefExterne: Record<string, Reducteur> = {
  "refexterne.rattacher": (etat, p, ctx: ContexteCommande) => {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("refext");
    const existante = etat.definitions[id];
    if (existante && existante.classe !== REFERENCE_EXTERNE) throw new ErreurCommande("precondition", "id", `définition d'une autre nature : ${id}`);
    const avant = existante ? (existante.params as unknown as ParamsReferenceExterne) : null;
    const params = lireParamsReferenceExterne(etat, { ...(avant as unknown as Brut | null ?? {}), ...p });
    if (avant && avant.projetSourceId !== params.projetSourceId) throw new ErreurCommande("precondition", "projetSourceId", "une référence garde sa source : détachez-la pour en rattacher une autre");
    if (avant && params.revisionSource < avant.revisionSource) throw new ErreurCommande("precondition", "revisionSource", "une mise à jour n'épingle jamais une révision plus ancienne");
    const definition: Definition = { id, classe: REFERENCE_EXTERNE, nom: params.nom, params: params as unknown as Brut, version: (existante?.version ?? 0) + 1 };
    const effets = effetsVides();
    (existante ? effets.modifies : effets.crees).push(id);
    effets.niveauxTouches.push(params.niveauId);
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: definition } }, effets };
  },
  "refexterne.detacher": (etat, p) => {
    const id = lire.chaine(p, "id");
    if (etat.definitions[id]?.classe !== REFERENCE_EXTERNE) throw new ErreurCommande("precondition", "id", `référence externe inconnue : ${id}`);
    const definitions = { ...etat.definitions };
    delete definitions[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, definitions }, effets };
  },
};

/** Conversion explicite du repère local de la source vers celui du projet : rotation (angle) puis translation. */
export function versRepereProjet(p: { x: number; y: number }, ref: Pick<ParamsReferenceExterne, "position" | "angle">): { x: number; y: number } {
  const a = (ref.angle.value * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: Math.round((ref.position.x + p.x * c - p.y * s) * 1e6) / 1e6, y: Math.round((ref.position.y + p.x * s + p.y * c) * 1e6) / 1e6 };
}
