/**
 * Volume libre de la vue 3D (A.3-02) : des valeurs saisies aux commandes `studio.solide.*`. Aucune dimension par défaut :
 * un champ vide (NaN) bloque la commande ; l'origine vient du clic sur la grille (repère `local-3d`, z = 0) ou de la
 * saisie, la rotation est saisie en degrés (0 = axes du plan). Le modèle reste seul juge (bornes, profil simple, calque
 * verrouillé). Pur : ni React ni DOM.
 *
 * Lot F1 : le prisme sur profil demande sa relation à la polyligne (associé, référence liée, copie indépendante) et sa
 * direction d'extrusion (+Z, −Z ou vecteur saisi), sans choix proposé ; édition des faces (pousser / tirer, diviser),
 * pivot et résolution du lien d'un solide sélectionné.
 */
import {
  studioProfilDepuisPolyligne, type StudioCommand, type StudioDocument, type StudioLienSolide, type StudioPolyline, type StudioRelationSource, type StudioSolid,
} from "@parcours/atelier-model";

export interface ValeursBoite { x: number; y: number; z: number; rotation: number; largeur: number; profondeur: number; hauteur: number }
export const BOITE_VIDE: ValeursBoite = Object.freeze({ x: Number.NaN, y: Number.NaN, z: Number.NaN, rotation: 0, largeur: Number.NaN, profondeur: Number.NaN, hauteur: Number.NaN });

/** Direction du prisme : normale vers le haut, vers le bas, ou vecteur saisi (dx, dy, dz) ; vide tant que rien n'est choisi. */
export type DirectionPrisme = "" | "+z" | "-z" | "vecteur";
export interface ValeursPrisme {
  profil: string; cote: number; hauteur: number; rotation: number;
  relation: "" | StudioRelationSource;
  direction: DirectionPrisme; dx: number; dy: number; dz: number;
}
export const PRISME_VIDE: ValeursPrisme = Object.freeze({ profil: "", cote: Number.NaN, hauteur: Number.NaN, rotation: 0, relation: "" as const, direction: "" as const, dx: Number.NaN, dy: Number.NaN, dz: Number.NaN });

export interface ValeursDeplacement { dx: number; dy: number; dz: number }
export const DEPLACEMENT_VIDE: ValeursDeplacement = Object.freeze({ dx: Number.NaN, dy: Number.NaN, dz: Number.NaN });

/** Face choisie (`base`, `sommet`, `lateral-i`) et distance saisie ; rien n'est choisi d'office. */
export interface ValeursFace { face: string; distance: number }
export const FACE_VIDE: ValeursFace = Object.freeze({ face: "", distance: Number.NaN });

export type ResultatVolume = { commandes: StudioCommand[] } | { erreur: string };

/** Degrés saisis → radians dans [0 ; 2π[ ; 0 reste exactement 0. */
export function radians(degres: number): number {
  const d = ((degres % 360) + 360) % 360;
  return d === 0 ? 0 : (d * Math.PI) / 180;
}

/** Point cliqué sur la grille, arrondi au centimètre (la saisie peut le corriger). */
export const auCentimetre = (v: number): number => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

const fini = (...v: number[]) => v.every(Number.isFinite);
const sansCalqueImplicite = (layerId: string | undefined) => (layerId === undefined || layerId === "default" ? {} : { layerId });

export function commandeBoite(v: ValeursBoite, id: string, layerId?: string): ResultatVolume {
  if (!fini(v.x, v.y, v.z)) return { erreur: "Cliquez sur la grille ou saisissez l’origine (x, y, z), en mètres." };
  if (!fini(v.largeur, v.profondeur, v.hauteur)) return { erreur: "Saisissez la largeur, la profondeur et la hauteur, en mètres." };
  if (v.largeur <= 0 || v.profondeur <= 0 || v.hauteur <= 0) return { erreur: "Les dimensions doivent être strictement positives." };
  if (!fini(v.rotation)) return { erreur: "Saisissez la rotation en degrés (0 : axes du plan)." };
  return { commandes: [{ toolId: "studio.solide.boite", params: { id, type: "box", ...sansCalqueImplicite(layerId), placement: { origin: { x: v.x, y: v.y, z: v.z }, rotation: radians(v.rotation) }, width: v.largeur, depth: v.profondeur, height: v.hauteur } }] };
}

/** Polylignes fermées du document : profils possibles d'un prisme. */
export const profilsFermes = (doc: StudioDocument): StudioPolyline[] => doc.objects.filter((o): o is StudioPolyline => o.type === "polyline" && o.closed);

