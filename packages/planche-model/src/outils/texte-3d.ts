/**
 * Outil Texte 3D (cahier-planche §4.14, relevé outils-dessin §14) — machine pure.
 *
 * L'interface ouvre la boîte « Créer un texte 3D » (`etat.boite`) : texte, hauteur (0,30 m), texte plein, extrusion
 * (0,15 m) ; OK → `configurer()` ; Annuler / Échap → l'outil précédent. Le texte (un COMPOSANT) suit ensuite le
 * curseur, couché sur le plan du sol au point inféré ; un clic le pose, il est sélectionné et l'outil passe à
 * Déplacer. Police : police géométrique Fadi (`police-geometrique.ts`, P-7 : aucune police tierce). Texte plein =
 * faces ; extrusion > 0 = solide (dessous, dessus, flancs) ; « plein » décoché avec extrusion = flancs seuls.
 */
import { type FacesPolygonales, creerGroupeDepuisFaces } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { geometrieDuTexte } from "../police-geometrique.js";
import { type Vec3, add, v3 } from "../vecteur.js";
import { contexteSaisie, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, vueModif } from "./commun-modif.js";
import type { MachineOutil, Transition, VueOutil } from "./machine.js";

export const ID_TEXTE_3D = "texte-3d";
export const HAUTEUR_TEXTE_3D = 0.3;
export const EXTRUSION_TEXTE_3D = 0.15;

export interface ParametresTexte3D {
  readonly texte: string;
  readonly hauteur: number;
  readonly plein: boolean;
  readonly extrusion: number;
}

export interface EtatTexte3D extends ParametresTexte3D {
  /** Boîte de dialogue ouverte (avant OK). */
  readonly boite: boolean;
  readonly inference: Inference | null;
  readonly erreur: string | null;
}

const initial = (): EtatTexte3D => ({ boite: true, texte: "", hauteur: HAUTEUR_TEXTE_3D, plein: true, extrusion: EXTRUSION_TEXTE_3D, inference: null, erreur: null });

/** OK de la boîte : paramètres retenus, placement au curseur. Texte vide refusé (CA-T3D-1). */
export function configurerTexte3D(etat: EtatTexte3D, p: ParametresTexte3D): EtatTexte3D {
  if (p.texte.trim() === "") return { ...etat, erreur: "Le texte 3D est vide." };
  if (!(p.hauteur > 0)) return { ...etat, erreur: "La hauteur du texte doit être strictement positive." };
  if (p.extrusion < 0) return { ...etat, erreur: "L'extrusion ne peut pas être négative." };
  return { ...etat, ...p, boite: false, erreur: null };
}

/** Faces (monde) du texte posé en `origine` au sol : dessous, flancs, dessus. */
export function facesDuTexte3D(p: ParametresTexte3D, origine: Vec3): { faces: FacesPolygonales; ignores: readonly string[]; largeur: number } {
  const g = geometrieDuTexte(p.texte, p.hauteur);
  const T = (q: Vec3, z = 0): Vec3 => add(origine, v3(q.x, q.y, z));
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
  return { faces, ignores: g.ignores, largeur: g.largeur };
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
          const { faces, ignores } = facesDuTexte3D(etat, i.point);
          if (faces.length === 0) return { etat: { ...etat, inference: i, erreur: ignores.length ? `Aucun caractère connu dans « ${etat.texte} » (ignorés : ${ignores.join(" ")}).` : "Texte vide." } };
          const r = creerGroupeDepuisFaces(ctx.modele, faces, { nom: `Texte 3D « ${etat.texte.replace(/\s+/g, " ").trim()} »`, genre: "composant" });
          return {
            etat: { ...initial(), inference: i, erreur: ignores.length ? `Caractères ignorés (hors police géométrique) : ${ignores.join(" ")}.` : null },
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
        return { etat: initial(), outilPrecedent: etat.boite };
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par le Texte 3D." } };
      case "touche":
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const consigne = etat.boite ? "Créez le texte 3D (boîte de dialogue)." : consigneDe(ID_TEXTE_3D, 1);
    const lignes: Vec3[][] = [];
    const faces: Vec3[][] = [];
    if (!etat.boite && etat.inference && etat.texte.trim() !== "") {
      const { faces: fs } = facesDuTexte3D({ ...etat, extrusion: 0 }, etat.inference.point);
      for (const f of fs) {
        for (const b of f) lignes.push([...b, b[0] as Vec3]);
        if (etat.plein && f[0]) faces.push(f[0] as Vec3[]);
      }
    }
    return vueModif({ consigne, mesures: mesures(null, "", contexteSaisie("aucune", ctx)), inference: etat.boite ? null : etat.inference, apercu: { lignes, faces }, ctx, erreur: etat.erreur });
  },
};
