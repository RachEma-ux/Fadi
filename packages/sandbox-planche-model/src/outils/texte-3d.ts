/**
 * Outil Texte 3D (cahier-planche §4.14, relevé outils-dessin §14) — machine pure.
 *
 * L'interface ouvre la boîte « Créer un texte 3D » (`etat.boite`) : texte, hauteur (0,30 m), texte plein, extrusion
 * (0,15 m) ; OK → `configurer()` ; Annuler / Échap → l'outil précédent. Le texte (un COMPOSANT) suit ensuite le
 * curseur, couché sur le plan du sol au point inféré ; un clic le pose, il est sélectionné et l'outil passe à
 * Déplacer. Police : police géométrique Fadi (`police-geometrique.ts`, P-7 : aucune police tierce). Texte plein =
 * faces ; extrusion > 0 = solide (dessous, dessus, flancs) ; « plein » décoché avec extrusion = flancs seuls.
 *
 * Lot L16 : l'aperçu montre **les mêmes faces que la pose** (volume compris, trous des lettres compris) ; option
 * **Alignement** gauche / centre / droite par rapport au point ; pose **sur la face survolée** (dans son plan, l'extrusion
 * vers l'extérieur de la face, le haut du texte vers le haut du modèle) en plus du sol. Les faces du texte sont mises
 * en cache par paramètres (le survol ne recalcule que le placement).
 */
import { type FacesPolygonales, creerGroupeDepuisFaces } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { geometrieDuTexte } from "../police-geometrique.js";
import { type Vec3, add, cross, len, normalize, scale, v3 } from "../vecteur.js";
import { contexteSaisie, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, OptionOutil, Transition, VueOutil } from "./machine.js";

export const ID_TEXTE_3D = "texte-3d";
export const HAUTEUR_TEXTE_3D = 0.3;
export const EXTRUSION_TEXTE_3D = 0.15;

export interface ParametresTexte3D {
  readonly texte: string;
  readonly hauteur: number;
  readonly plein: boolean;
  readonly extrusion: number;
}

export type AlignementTexte3D = "gauche" | "centre" | "droite";

/** Plan de pose du texte (monde) : `u` sens de lecture, `v` haut des lettres, `n` sens de l'extrusion. */
export interface PlanTexte3D {
  readonly u: Vec3;
  readonly v: Vec3;
  readonly n: Vec3;
}
export const PLAN_SOL: PlanTexte3D = Object.freeze({ u: v3(1, 0, 0), v: v3(0, 1, 0), n: v3(0, 0, 1) });

export interface EtatTexte3D extends ParametresTexte3D {
  /** Boîte de dialogue ouverte (avant OK). */
  readonly boite: boolean;
  /** (Lot L16) Alignement par rapport au point de pose. */
  readonly alignement: AlignementTexte3D;
  readonly inference: Inference | null;
  readonly erreur: string | null;
}

const initial = (alignement: AlignementTexte3D = "gauche"): EtatTexte3D => ({ boite: true, alignement, texte: "", hauteur: HAUTEUR_TEXTE_3D, plein: true, extrusion: EXTRUSION_TEXTE_3D, inference: null, erreur: null });

/** OK de la boîte : paramètres retenus, placement au curseur. Texte vide refusé (CA-T3D-1). */
export function configurerTexte3D(etat: EtatTexte3D, p: ParametresTexte3D): EtatTexte3D {
  if (p.texte.trim() === "") return { ...etat, erreur: "Le texte 3D est vide." };
  if (!(p.hauteur > 0)) return { ...etat, erreur: "La hauteur du texte doit être strictement positive." };
  if (p.extrusion < 0) return { ...etat, erreur: "L'extrusion ne peut pas être négative." };
  return { ...etat, ...p, boite: false, erreur: null };
}

/** Faces du texte en repère local (x lecture, y haut, z extrusion), à l'origine ; mises en cache par paramètres. */
const cache = new Map<string, { faces: Vec3[][][]; ignores: readonly string[]; largeur: number }>();
function facesLocales(p: ParametresTexte3D): { faces: Vec3[][][]; ignores: readonly string[]; largeur: number } {
  const cle = JSON.stringify([p.texte, p.hauteur, p.plein, p.extrusion]);
  const c = cache.get(cle);
  if (c) return c;
  const g = geometrieDuTexte(p.texte, p.hauteur);
  const T = (q: Vec3, z = 0): Vec3 => v3(q.x, q.y, z);
  const faces: Vec3[][][] = [];
  for (const poly of g.polygones) {
    const bas = poly.map((b) => b.map((q) => T(q)));
    if (p.extrusion > 0) {
      const haut = poly.map((b) => b.map((q) => T(q, p.extrusion)));
      if (p.plein) {
        faces.push(bas.map((b) => [...b].reverse()));
        faces.push(haut);
      }
      poly.forEach((b, k) => {
        const B = bas[k] as Vec3[];
        const H = haut[k] as Vec3[];
        for (let i = 0; i < b.length; i++) {
          const j = (i + 1) % b.length;
          faces.push([[B[i] as Vec3, B[j] as Vec3, H[j] as Vec3, H[i] as Vec3]]);
        }
      });
    } else faces.push(bas);
  }
  const r = { faces, ignores: g.ignores, largeur: g.largeur };
  if (cache.size > 32) cache.clear();
  cache.set(cle, r);
  return r;
}

/**
 * Faces (monde) du texte posé en `origine` dans le plan donné (sol par défaut) : dessous, flancs, dessus. L'alignement
 * décale le texte le long du sens de lecture : gauche = commence au point, centre = centré, droite = finit au point.
 */
