/**
 * Alternatives au clavier et par saisie numérique de chaque geste de Studio (TR-EX-036, ADR-STUDIO-PILOTE-01 P-12 ;
 * EX-036 : « les gestes impossibles au seul clavier possèdent un chemin alternatif adapté au contexte »). C'est la
 * spécification UX des chemins alternatifs, contrôlée automatiquement (`alternatives-gestes.test.ts`) :
 *  - chaque outil du manifeste (`STUDIO_MANIFESTE_OUTILS`) a exactement une déclaration ;
 *  - un **geste au pointeur** (`saisie-numerique`, `clavier`) déclare le panneau qui le remplace, et le test exécute ce
 *    chemin sans aucun événement de pointeur (fonctions pures du formulaire ou du panneau) : il doit produire la
 *    commande de l'outil ;
 *  - une **commande** (`commande`) n'est pas un geste : bouton nommé ou raccourci, atteint au clavier ;
 *  - chaque geste de vue (zoom, panoramique, orbite, rectangle de sélection, glisser) a une commande de l'éditeur au
 *    clavier (`COMMANDES_EDITEUR`) ou un panneau.
 * Pur : aucune dépendance (ni React, ni DOM, ni moteur 3D) ; l'interface n'en charge rien.
 */

export type TypeAlternative = "saisie-numerique" | "clavier" | "commande";
/** Panneaux et chemins clavier de l'espace de travail. */
export type MoyenAlternatif =
  | "formulaire-valeurs" // « Valeurs en mètres » de la planche 2D (outils/formulaire.ts)
  | "champ-mesures" // saisie directe longueur / angle pendant le tracé (accrochage/mesures.ts)
  | "liste-elements" // liste des éléments au clavier (flèches, Maj, Ctrl+A)
  | "panneau-architecture" // axe, hôte et position saisis (architecture/PanneauArchitecture.tsx)
  | "panneau-volume-3d" // solides libres, faces, pivot saisis (vue3d/volume-libre.ts)
  | "panneau-extrusion" // extrusion saisie (vue3d/extrusion.ts)
  | "bouton-raccourci"; // bouton nommé de la barre et raccourci de l'outil

export interface AlternativeGeste {
  readonly type: TypeAlternative;
  readonly moyens: readonly MoyenAlternatif[];
}

const saisie = (...moyens: MoyenAlternatif[]): AlternativeGeste => Object.freeze({ type: "saisie-numerique", moyens: Object.freeze(moyens) });
const commande: AlternativeGeste = Object.freeze({ type: "commande", moyens: Object.freeze(["bouton-raccourci"] as const) });