/** Libellés des relations (choix explicite, aucune présélection). */
export const RELATIONS_PRISME: readonly { valeur: StudioRelationSource; libelle: string; aide: string }[] = Object.freeze([
  { valeur: "reference-liee", libelle: "Référence liée", aide: "Le prisme suit la polyligne : chaque modification le recalcule ; supprimée ou invalide, il passe « à résoudre »." },
  { valeur: "associe", libelle: "Associé", aide: "Le lien est contrôlé : une polyligne modifiée laisse le prisme « à résoudre » jusqu’à sa mise à jour ou son détachement." },
  { valeur: "copie-independante", libelle: "Copie indépendante", aide: "Le contour est copié : modifier la polyligne ne change pas le prisme." },
]);

/** Direction saisie → vecteur de la commande, ou message de refus. */
function vecteurDirection(v: ValeursPrisme): { x: number; y: number; z: number } | string {
  if (v.direction === "+z") return { x: 0, y: 0, z: 1 };
  if (v.direction === "-z") return { x: 0, y: 0, z: -1 };
  if (v.direction !== "vecteur") return "Choisissez la direction d’extrusion : +Z, −Z ou un vecteur saisi.";
  if (!fini(v.dx, v.dy, v.dz)) return "Saisissez les trois composantes de la direction (dx, dy, dz).";
  if (v.dx === 0 && v.dy === 0 && v.dz === 0) return "La direction ne peut pas être nulle.";
  if (v.dz === 0) return "La direction doit sortir du plan du profil (dz non nul) : sinon le volume serait nul.";
  return { x: v.dx, y: v.dy, z: v.dz };
}

/**
 * Prisme sur le profil d'une polyligne fermée : le contour (discrétisé pour les renflements) est repris, relatif à son
 * premier sommet, qui devient l'origine du solide, posée à la cote saisie (même calcul que le modèle :
 * `studioProfilDepuisPolyligne`). La relation et la direction sont saisies ; un prisme lié n'a pas de rotation propre.
 */
export function commandePrisme(doc: StudioDocument, v: ValeursPrisme, id: string, layerId?: string): ResultatVolume {
  const source = profilsFermes(doc).find((p) => p.id === v.profil);
  if (!source) return { erreur: "Choisissez une polyligne fermée comme profil." };
  if (!fini(v.cote, v.hauteur)) return { erreur: "Saisissez la cote de base et la hauteur, en mètres." };
  if (v.hauteur <= 0) return { erreur: "La hauteur doit être strictement positive." };
  if (!fini(v.rotation)) return { erreur: "Saisissez la rotation en degrés (0 : axes du plan)." };
  if (!v.relation) return { erreur: "Choisissez la relation au profil : référence liée, associé ou copie indépendante." };
  if (v.relation !== "copie-independante" && radians(v.rotation) !== 0) return { erreur: "Un prisme lié suit la polyligne en plan : sa rotation doit rester 0°." };
  const direction = vecteurDirection(v);
  if (typeof direction === "string") return { erreur: direction };
  const derive = studioProfilDepuisPolyligne(source);
  if (!derive) return { erreur: "Le contour de cette polyligne n’est pas un profil valide (contour simple attendu)." };
  return { commandes: [{ toolId: "studio.solide.prisme", params: {
    id, type: "prism", ...sansCalqueImplicite(layerId), placement: { origin: { x: derive.origin.x, y: derive.origin.y, z: v.cote }, rotation: radians(v.rotation) },
    profile: derive.profile, height: v.hauteur, direction, source: { objectId: source.id, relation: v.relation },
  } }] };
}

export function commandeDeplacementSolide(id: string | null, v: ValeursDeplacement): ResultatVolume {
  if (!id) return { erreur: "Sélectionnez d’abord, dans la vue 3D, le solide à déplacer." };
  if (!fini(v.dx, v.dy, v.dz)) return { erreur: "Saisissez le déplacement dx, dy, dz, en mètres." };
  return { commandes: [{ toolId: "studio.solide.deplacer", params: { id, dx: v.dx, dy: v.dy, dz: v.dz } }] };
}

