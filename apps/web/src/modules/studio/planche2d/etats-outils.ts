/**
 * Recherche par synonyme et par domaine, et état affiché de chaque outil du catalogue (EX-029, TR-EX-029).
 *
 * EX-029 : « Requête par nom, synonymes, famille, domaine, contexte et identifiant ; la recherche ne lance pas le moteur.
 * Pour chaque outil, l'interface expose : découvert, non disponible, incompatible, interdit, non installé hors ligne, en
 * chargement, prêt, erreur. »
 *
 * - Synonymes (`SYNONYMES`) : termes usuels du métier pour chaque capacité (français source, comme les libellés) ;
 *   domaine (`DOMAINES_PAR_BARRE`) : domaine de travail de la barre (dessin 2D, annotation, 3D…). La famille est la barre.
 * - État (`etatOutilCatalogue`) : calculé à partir de ce qui est déjà connu, **sans rien charger** — le droit réel et la
 *   disponibilité (raison de `variante/droits.ts`), le contexte courant comparé aux contextes du manifeste, et l'état des
 *   moteurs du gestionnaire des ressources (`EtatMoteur` : phase, cache hors connexion). Priorité : interdit,
 *   incompatible, non disponible, erreur, non installé hors ligne, en chargement, prêt, découvert.
 *
 * Pur : ni React, ni DOM ; aucune importation du gestionnaire (seulement ses types et la table des moteurs).
 */
import type { StudioContexteOutil } from "@parcours/atelier-model";
import type { EtatMoteur } from "../chargement/gestionnaire-ressources";
import { moteursDeOutil, type IdMoteur } from "../chargement/moteurs";
import type { RaisonIndisponible } from "../variante/droits";
import type { EntreeCatalogue } from "./catalogue";

