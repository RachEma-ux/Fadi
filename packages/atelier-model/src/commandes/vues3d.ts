/**
 * Vues 3D enregistrées (D-053, fiches DA-17-16, DA-18-03) : point de vue de la zone 3D partagé par le projet —
 * position de la caméra et point visé (repère local, mètres), vue technique, présentation, coupes, arêtes, niveau
 * actif. Ce sont des définitions `vue-3d` (journal, annuler / rétablir, archive) ; elles ne produisent aucun
 * document (les vues dessinées restent les définitions `vue`). Rien n'est déduit : une vue enregistrée rejoue
 * exactement les réglages saisis.
 */
import type { Definition, ModeleAtelier } from "../modele.js";
import { effetsVides, ErreurCommande, lire, type ContexteCommande, type Reducteur } from "./base.js";

type Brut = Record<string, unknown>;

export const CLASSE_VUE_3D = "vue-3d" as Definition["classe"];
export const VUES_TECHNIQUES_3D = ["perspective", "dessus", "coupe-ns", "coupe-eo", "facade-sud", "facade-nord", "facade-est", "facade-ouest"] as const;
export const PRESENTATIONS_3D = ["batiment", "niveau", "eclate", "eclate-horizontal", "eclate-classes", "eclate-groupes"] as const;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface ParamsVue3D {
  nom: string;
  camera: { position: Point3; cible: Point3 };
  vue: (typeof VUES_TECHNIQUES_3D)[number];
  presentation: (typeof PRESENTATIONS_3D)[number];
  /** Hauteur de coupe au-dessus du niveau actif (m), ou null. */
  coupeHorizontale: number | null;
  /** Position de la coupe verticale, 0–1 sur l'étendue du bâtiment. */
  positionCoupe: number;
  aretes: boolean;
  niveauId: string | null;
  /** Boîte de coupe (D-090), bornes en fraction de l'étendue du bâtiment ; absente : aucune. */
  boiteCoupe?: { x0: number; x1: number; y0: number; y1: number };
  /** Annotations 3D (D-090) : un point du modèle (repère local, m) et un texte. */
  annotations?: { position: Point3; texte: string }[];
}

const BORNE = 1e6;

function point3(brut: unknown, cle: string): Point3 {
  const p = brut as Brut | null;
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= BORNE;
  if (!p || typeof p !== "object" || !ok(p["x"]) || !ok(p["y"]) || !ok(p["z"])) throw new ErreurCommande("invalide", cle, `« ${cle} » : point { x, y, z } en mètres (repère local) attendu`);
  return { x: p["x"] as number, y: p["y"] as number, z: p["z"] as number };
}

export function lireParamsVue3D(etat: ModeleAtelier, p: Brut): ParamsVue3D {
  const nom = lire.chaine(p, "nom").trim();
  if (!nom || nom.length > 120) throw new ErreurCommande("invalide", "nom", "nom de la vue requis (120 caractères au plus)");
  const camera = (p["camera"] ?? {}) as Brut;
  const position = point3(camera["position"], "camera.position");
  const cible = point3(camera["cible"], "camera.cible");
  if (Math.hypot(position.x - cible.x, position.y - cible.y, position.z - cible.z) < 1e-6) throw new ErreurCommande("invalide", "camera", "la caméra et le point visé sont confondus");
  const vue = lire.enumeration(p, "vue", VUES_TECHNIQUES_3D, "perspective");
  const presentation = lire.enumeration(p, "presentation", PRESENTATIONS_3D, "batiment");
  const coupeHorizontale = lire.nombre(p, "coupeHorizontale", { optionnel: true, min: 0, max: 1000 });
  const positionCoupe = lire.nombre(p, "positionCoupe", { optionnel: true, min: 0, max: 1 }) ?? 0.5;
  const niveauId = lire.chaineOuNull(p, "niveauId");
  if (niveauId && !etat.niveaux[niveauId]) throw new ErreurCommande("precondition", "niveauId", `niveau inconnu : ${niveauId}`);
  const sortie: ParamsVue3D = { nom, camera: { position, cible }, vue, presentation, coupeHorizontale, positionCoupe, aretes: lire.booleen(p, "aretes", true), niveauId };
  const bc = p["boiteCoupe"] as Brut | null | undefined;
  if (bc !== undefined && bc !== null) {
    const f = (k: string) => {
      const v = bc[k];
      if (typeof v !== "number" || !(v >= 0 && v <= 1)) throw new ErreurCommande("invalide", `boiteCoupe.${k}`, "borne de la boîte de coupe entre 0 et 1");
      return v;
    };
    const b = { x0: f("x0"), x1: f("x1"), y0: f("y0"), y1: f("y1") };
    if (!(b.x0 < b.x1 && b.y0 < b.y1)) throw new ErreurCommande("invalide", "boiteCoupe", "boîte de coupe vide (x0 < x1 et y0 < y1 attendus)");
    sortie.boiteCoupe = b;
  }
  const an = p["annotations"];
  if (an !== undefined && an !== null) {
    if (!Array.isArray(an) || an.length > 100) throw new ErreurCommande("invalide", "annotations", "annotations : liste de 100 éléments au plus");
    const liste = an.map((x, i) => {
      const q = (x ?? {}) as Brut;
      const texte = typeof q["texte"] === "string" ? q["texte"].trim() : "";
      if (!texte || texte.length > 500) throw new ErreurCommande("invalide", `annotations[${i}].texte`, "texte d'annotation requis (500 caractères au plus)");
      return { position: point3(q["position"], `annotations[${i}].position`), texte };
    });
    if (liste.length) sortie.annotations = liste;
  }
  return sortie;
}

export const reducteursVues3D: Record<string, Reducteur> = {
  /** Enregistre une vue 3D ; avec l'identifiant d'une vue existante, la remplace (version suivante). */
  "vue3d.enregistrer": (etat, p, ctx: ContexteCommande) => {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("vue3d");
    const existante = etat.definitions[id];
    if (existante && existante.classe !== CLASSE_VUE_3D) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const params = lireParamsVue3D(etat, p);
    const effets = effetsVides();
    (existante ? effets.modifies : effets.crees).push(id);
    const def: Definition = { id, classe: CLASSE_VUE_3D, nom: params.nom, params: params as unknown as Brut, version: existante ? existante.version + 1 : 1 };
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: def } }, effets };
  },
  "vue3d.supprimer": (etat, p) => {
    const id = lire.chaine(p, "id");
    if (etat.definitions[id]?.classe !== CLASSE_VUE_3D) throw new ErreurCommande("precondition", "id", `vue 3D inconnue : ${id}`);
    const definitions = { ...etat.definitions };
    delete definitions[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, definitions }, effets };
  },
};

/** Vues 3D enregistrées du projet, par nom. */
export const vues3D = (etat: ModeleAtelier): (Definition & { params: ParamsVue3D })[] =>
  Object.values(etat.definitions)
    .filter((d): d is Definition & { params: ParamsVue3D } => d.classe === CLASSE_VUE_3D)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr") || (a.id < b.id ? -1 : 1));
