/**
 * Visualisation de la vue 3D (lot E.5) : des réglages de la vue aux commandes `studio.scene.*` / `studio.apparence.*`,
 * libellés, finitions d'affichage et types de rendu. Le repère de rendu three.js de Studio **est** le repère `local-3d`
 * (z vers le haut, mètres) : la conversion caméra ↔ scène enregistrée est l'identité, écrite explicitement
 * (`versLocal3d`), jamais un mélange avec le `local-2d` du dessin. Pur : ni React, ni DOM, ni three.js.
 */
import {
  STUDIO_DEFAULT_LAYER_ID, studioApparences, studioScenes,
  type StudioApparence, type StudioCameraScene, type StudioCommand, type StudioDocument, type StudioFinitionAffichage, type StudioModeAffichage, type StudioScene,
} from "@parcours/atelier-model";
import { NOM_CALQUE_DEFAUT } from "../../planche2d/calques";

/** Outils du registre qui agissent dans la vue 3D (ils l'ouvrent). */
export const OUTILS_VISUALISATION: ReadonlySet<string> = new Set([
  "studio.scene.creer", "studio.scene.modifier", "studio.scene.rappeler", "studio.scene.supprimer", "studio.apparence.definir", "studio.apparence.retirer",
]);
/** Demande transmise par la barre (outil ou commande « Exporter le rendu PNG ») ; `n` change à chaque demande. */
export interface DemandeVue3d { action: string; n: number }

export const LIBELLES_MODE: Readonly<Record<StudioModeAffichage, string>> = Object.freeze({
  shaded: "Ombré", "shaded-edges": "Ombré avec arêtes", wireframe: "Filaire",
});
export const LIBELLES_FINITION: Readonly<Record<StudioFinitionAffichage, string>> = Object.freeze({
  matte: "Mate", satin: "Satinée", gloss: "Brillante", glass: "Verre",
});
/** Mode de la vue sans scène rappelée : celui d'avant le lot (surfaces et arêtes). */
export const MODE_INITIAL: StudioModeAffichage = "shaded-edges";

/** Types de rendu : seul le rendu du modèle existe ; les deux autres sont annoncés indisponibles, sans bouton. */
export const TYPES_RENDU = Object.freeze([
  { id: "rendu-modele", libelle: "Rendu du modèle", disponible: true, description: "Image de la vue 3D tirée de la géométrie du document, avec sa provenance (étude, variante, révision, scène, date)." },
  { id: "illustration-ia", libelle: "Illustration IA contrainte", disponible: false, description: "Non disponible : aucune illustration n’est produite, et rien ne modifie le modèle automatiquement." },
  { id: "exploration-libre", libelle: "Exploration libre", disponible: false, description: "Non disponible : aucune image n’est inventée hors du modèle." },
] as const);

export interface Vec3 { x: number; y: number; z: number }

/** Repère de rendu → `local-3d` : identité déclarée (z vers le haut, mètres), arrondie au dixième de millimètre. */
export function versLocal3d(v: Vec3): Vec3 {
  const r = (x: number) => { const y = Math.round(x * 1e4) / 1e4; return Object.is(y, -0) ? 0 : y; };
  return { x: r(v.x), y: r(v.y), z: r(v.z) };
}

/** Caméra relevée de la vue (perspective : champ de vision vertical en degrés ; plan : hauteur vue en mètres). */
export function cameraScene(projection: "perspective" | "orthographic", position: Vec3, cible: Vec3, valeur: number): StudioCameraScene {
  const p = versLocal3d(position), t = versLocal3d(cible);
  const v = Math.round(valeur * 1e4) / 1e4;
  return projection === "perspective" ? { projection, position: p, target: t, fov: v } : { projection, position: p, target: t, height: v };
}

/** Vecteur « haut » d'une caméra : z, sauf pour une visée verticale (alors y, comme la vue en plan). */
export function hautCamera(position: Vec3, cible: Vec3): Vec3 {
  const d = { x: cible.x - position.x, y: cible.y - position.y, z: cible.z - position.z };
  const n = Math.hypot(d.x, d.y, d.z) || 1;
  return Math.abs(d.z / n) > 0.999 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
}

/** Calques du document (le calque implicite compris), avec leur visibilité enregistrée. */
export function calquesVisualisation(doc: StudioDocument): { id: string; nom: string; visible: boolean; implicite: boolean }[] {
  const layers = doc.layers ?? [];
  const tous = layers.some((l) => l.id === STUDIO_DEFAULT_LAYER_ID) ? [] : [{ id: STUDIO_DEFAULT_LAYER_ID, nom: NOM_CALQUE_DEFAUT, visible: true, implicite: true }];
  return [...tous, ...layers.map((l) => ({ id: l.id, nom: l.name, visible: l.visible, implicite: false }))];
}

