/**
 * Pousser / tirer (DA-04-07) et extrusion d'esquisse (DA-04-01), L3b.2 — module pur : quelle grandeur d'un objet
 * se pousse, quelles commandes du contrat en résultent. Les outils (`outils.ts`) et la vue 3D (`Vue3d.tsx`, aperçu
 * pendant le glisser) appellent les mêmes fonctions : l'aperçu et la validation écrivent la même chose.
 *
 * Grandeur poussée : hauteur d'un mur (si elle est donnée par `hauteur` ; un mur lié à un `niveauHaut` se règle
 * dans l'inspecteur), épaisseur d'une dalle ou d'une toiture, hauteur d'un solide ou d'un poteau.
 */
import { CLASSES_ESQUISSE, type Commande, type EtatModele, type IdObjet, type ObjetModele, type PointLocal } from "@parcours/atelier-model";
import { dessinerEsquisse } from "../plan2d/dessinateurs";

const m = (value: number) => ({ value, unit: "m" as const });
const commande = (type: string, params: unknown, cibles: readonly IdObjet[] = []): Commande => ({ type, params, cibles }) as unknown as Commande;

/** Précision des valeurs issues d'un glisser (cm) ; une saisie au clavier reste exacte. */
export const PAS_GLISSER = 0.01;
export const arrondirGlisser = (v: number) => Math.round(v / PAS_GLISSER) * PAS_GLISSER;

export interface CiblePoussee {
  readonly objetId: IdObjet;
  readonly classe: string;
  readonly cle: "hauteur" | "epaisseur";
  readonly libelle: string;
  readonly valeur: number;
}

const CLES: Readonly<Record<string, { cle: "hauteur" | "epaisseur"; libelle: string }>> = {
  mur: { cle: "hauteur", libelle: "Hauteur" },
  solide: { cle: "hauteur", libelle: "Hauteur" },
  poteau: { cle: "hauteur", libelle: "Hauteur" },
  dalle: { cle: "epaisseur", libelle: "Épaisseur" },
  toiture: { cle: "epaisseur", libelle: "Épaisseur" },
};

/** Grandeur poussée d'un objet, ou motif lisible. */
export function ciblePoussee(o: ObjetModele | undefined): CiblePoussee | { readonly motif: string } {
  if (!o) return { motif: "sélectionner un objet" };
  const c = CLES[o.classe];
  if (!c) return { motif: `la classe « ${o.classe} » n'a pas de hauteur ni d'épaisseur à pousser (mur, dalle, toiture, solide, poteau)` };
  const v = (o.params as Record<string, { value?: number } | undefined>)[c.cle]?.value;
  if (typeof v !== "number") return { motif: o.classe === "mur" ? "hauteur liée au niveau haut : la régler dans l'inspecteur" : `${c.libelle.toLowerCase()} non renseignée` };
  return { objetId: o.id, classe: o.classe, cle: c.cle, libelle: c.libelle, valeur: v };
}

/** `*.modifier` de la grandeur poussée ; la valeur doit être > 0 (le réducteur contrôle le reste). */
export function commandesPoussee(c: CiblePoussee, valeur: number): readonly Commande[] | { readonly motif: string } {
  if (!(Number.isFinite(valeur) && valeur > 0)) return { motif: `${c.libelle.toLowerCase()} ${String(valeur).replace(".", ",")} m : une valeur strictement positive est exigée` };
  return [commande(`${c.classe}.modifier`, { modifications: { [c.cle]: m(valeur) } }, [c.objetId])];
}

/** Classes d'esquisse fermées extrudables (DA-04-01-a). */
export const ESQUISSES_FERMEES = ["esquisse.polyligne", "esquisse.rectangle", "esquisse.polygone", "esquisse.cercle", "esquisse.spline", "esquisse.hachure"] as const;

export interface ContourExtrudable {
  readonly source: ObjetModele & { readonly niveauId: IdObjet; readonly calqueId: IdObjet };
  readonly contour: readonly PointLocal[];
  readonly trous: readonly { readonly polygone: readonly PointLocal[] }[];
}

/** Contour fermé d'une esquisse (cercle facetté comme dans le plan), ou motif lisible. */
export function contourExtrudable(o: ObjetModele | undefined): ContourExtrudable | { readonly motif: string } {
  if (!o) return { motif: "sélectionner un contour d'esquisse fermé" };
  if (!(CLASSES_ESQUISSE as readonly string[]).includes(o.classe) || !(ESQUISSES_FERMEES as readonly string[]).includes(o.classe)) return { motif: "seul un contour d'esquisse fermé s'extrude (polyligne fermée, rectangle, polygone, cercle, spline fermée, hachure)" };
  if (o.niveauId === undefined || o.calqueId === undefined) return { motif: "l'esquisse n'a pas de niveau ou de calque" };
  if (o.classe === "esquisse.hachure") {
    const p = o.params as { contour: readonly PointLocal[]; trous: readonly { polygone: readonly PointLocal[] }[] };
    return { source: o as ContourExtrudable["source"], contour: p.contour, trous: p.trous.map((t) => ({ polygone: t.polygone })) };
  }
  const d = dessinerEsquisse(o);
  if (!d?.contour || d.contour.length < 3) return { motif: "contour ouvert : fermer la polyligne ou la spline d'abord" };
  return { source: o as ContourExtrudable["source"], contour: d.contour, trous: [] };
}

export interface OptionsExtrusion {
  readonly id: IdObjet;
  readonly hauteur: number;
  readonly decalageBase: number;
  readonly conserverSource: boolean;
}

/** `solide.extruder` (+ `esquisse.supprimer` de la source si elle est consommée, même lot). */
export function commandesExtrusion(c: ContourExtrudable, o: OptionsExtrusion): readonly Commande[] | { readonly motif: string } {
  if (!(Number.isFinite(o.hauteur) && o.hauteur > 0)) return { motif: "hauteur absente ou nulle : une hauteur strictement positive est exigée (vers le bas : décalage de base)" };
  const s = c.source;
  const nom = (s.params as { nom?: string }).nom;
  const lot = [
    commande("solide.extruder", {
      id: o.id,
      niveauId: s.niveauId,
      calqueId: s.calqueId,
      contour: c.contour,
      trous: c.trous,
      ferme: true,
      hauteur: m(o.hauteur),
      decalageBase: m(o.decalageBase),
      role: "solid",
      ...(nom ? { nom } : {}),
    }),
  ];
  if (!o.conserverSource) lot.push(commande("esquisse.supprimer", {}, [s.id]));
  return lot;
}

/** État d'aperçu (essai à blanc) d'un lot, ou `null` si le lot est refusé. */
export function etatApercu(essayer: (c: readonly Commande[]) => { ok: true; etat: EtatModele } | { ok: false }, commandes: readonly Commande[] | { motif: string }): EtatModele | null {
  if (!Array.isArray(commandes)) return null;
  const r = essayer(commandes as readonly Commande[]);
  return r.ok ? r.etat : null;
}