/** Faces d'un solide, dans l'ordre du modèle (`base`, `sommet`, `lateral-i`), avec un libellé lisible. */
export function facesDe(s: StudioSolid): { valeur: string; libelle: string; laterale: boolean }[] {
  const cotes = s.type === "box" ? ["y−", "x+", "y+", "x−"] : null;
  const n = s.type === "box" ? 4 : s.profile.length;
  return [
    { valeur: "base", libelle: "Base (plan du profil)", laterale: false },
    { valeur: "sommet", libelle: "Sommet (face d’arrivée)", laterale: false },
    ...Array.from({ length: n }, (_, i) => ({ valeur: `lateral-${i}`, libelle: cotes ? `Face latérale ${cotes[i]}` : `Face latérale ${i + 1} (arête ${i + 1} → ${i + 1 === n ? 1 : i + 2})`, laterale: true })),
  ];
}

/** Pousser / tirer : face choisie, distance non nulle (positive vers l'extérieur). */
export function commandeFace(id: string | null, v: ValeursFace): ResultatVolume {
  if (!id) return { erreur: "Sélectionnez d’abord, dans la vue 3D, le solide à modifier." };
  if (!v.face) return { erreur: "Choisissez la face à pousser ou à tirer." };
  if (!fini(v.distance) || v.distance === 0) return { erreur: "Saisissez une distance non nulle, en mètres (positive : vers l’extérieur)." };
  return { commandes: [{ toolId: "studio.solide.face-decaler", params: { id, face: v.face as never, distance: v.distance } }] };
}

/** Diviser : face latérale choisie, distance au premier sommet de son arête, strictement positive. */
export function commandeDivision(id: string | null, v: ValeursFace): ResultatVolume {
  if (!id) return { erreur: "Sélectionnez d’abord, dans la vue 3D, le solide à modifier." };
  if (!/^lateral-\d+$/.test(v.face)) return { erreur: "Choisissez la face latérale à diviser." };
  if (!fini(v.distance) || v.distance <= 0) return { erreur: "Saisissez la distance du point de division depuis le début de l’arête, en mètres." };
  return { commandes: [{ toolId: "studio.solide.face-diviser", params: { id, face: v.face as `lateral-${number}`, distance: v.distance } }] };
}

/** Pivoter : angle saisi en degrés, non nul, signé (sens trigonométrique). */
export function commandePivot(id: string | null, degres: number): ResultatVolume {
  if (!id) return { erreur: "Sélectionnez d’abord, dans la vue 3D, le solide à modifier." };
  if (!fini(degres) || degres === 0) return { erreur: "Saisissez un angle non nul, en degrés." };
  return { commandes: [{ toolId: "studio.solide.pivoter", params: { id, angle: (degres * Math.PI) / 180 } }] };
}

export function commandeResolution(id: string | null, action: "mettre-a-jour" | "detacher"): ResultatVolume {
  if (!id) return { erreur: "Sélectionnez d’abord, dans la vue 3D, le solide à modifier." };
  return { commandes: [{ toolId: "studio.solide.resoudre", params: { id, action } }] };
}

const LIBELLES_RELATION: Record<StudioRelationSource, string> = { "reference-liee": "référence liée", associe: "associé", "copie-independante": "copie indépendante" };
const LIBELLES_MOTIF: Record<NonNullable<StudioLienSolide["motif"]>, string> = {
  "source-absente": "à résoudre : polyligne source supprimée",
  "source-invalide": "à résoudre : polyligne source invalide (ouverte ou croisée)",
  "source-modifiee": "à résoudre : polyligne source modifiée",
};

/** Relation et état du lien, en clair (désignation et inspecteur de la vue 3D). */
export function descriptionLien(l: StudioLienSolide): string {
  const etat = l.etat === "a-jour" ? "à jour" : l.etat === "independant" ? "aucune propagation" : LIBELLES_MOTIF[l.motif!];
  return `Lien : ${LIBELLES_RELATION[l.relation]} · ${etat}`;
}

/** Description courte d'un solide (panneau de la vue 3D). */
export function descriptionSolide(s: StudioSolid, nombre: (v: number) => string): string {
  if (s.type === "box") return `Boîte ${nombre(s.width)} × ${nombre(s.depth)} × ${nombre(s.height)} m`;
  const base = `Prisme sur profil de ${s.profile.length} sommets, hauteur ${nombre(s.height)} m`;
  const d = s.direction;
  if (!d || (d.x === 0 && d.y === 0 && d.z > 0)) return base;
  return d.x === 0 && d.y === 0 ? `${base}, vers le bas (−Z)` : `${base}, direction (${nombre(d.x)} ; ${nombre(d.y)} ; ${nombre(d.z)})`;
}