/** Nom proposé d'une nouvelle scène (« Scène N »), modifiable avant l'enregistrement. */
export function prochainNomScene(doc: StudioDocument): string {
  const noms = new Set(studioScenes(doc).map((s) => s.name));
  let n = studioScenes(doc).length + 1;
  while (noms.has(`Scène ${n}`)) n++;
  return `Scène ${n}`;
}

export type ResultatVisualisation = { commandes: StudioCommand[] } | { erreur: string };

export interface ReglagesScene { nom: string; calques: readonly string[]; mode: StudioModeAffichage }

function scene(id: string, r: ReglagesScene, camera: StudioCameraScene): StudioScene | { erreur: string } {
  const nom = r.nom.trim();
  if (!nom) return { erreur: "Saisissez le nom de la scène." };
  return { id, type: "scene", frame: "local-3d", name: nom, camera, visibleLayers: [...new Set(r.calques)], displayMode: r.mode };
}

export function commandeNouvelleScene(id: string, r: ReglagesScene, camera: StudioCameraScene): ResultatVisualisation {
  const s = scene(id, r, camera);
  return "erreur" in s ? s : { commandes: [{ toolId: "studio.scene.creer", params: s }] };
}
export function commandeMiseAJourScene(doc: StudioDocument, id: string | null, r: ReglagesScene, camera: StudioCameraScene): ResultatVisualisation {
  if (!id || !studioScenes(doc).some((s) => s.id === id)) return { erreur: "Choisissez d’abord la scène à mettre à jour." };
  const s = scene(id, r, camera);
  return "erreur" in s ? s : { commandes: [{ toolId: "studio.scene.modifier", params: s }] };
}
export function commandeSuppressionScene(doc: StudioDocument, id: string | null): ResultatVisualisation {
  if (!id || !studioScenes(doc).some((s) => s.id === id)) return { erreur: "Choisissez d’abord la scène à supprimer." };
  return { commandes: [{ toolId: "studio.scene.supprimer", params: { ids: [id] } }] };
}

/** Cible d'apparence codée pour un champ de choix : `layer:<id>` ou `object:<id>`. */
export const cibleCodee = (a: Pick<StudioApparence, "target">): string => `${a.target.kind}:${a.target.id}`;
export function cibleDecodee(code: string): StudioApparence["target"] | null {
  const i = code.indexOf(":");
  const kind = code.slice(0, i), id = code.slice(i + 1);
  return i > 0 && id && (kind === "layer" || kind === "object") ? { kind, id } : null;
}
export const apparenceDe = (doc: StudioDocument, code: string): StudioApparence | null => studioApparences(doc).find((a) => cibleCodee(a) === code) ?? null;

/** Définir l'apparence d'affichage d'une cible : remplace la sienne (même identifiant), sinon en crée une. */
export function commandeApparence(doc: StudioDocument, code: string, couleur: string, finition: StudioFinitionAffichage | "", nouvelId: () => string): ResultatVisualisation {
  const target = cibleDecodee(code);
  if (!target) return { erreur: "Choisissez d’abord le calque ou l’objet à habiller." };
  const color = couleur.toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) return { erreur: "Choisissez une couleur d’affichage." };
  const id = apparenceDe(doc, code)?.id ?? nouvelId();
  return { commandes: [{ toolId: "studio.apparence.definir", params: { id, type: "appearance", target, color, ...(finition ? { finish: finition } : {}) } }] };
}
export function commandeRetraitApparence(doc: StudioDocument, code: string): ResultatVisualisation {
  const a = apparenceDe(doc, code);
  if (!a) return { erreur: "Cette cible n’a pas d’apparence d’affichage à retirer." };
  return { commandes: [{ toolId: "studio.apparence.retirer", params: { ids: [a.id] } }] };
}

/** Réglages du matériau d'affichage d'une finition (aucune : ceux d'avant le lot). */
export function parametresMateriau(finition: StudioFinitionAffichage | undefined): { roughness: number; metalness: number; opacity: number; transparent: boolean } {
  switch (finition) {
    case "matte": return { roughness: 0.95, metalness: 0, opacity: 1, transparent: false };
    case "satin": return { roughness: 0.55, metalness: 0, opacity: 1, transparent: false };
    case "gloss": return { roughness: 0.2, metalness: 0.1, opacity: 1, transparent: false };
    case "glass": return { roughness: 0.1, metalness: 0, opacity: 0.35, transparent: true };
    default: return { roughness: 0.85, metalness: 0, opacity: 1, transparent: false };
  }
}

/** `#rrggbb` → entier 0xrrggbb. */
export const couleurEntiere = (c: string): number => Number.parseInt(c.slice(1), 16);
