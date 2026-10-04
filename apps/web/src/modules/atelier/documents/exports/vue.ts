/**
 * Vue exportée (DA-14-01, D-019) : ce qu'exportent SVG, PNG, DXF et l'impression. Construite **uniquement** depuis
 * `registres.dessinateurs.dessinerNiveau(etat, niveau, calquesMasques)` — les mêmes dessins que la zone de travail —,
 * jamais depuis des coordonnées écran ni le DOM du plan. Sélection, aperçus, poignées et accrochages en sont donc
 * exclus par construction. Module pur.
 */
import type { EtatModele, IdObjet } from "@parcours/atelier-model";
import type { DessinPlan, FormeDessin, RegistreDessinateurs } from "../../socle";
import { pointsDeForme } from "../../plan2d/dessinateurs";
import { emprise as empriseDe, type Rectangle, type Vec } from "../../plan2d/geometrie";
import { contourTexte } from "../annotations";
import { lisible, nomSur } from "../format";
import type { ErreurLisible } from "../../socle";

export interface CalqueExport {
  readonly id: IdObjet | null;
  readonly nom: string;
  /** `#rrggbb` du calque, ou `null` (couleur par défaut). */
  readonly couleur: string | null;
}

export interface MetaExport {
  readonly projetId: string;
  readonly niveauId: IdObjet;
  readonly niveauNom: string;
  readonly revision: number;
  readonly empreinte: string;
  readonly date: Date;
}

export interface VueExport {
  readonly meta: MetaExport;
  readonly dessins: readonly DessinPlan[];
  /** Calque de chaque objet dessiné (`"0"` pour un objet sans calque). */
  readonly calques: ReadonlyMap<IdObjet, CalqueExport>;
  /** Emprise en m (repère local), toutes formes comprises. */
  readonly emprise: Rectangle;
}

export const CALQUE_SANS: CalqueExport = { id: null, nom: "0", couleur: null };

/** Points caractéristiques d'une forme pour l'emprise (cercles par leur boîte, textes par leur contour approché). */
export function pointsEmprise(f: FormeDessin): Vec[] {
  switch (f.forme) {
    case "cercle":
      return [
        { x: f.centre.x - f.rayon, y: f.centre.y - f.rayon },
        { x: f.centre.x + f.rayon, y: f.centre.y + f.rayon },
      ];
    case "texte":
      return contourTexte(f.position, f.texte, f.hauteur);
    default:
      return pointsDeForme(f).points;
  }
}

export interface DemandeVue {
  readonly dessinateurs: Pick<RegistreDessinateurs, "dessinerNiveau">;
  readonly etat: EtatModele;
  readonly niveauId: IdObjet;
  readonly calquesMasques: readonly IdObjet[];
  readonly date: Date;
}

/** Vue du niveau ; refus lisible si rien n'est à exporter (niveau vide ou tous calques masqués). */
export function preparerVue(d: DemandeVue): { ok: true; vue: VueExport } | { ok: false; erreur: ErreurLisible } {
  const dessins = d.dessinateurs.dessinerNiveau(d.etat, d.niveauId, d.calquesMasques);
  const e = empriseDe(dessins.flatMap((x) => x.formes.flatMap(pointsEmprise)));
  if (dessins.length === 0 || !e) return { ok: false, erreur: lisible("Export", "rien à exporter sur ce niveau (aucun objet visible)", "afficher un calque ou choisir un autre niveau") };
  const calques = new Map<IdObjet, CalqueExport>();
  for (const x of dessins) {
    const c = d.etat.objets[x.objetId]?.calqueId;
    const k = c ? d.etat.objets[c] : undefined;
    calques.set(x.objetId, k?.classe === "calque" ? { id: k.id, nom: k.params.nom, couleur: k.params.couleur } : CALQUE_SANS);
  }
  const n = d.etat.objets[d.niveauId];
  const meta: MetaExport = { projetId: d.etat.projetId, niveauId: d.niveauId, niveauNom: n?.classe === "niveau" ? n.params.nom : d.niveauId, revision: d.etat.revision, empreinte: d.etat.empreinte, date: d.date };
  return { ok: true, vue: { meta, dessins, calques, emprise: e } };
}

/** Nom de fichier d'un export : `<projet>_<niveau>_plan_r<révision>.<ext>`. */
export const nomExport = (m: MetaExport, ext: string): string => `${nomSur(m.projetId)}_${nomSur(m.niveauNom)}_plan_r${m.revision}.${ext}`;