export function facesDuTexte3D(p: ParametresTexte3D, origine: Vec3, plan: PlanTexte3D = PLAN_SOL, alignement: AlignementTexte3D = "gauche"): { faces: FacesPolygonales; ignores: readonly string[]; largeur: number } {
  const l = facesLocales(p);
  const dx = alignement === "centre" ? -l.largeur / 2 : alignement === "droite" ? -l.largeur : 0;
  const M = (q: Vec3): Vec3 => add(add(add(origine, scale(plan.u, q.x + dx)), scale(plan.v, q.y)), scale(plan.n, q.z));
  return { faces: l.faces.map((f) => f.map((b) => b.map(M))), ignores: l.ignores, largeur: l.largeur };
}

/**
 * Plan de pose sous le curseur (lot L16) : sur une face visée, son plan — extrusion vers l'extérieur de la face, haut
 * des lettres vers le haut du modèle (sur une face horizontale : vers +Y, ou −Y sous une face tournée vers le bas) ;
 * sinon le sol.
 */
export function planDePose(_ctx: ContexteOutil, i: Inference | null): PlanTexte3D {
  // La normale vient de l'inférence (face de l'occurrence visée), pas d'une recherche par identifiant (revue de #129).
  if (!i || i.type !== "sur-face" || i.normale === undefined) return PLAN_SOL;
  const n = normalize(i.normale);
  const Z = v3(0, 0, 1);
  let v = scale(n, -n.z);
  v = add(Z, v); // projection de Z sur le plan de la face
  if (len(v) < 1e-6) {
    const u = v3(1, 0, 0);
    return { u, v: normalize(cross(n, u)), n };
  }
  v = normalize(v);
  return { u: normalize(cross(v, n)), v, n };
}

/** Alignement mémorisé (préférence d'interface) : valeur inconnue → gauche (défaut). */
export function lireAlignementTexte3D(valeur: unknown): AlignementTexte3D {
  return valeur === "centre" || valeur === "droite" ? valeur : "gauche";
}

function optionsTexte(e: EtatTexte3D): OptionOutil[] {
  return [{ id: "alignement", valeur: e.alignement, valeurs: [{ id: "gauche", disponible: true }, { id: "centre", disponible: true }, { id: "droite", disponible: true }] }];
}

export const machineTexte3D: MachineOutil<EtatTexte3D> = {
  id: ID_TEXTE_3D,
  initial,

  traiter(etat, ev, ctx): Transition<EtatTexte3D> {
    switch (ev.genre) {
      case "survol":
        if (etat.boite) return { etat };
        return { etat: { ...etat, inference: inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie: geometrieVisible(ctx.modele), ...(ctx.repere ? { axes: ctx.repere } : {}) }), erreur: null } };
      case "clic": {
        if (etat.boite || etat.texte.trim() === "") return { etat };
        const i = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie: geometrieVisible(ctx.modele), ...(ctx.repere ? { axes: ctx.repere } : {}) });
        try {
          const { faces, ignores } = facesDuTexte3D(etat, i.point, planDePose(ctx, i), etat.alignement);
          if (faces.length === 0) return { etat: { ...etat, inference: i, erreur: ignores.length ? `Aucun caractère connu dans « ${etat.texte} » (ignorés : ${ignores.join(" ")}).` : "Texte vide." } };
          const r = creerGroupeDepuisFaces(ctx.modele, faces, { nom: `Texte 3D « ${etat.texte.replace(/\s+/g, " ").trim()} »`, genre: "composant" });
          return {
            etat: { ...initial(etat.alignement), inference: i, erreur: ignores.length ? `Caractères ignorés (hors police géométrique) : ${ignores.join(" ")}.` : null },
            modele: r.modele,
            selection: [r.occurrence],
            operation: "Texte 3D",
            outil: "deplacer",
          };
        } catch (err) {
          return { etat: { ...etat, inference: i, erreur: messageErreur(err) } };
        }
      }
      case "echap":
        return { etat: initial(etat.alignement), outilPrecedent: etat.boite };
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par le Texte 3D." } };
      case "touche":
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  configurer(etat, option, valeur): Transition<EtatTexte3D> {
    if (option === "alignement" && (valeur === "gauche" || valeur === "centre" || valeur === "droite")) return { etat: { ...etat, alignement: valeur } };
    return { etat };
  },

  vue(etat, ctx): VueOutil {
    const consigne = etat.boite ? "Créez le texte 3D (boîte de dialogue)." : consigneDe(ID_TEXTE_3D, 1);
    const lignes: Vec3[][] = [];
    const faces: Vec3[][] = [];
    const trous: Vec3[][][] = [];
    if (!etat.boite && etat.inference && etat.texte.trim() !== "") {
      // Lot L16 : l'aperçu montre les faces mêmes de la pose (volume et trous des lettres compris), dans le plan visé.
      const { faces: fs } = facesDuTexte3D(etat, etat.inference.point, planDePose(ctx, etat.inference), etat.alignement);
      for (const f of fs) {
        for (const b of f) lignes.push([...b, b[0] as Vec3]);
        if (f[0]) {
          faces.push(f[0] as Vec3[]);
          trous.push(f.slice(1) as Vec3[][]);
        }
      }
    }
    return { ...vueModif({ consigne, mesures: mesures(null, "", contexteSaisie("aucune", ctx)), inference: etat.boite ? null : etat.inference, apercu: { lignes, faces, trous }, ctx, erreur: etat.erreur }), options: optionsTexte(etat) };
  },
};