/** Synonymes (français source) par capacité ; une capacité absente n'a que son nom. */
export const SYNONYMES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "studio.dessin.selection": ["choisir", "pointer", "désigner"],
  "studio.bloc.definir": ["créer un bloc", "symbole réutilisable", "redéfinir"],
  "studio.bloc.inserer": ["placer un bloc", "occurrence"],
  "studio.bloc.eclater": ["décomposer", "exploser"],
  "studio.contrainte.poser": ["parallèle", "perpendiculaire", "tangente", "coïncidence", "horizontale", "verticale", "égalité", "distance fixée", "résoudre"],
  "studio.dessin.ligne": ["segment", "trait", "droite"],
  "studio.dessin.rectangle": ["cadre", "carré"],
  "studio.dessin.cercle": ["rond", "disque"],
  "studio.dessin.arc": ["courbe", "portion de cercle"],
  "studio.dessin.polyligne": ["polygone", "contour", "ligne brisée"],
  "studio.dessin.cote": ["dimension", "mesure", "cotation"],
  "studio.dessin.cote-angulaire": ["angle", "mesure d’angle"],
  "studio.dessin.texte": ["étiquette", "annotation", "inscription"],
  "studio.dessin.deplacer": ["translater", "bouger", "glisser"],
  "studio.dessin.modifier": ["éditer", "ajuster"],
  "studio.dessin.decaler": ["offset", "équidistance", "parallèle"],
  "studio.dessin.supprimer": ["effacer", "gommer", "retirer"],
  "studio.dessin.copier": ["dupliquer", "cloner"],
  "studio.dessin.rotation": ["tourner", "pivoter"],
  "studio.dessin.symetrie": ["miroir", "retourner"],
  "studio.dessin.echelle": ["agrandir", "réduire", "redimensionner", "mise à l’échelle"],
  "studio.calque.creer": ["couche", "nouveau calque"],
  "studio.calque.modifier": ["couche", "renommer le calque", "verrouiller"],
  "studio.objet.calque": ["couche", "changer de calque"],
  "studio.objet.extruder": ["épaissir", "hauteur", "monter en volume"],
  "studio.objet.aplatir": ["remettre à plat", "retirer la hauteur"],
  "studio.solide.boite": ["cube", "pavé", "parallélépipède"],
  "studio.solide.prisme": ["profil extrudé", "prisme droit"],
  "studio.solide.deplacer": ["translater le solide", "bouger"],
  "studio.solide.supprimer": ["effacer le solide"],
  "studio.solide.face-decaler": ["pousser", "tirer", "pousser-tirer"],
  "studio.solide.face-diviser": ["couper la face", "scinder"],
  "studio.solide.pivoter": ["tourner le solide", "rotation 3D"],
  "studio.solide.resoudre": ["recalculer", "lien au profil"],
  "studio.solide.booleen": ["union", "soustraction", "intersection", "noyau exact"],
  "studio.solide.cote-face": ["cote 3D", "distance entre faces", "épaisseur", "hauteur du solide"],
  "studio.surface.nurbs": ["surface libre", "B-spline", "nappe", "points de contrôle"],
  "studio.surface.modifier": ["pôle", "point de contrôle", "poids", "cintrer"],
  "studio.surface.epaissir": ["coque mince", "solide exact", "noyau exact"],
  "studio.subdivision.creer": ["Loop", "maillage de contrôle", "surface lissée"],
  "studio.subdivision.solidifier": ["polyèdre", "maillage fermé", "solide exact"],
  "studio.architecture.mur": ["cloison", "paroi", "voile"],
  "studio.architecture.ouverture": ["porte", "fenêtre", "baie"],
  "studio.architecture.echelle-acces": ["échelle fixe", "accès", "échelons", "montants"],
  "studio.architecture.modifier": ["éditer le mur", "épaisseur"],
  "studio.architecture.supprimer": ["effacer le mur"],
  // Lot W3-B : niveaux, composants 3D, éléments structurels.
  "studio.niveau.definir": ["étage", "plancher", "altitude", "storey"],
  "studio.composant.definir": ["bloc 3D", "définition", "élément répété", "famille"],
  "studio.composant.placer": ["instance", "occurrence", "insérer un composant", "rendre unique"],
  "studio.structure.element": ["poteau", "poutre", "dalle", "ossature"],
  "studio.propriete.definir": ["attribut", "paramètre", "caractéristique"],
  "studio.propriete.retirer": ["effacer l’attribut"],
  "studio.scene.creer": ["point de vue", "caméra", "vue enregistrée"],
  "studio.scene.modifier": ["point de vue", "caméra"],
  "studio.scene.rappeler": ["revenir au point de vue", "caméra"],
  "studio.scene.supprimer": ["effacer le point de vue"],
  "studio.apparence.definir": ["matériau", "couleur", "teinte"],
  "studio.apparence.retirer": ["matériau", "couleur par défaut"],
  "studio.nonnatif.conserver": ["élément importé", "objet étranger"],
  "studio.nonnatif.retirer": ["élément importé", "effacer"],
  annuler: ["défaire", "revenir"], retablir: ["refaire"], enregistrer: ["sauvegarder", "sauver"],
  "zoom-avant": ["agrandir la vue"], "zoom-arriere": ["réduire la vue"], cadrer: ["tout voir", "recentrer"],
  "vue-3d": ["volume", "perspective"], "coupe-3d": ["section", "plan de coupe"],
  "importer-dxf": ["ouvrir un dxf", "autocad"], "importer-ifc": ["ouvrir un ifc", "maquette bim"],
  "exporter-svg": ["image vectorielle"], "exporter-dxf": ["autocad"], "exporter-ifc": ["maquette bim"], "exporter-obj": ["maillage", "wavefront"], "exporter-stl": ["impression 3d", "facettes"], "exporter-step": ["iso 10303", "solides exacts"], "exporter-png": ["image", "capture"],
  approuver: ["approbation", "valider la publication", "viser"],
  feuille: ["mise en page", "planche imprimée", "pdf"], palette: ["recherche de commande"], outils: ["catalogue"],
});