/** Une déclaration par outil du registre (contrôlé par test contre le manifeste). */
export const ALTERNATIVES_GESTES: Readonly<Record<string, AlternativeGeste>> = Object.freeze({
  "studio.dessin.selection": Object.freeze({ type: "clavier", moyens: Object.freeze(["liste-elements"] as const) }),
  "studio.dessin.ligne": saisie("formulaire-valeurs", "champ-mesures"),
  "studio.dessin.rectangle": saisie("formulaire-valeurs"),
  "studio.dessin.cercle": saisie("formulaire-valeurs"),
  "studio.dessin.arc": saisie("formulaire-valeurs"),
  "studio.dessin.polyligne": saisie("formulaire-valeurs", "champ-mesures"),
  "studio.dessin.cote": saisie("formulaire-valeurs"),
  "studio.dessin.cote-angulaire": saisie("formulaire-valeurs"),
  "studio.dessin.texte": saisie("formulaire-valeurs"),
  "studio.dessin.deplacer": saisie("formulaire-valeurs"),
  "studio.dessin.modifier": saisie("formulaire-valeurs"),
  "studio.dessin.decaler": saisie("formulaire-valeurs"),
  "studio.dessin.supprimer": commande,
  "studio.dessin.copier": saisie("formulaire-valeurs"),
  "studio.dessin.rotation": saisie("formulaire-valeurs"),
  "studio.dessin.symetrie": saisie("formulaire-valeurs"),
  "studio.dessin.echelle": saisie("formulaire-valeurs"),
  "studio.calque.creer": commande,
  "studio.calque.modifier": commande,
  "studio.objet.calque": commande,
  "studio.objet.extruder": saisie("panneau-extrusion"),
  "studio.objet.aplatir": commande,
  "studio.solide.boite": saisie("panneau-volume-3d"),
  "studio.solide.prisme": saisie("panneau-volume-3d"),
  "studio.solide.deplacer": saisie("panneau-volume-3d"),
  "studio.solide.supprimer": commande,
  "studio.solide.face-decaler": saisie("panneau-volume-3d"),
  "studio.solide.face-diviser": saisie("panneau-volume-3d"),
  "studio.solide.pivoter": saisie("panneau-volume-3d"),
  "studio.solide.resoudre": commande,
  "studio.solide.booleen": commande,
  "studio.solide.cote-face": commande,
  // X.1-05 : grille de pôles et pôle modifié saisis au clavier (le clic sur un pôle n'est qu'un raccourci de la liste) ;
  // épaississement : commande du panneau (bouton nommé et raccourci), comme le booléen.
  "studio.surface.nurbs": saisie("panneau-volume-3d"),
  "studio.surface.modifier": saisie("panneau-volume-3d"),
  "studio.surface.epaissir": commande,
  "studio.architecture.mur": saisie("panneau-architecture"),
  "studio.architecture.ouverture": saisie("panneau-architecture"),
  "studio.architecture.echelle-acces": saisie("panneau-architecture"),
  "studio.architecture.modifier": saisie("panneau-architecture"),
  "studio.architecture.supprimer": commande,
  "studio.propriete.definir": commande,
  "studio.propriete.retirer": commande,
  "studio.scene.creer": commande,
  "studio.scene.modifier": commande,
  "studio.scene.rappeler": commande,
  "studio.scene.supprimer": commande,
  "studio.apparence.definir": commande,
  "studio.apparence.retirer": commande,
  "studio.nonnatif.conserver": commande,
  "studio.nonnatif.retirer": commande,
  // Lot REND : boîtes « Graphismes », « Système de projet » et « Déclarer la source » (valeurs saisies, raccourci propre).
  "studio.graphisme.creer": commande,
  "studio.graphisme.retirer": commande,
  "studio.repere.projet": commande,
  "studio.source.declarer": commande,
});

/** Gestes de vue et de sélection au pointeur (outils/gestes.ts) → commandes de l'éditeur au clavier (raccourcis.ts). */
export const ALTERNATIVES_GESTES_VUE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "zoom-molette": Object.freeze(["zoom-avant", "zoom-arriere"]),
  // Flèches sur la planche ayant le focus (vue-clavier.ts), et Cadrer pour revenir à l'emprise du dessin.
  "panoramique-planche": Object.freeze(["fleches-planche", "cadrer"]),
  "rectangle-selection": Object.freeze(["tout-selectionner"]),
  "glisser-selection": Object.freeze(["annuler-trace"]),
  "orbite-3d": Object.freeze(["navigation-3d", "cadrer"]),
  "bascule-planche": Object.freeze(["vue-3d"]),
});

/** Écarts : outils sans déclaration, déclarations hors registre. */
export function controlerAlternatives(outils: readonly string[], table: Readonly<Record<string, AlternativeGeste>> = ALTERNATIVES_GESTES): string[] {
  const out: string[] = [];
  for (const id of outils) if (!table[id]) out.push(`sans alternative : ${id}`);
  for (const id of Object.keys(table)) if (!outils.includes(id)) out.push(`hors registre : ${id}`);
  for (const [id, a] of Object.entries(table)) if (!a.moyens.length) out.push(`aucun moyen : ${id}`);
  return out;
}