/** Domaines de travail par barre (français source). */
export const DOMAINES_PAR_BARRE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  dessin: ["dessin 2D", "annotation"], modification: ["dessin 2D", "transformation"], calques: ["organisation"],
  volume: ["3D", "volume"], "volume-libre": ["3D", "volume", "modélisation"], architecture: ["architecture", "bâtiment"], batiment: ["architecture", "bâtiment", "structure"],
  proprietes: ["données", "BIM"], exigences: ["données", "contrôle"], "non-natifs": ["échanges", "import"],
  blocs: ["dessin 2D", "bibliothèque"], contraintes: ["dessin 2D", "précision"],
  edition: ["édition"], vue: ["affichage", "navigation"], accrochage: ["dessin 2D", "précision"], reperage: ["dessin 2D", "précision"],
  visualisation: ["3D", "présentation"], import: ["échanges", "import"], export: ["échanges", "export"], presentation: ["présentation", "impression"],
  catalogue: ["outils"],
});

/** Termes de recherche d'une entrée en plus de son nom : synonymes, famille (barre), domaines. */
export function termesSupplementaires(e: Pick<EntreeCatalogue, "identifiant" | "barre">, libelleBarre: string): { synonymes: readonly string[]; famille: string; domaines: readonly string[] } {
  return { synonymes: SYNONYMES[e.identifiant] ?? [], famille: libelleBarre, domaines: DOMAINES_PAR_BARRE[e.barre] ?? [] };
}

export type EtatOutilCatalogue = "decouvert" | "non-disponible" | "incompatible" | "interdit" | "non-installe-hors-ligne" | "en-chargement" | "pret" | "erreur";

/** Libellés des huit états (français source, traduits dans en.json). */
export const LIBELLES_ETAT_OUTIL: Readonly<Record<EtatOutilCatalogue, string>> = Object.freeze({
  decouvert: "Découvert (non chargé)",
  "non-disponible": "Non disponible ici",
  incompatible: "Incompatible avec ce contexte",
  interdit: "Interdit pour votre compte",
  "non-installe-hors-ligne": "Non installé hors ligne",
  "en-chargement": "En chargement",
  pret: "Prêt",
  erreur: "Erreur de chargement",
});

export interface SourcesEtatOutil {
  /** Raison d'indisponibilité (droit réel, révision, enregistrement, contexte), ou null. */
  readonly raison: RaisonIndisponible | null;
  /** Contexte courant de l'espace de travail ; absent : non comparé. */
  readonly contexte?: StudioContexteOutil;
  /** État des moteurs (gestionnaire des ressources, instantané). */
  readonly moteurs: readonly EtatMoteur[];
  /** Réseau joignable. */
  readonly enLigne: boolean;
}

/** Un moteur passif (`calcul`) s'initialise de lui-même au premier calcul : il est prêt tant qu'il n'est pas en échec. */
const PASSIFS: ReadonlySet<IdMoteur> = new Set<IdMoteur>(["calcul"]);

/** État affiché d'une entrée du catalogue ; ne charge rien, ne lance aucun moteur. */
export function etatOutilCatalogue(e: Pick<EntreeCatalogue, "identifiant" | "barre" | "contextes" | "outil">, s: SourcesEtatOutil): EtatOutilCatalogue {
  if (s.raison !== null && (s.raison === "historique" || s.raison.startsWith("droit"))) return "interdit";
  if (s.contexte !== undefined && !e.contextes.includes(s.contexte)) return "incompatible";
  // Outil dont la barre n'a aucun moteur connu de cette version : il ne peut pas s'exécuter ici.
  const resolus = e.outil ? moteursDeOutil(e.identifiant, e.barre) : [];
  if (resolus === null) return "incompatible";
  if (s.raison !== null) return "non-disponible";
  const ids = resolus;
  const etats = ids.map((id) => s.moteurs.find((m) => m.id === id)).filter((m): m is EtatMoteur => m !== undefined);
  if (etats.some((m) => m.phase === "echec" && m.erreur !== "hors-ligne")) return "erreur";
  const pret = (m: EtatMoteur) => m.phase === "initialise" || (PASSIFS.has(m.id) && m.phase !== "echec");
  if (!s.enLigne && etats.some((m) => !pret(m) && m.horsConnexion !== true)) return "non-installe-hors-ligne";
  if (etats.some((m) => m.phase === "echec")) return "erreur";
  if (etats.some((m) => m.phase === "chargement")) return "en-chargement";
  return etats.every(pret) ? "pret" : "decouvert";
}
