import { avecBatiment, definirComposant, definirNiveau, placerOccurrence } from "../commandes/batiment.js";
import { avecArchitecture, creerEchelle, creerElementStructurel, creerMur, creerOuverture, deplacerAvecArchitecture, modifierArchitecture, supprimerArchitecture } from "../commandes/architecture.js";
import { creerCalque, modifierCalque, placerSurCalque } from "../commandes/calques.js";
import { CREATION_FORMES, creerCote, creerCoteAngulaire, creerTexte } from "../commandes/dessin.js";
import { decaler, deplacer, modifier, supprimer } from "../commandes/modification.js";
import { copier, echelle, rotation, symetrie } from "../commandes/modification.js";
import { aplatir, extruder } from "../commandes/volume.js";
import { creerBoite, creerPrisme, decalerFace, deplacerSolide, diviserFace, pivoterSolide, resoudreLien, suivreSourcesSolides, supprimerSolides } from "../commandes/volume-libre.js";
import { creerBooleen, idsReserves } from "../commandes/booleen.js";
import { creerCoteFace, suivreCotesFaces } from "../commandes/cotes-faces.js";
import { creerSubdivision, creerSurface, epaissirSurface, modifierSurface, solidifierSubdivision } from "../commandes/surfaces.js";
import { definirPropriete, elaguerProprietes, retirerPropriete, type StudioPropriete } from "../exigences/proprietes.js";
import { studioExtrudedRingVertices } from "../objets/polyligne.js";
import { creerScene, definirApparence, modifierScene, retirerApparences, retirerApparencesOrphelines, supprimerScenes } from "../commandes/scenes.js";
import { conserverNonNatif, retirerNonNatifs } from "../commandes/non-natifs.js";
import { creerGraphisme, declarerSource, definirSystemeProjet, retirerGraphismes } from "../commandes/graphismes.js";
import { avecBlocs, definirBloc, deplacerAvecBlocs, eclaterBloc, insererBloc } from "../commandes/blocs.js";
import { poserContraintes, suivreContraintes } from "../commandes/contraintes.js";
import { sortie, validateStudioDocument } from "./document.js";
import type { Etat, Gestionnaire } from "../commandes/etat.js";
import { STUDIO_LIMITS } from "../noyau/limites.js";
import { array, fail, record } from "../noyau/validation.js";
import type { StudioCommand, StudioCommandToolId, StudioDocument } from "./types.js";

/**
 * Aiguillage des commandes : un gestionnaire par identifiant d'outil de mutation, composé des familles (`commandes/`).
 * L'ordre des clés est celui de `STUDIO_APPLIED_TOOL_IDS` (contrôlé par test) ; une commande nouvelle s'ajoute à sa
 * famille, puis ici, et dans le registre (`registre/`).
 */
const creation = (toolId: StudioCommandToolId): Gestionnaire => CREATION_FORMES.get(toolId)!;

const HANDLERS: Record<StudioCommandToolId, Gestionnaire> = {
  "studio.dessin.ligne": creation("studio.dessin.ligne"),
  "studio.dessin.rectangle": creation("studio.dessin.rectangle"),
  "studio.dessin.cercle": creation("studio.dessin.cercle"),
  "studio.dessin.arc": creation("studio.dessin.arc"),
  "studio.dessin.polyligne": creation("studio.dessin.polyligne"),
  "studio.dessin.deplacer": deplacerAvecArchitecture(deplacerAvecBlocs(deplacer)),
  "studio.dessin.modifier": modifier,
  "studio.dessin.decaler": decaler,
  "studio.dessin.cote": creerCote,
  "studio.dessin.supprimer": avecBatiment(avecArchitecture(avecBlocs(supprimer, "supprimer"), "supprimer")),
  "studio.dessin.copier": avecArchitecture(avecBlocs(copier, "copier"), "copier"),
  "studio.dessin.rotation": avecArchitecture(avecBlocs(rotation, "rotation"), "rotation"),
  "studio.dessin.symetrie": avecArchitecture(avecBlocs(symetrie, "symetrie"), "symetrie"),
  "studio.dessin.echelle": avecArchitecture(avecBlocs(echelle, "echelle"), "echelle"),
  "studio.calque.creer": creerCalque,
  "studio.calque.modifier": modifierCalque,
  "studio.objet.calque": avecArchitecture(avecBlocs(placerSurCalque, "calque"), "calque"),
  "studio.objet.extruder": extruder,
  "studio.objet.aplatir": aplatir,
  "studio.solide.boite": creerBoite,
  "studio.solide.prisme": creerPrisme,
  "studio.solide.deplacer": deplacerSolide,
  "studio.solide.supprimer": supprimerSolides,
  "studio.solide.face-decaler": decalerFace,
  "studio.solide.face-diviser": diviserFace,
  "studio.solide.pivoter": pivoterSolide,
  "studio.solide.resoudre": resoudreLien,
  // Lot F2 : engagement d'un résultat du noyau exact (booléen), opérandes conservés.
  "studio.solide.booleen": creerBooleen,
  // Lot G2 (INV-013) : cote de face 3D, référencée à deux faces parallèles d'un solide libre.
  "studio.solide.cote-face": creerCoteFace,
  // X.1-05 : surfaces libres NURBS (pôles, degrés, poids), conversion explicite en solide exact par épaississement.
  "studio.surface.nurbs": creerSurface,
  "studio.surface.modifier": modifierSurface,
  "studio.surface.epaissir": epaissirSurface,
  // X.1-05 : surfaces de subdivision (Loop) ; leurs sommets de contrôle se modifient par `studio.surface.modifier`.
  "studio.subdivision.creer": creerSubdivision,
  "studio.subdivision.solidifier": solidifierSubdivision,
  "studio.dessin.cote-angulaire": creerCoteAngulaire,
  "studio.dessin.texte": creerTexte,
  // Architecture (A.4) : murs et ouvertures ; la part architecturale des commandes générales est branchée ci-dessus.
  "studio.architecture.mur": creerMur,
  "studio.architecture.ouverture": creerOuverture,
  // EX-027 (lot G2) : échelle d'accès, objet d'accès posé librement (montants et échelons saisis).
  "studio.architecture.echelle-acces": creerEchelle,
  "studio.architecture.modifier": modifierArchitecture,
  "studio.architecture.supprimer": supprimerArchitecture,
  // Propriétés BIM déclarées (E.1-01), rangées dans `StudioDocument.proprietes`.
  "studio.propriete.definir": definirPropriete,
  "studio.propriete.retirer": retirerPropriete,
  // Visualisation (lot E.5) : scènes et apparences d'affichage, dans la seule liste `scenes`.
  "studio.scene.creer": creerScene,
  "studio.scene.modifier": modifierScene,
  "studio.scene.supprimer": supprimerScenes,
  "studio.apparence.definir": definirApparence,
  "studio.apparence.retirer": retirerApparences,
  // Éléments non natifs (lot F3) : conservés à l’import, retirés explicitement ; aucune autre commande ne les touche.
  "studio.nonnatif.conserver": conserverNonNatif,
  "studio.nonnatif.retirer": retirerNonNatifs,
  // Graphismes (EX-055) : splines, hachures, symboles et transparence ; retirés explicitement.
  "studio.graphisme.creer": creerGraphisme,
  "studio.graphisme.retirer": retirerGraphismes,
  // Système de projet (EX-023) : une version nouvelle s'ajoute, aucune n'est réécrite.
  "studio.repere.projet": definirSystemeProjet,
  // Sources externes (EX-014) : provenance d'un fichier importé, déclarée avec l'import.
  "studio.source.declarer": declarerSource,
  // Lot W3-B (X.1-04) : niveaux comme objets, composants 3D (définition partagée + occurrences), éléments structurels typés.
  "studio.niveau.definir": definirNiveau,
  "studio.composant.definir": definirComposant,
  "studio.composant.placer": placerOccurrence,
  "studio.structure.element": creerElementStructurel,
  // Blocs définis par l'utilisateur (X.1-01) : définir / redéfinir, insérer / modifier la pose, éclater ; les commandes
  // générales à sélection agissent aussi sur les insertions (`avecBlocs`).
  "studio.bloc.definir": definirBloc,
  "studio.bloc.inserer": insererBloc,
  "studio.bloc.eclater": eclaterBloc,
  // Contraintes géométriques (X.1-01) : poser et résoudre, système résolu ou refusé (insatisfaisable, sur-contraint).
  "studio.contrainte.poser": poserContraintes,
};

/** Identifiants réellement acceptés par `applyStudioCommands` (contrôlés contre le registre par test). */
export const STUDIO_APPLIED_TOOL_IDS: readonly StudioCommandToolId[] = Object.freeze(Object.keys(HANDLERS) as StudioCommandToolId[]);

/** Apply to a private clone; a rejected lot never mutates document or caller inputs. */
export function applyStudioCommands(document: StudioDocument, commands: readonly StudioCommand[]): StudioDocument {
  const current = validateStudioDocument(document);
  // Charge avant le lot, relevée avant toute mutation (l'état partage les tableaux de `current`).
  const avant = studioExtrudedRingVertices(current.objects);
  const state: Etat & { proprietes?: StudioPropriete[] } = {
    proprietes: current.proprietes ?? [],
    id: current.id, objects: current.objects, layers: current.layers ?? [], dimensions: current.dimensions ?? [], solides: current.solides ?? [], exacts: current.exacts ?? [], surfaces: current.surfaces ?? [], subdivisions: current.subdivisions ?? [], cotesFaces: current.cotesFaces ?? [], annotations: current.annotations ?? [], architecture: current.architecture ?? [], scenes: current.scenes ?? [], nonNatifs: current.nonNatifs ?? [], graphismes: current.graphismes ?? [], sources: current.sources ?? [], blocs: current.blocs ?? [], insertions: current.insertions ?? [], contraintes: current.contraintes ?? [], niveaux: current.niveaux ?? [], composants: current.composants ?? [], occurrences: current.occurrences ?? [], ...(current.systemeProjet ? { systemeProjet: current.systemeProjet } : {}),
    ids: new Set([...current.objects.map((o) => o.id), ...(current.dimensions ?? []).map((d) => d.id), ...(current.solides ?? []).map((s) => s.id), ...(current.exacts ?? []).flatMap(idsReserves), ...(current.surfaces ?? []).map((s) => s.id), ...(current.subdivisions ?? []).map((s) => s.id), ...(current.annotations ?? []).map((a) => a.id), ...(current.architecture ?? []).map((a) => a.id), ...(current.nonNatifs ?? []).map((n) => n.id), ...(current.graphismes ?? []).map((g) => g.id), ...(current.cotesFaces ?? []).map((c) => c.id), ...(current.blocs ?? []).map((b) => b.id), ...(current.insertions ?? []).map((x) => x.id), ...(current.contraintes ?? []).map((c) => c.id), ...(current.niveaux ?? []).map((n) => n.id), ...(current.composants ?? []).map((c) => c.id), ...(current.occurrences ?? []).map((o) => o.id)]),
  };
  // Solides avant le lot (les solides sont remplacés, jamais modifiés en place) : le suivi des sources en dépend.
  const solidesAvant = new Map((current.solides ?? []).map((s) => [s.id, s]));
  const batch = array(commands, "commands");
  if (batch.length === 0) fail("commands", "au moins une commande attendue");
  for (let i = 0; i < batch.length; i++) {
    const path = `commands[${i}]`;
    const c = record(batch[i], ["toolId", "params"], path);
    const toolId = c.toolId;
    if (typeof toolId !== "string" || !Object.hasOwn(HANDLERS, toolId)) fail(`${path}.toolId`, "outil de mutation non pris en charge");
    // Cotes de faces 3D (INV-013) : suivies commande par commande (une cote créée ou rattachée dans le lot désigne les
    // faces du solide tel qu'il est à ce moment-là).
    const solidesAvantCommande = state.cotesFaces.length ? new Map(state.solides.map((s) => [s.id, s])) : null;
    HANDLERS[toolId as StudioCommandToolId](state, c.params, path);
    if (solidesAvantCommande) suivreCotesFaces(state, solidesAvantCommande, path);
  }
  // Prismes liés à une polyligne (lot F1) : recalculés, ou refus si une commande a changé seule leur emprise liée.
  const solidesAvantSources = state.cotesFaces.length ? new Map(state.solides.map((s) => [s.id, s])) : null;
  if (state.solides.length) suivreSourcesSolides(state, solidesAvant, "commands");
  // Cotes de faces 3D (INV-013) : un prisme lié recalculé depuis sa source (ci-dessus) est suivi de même.
  if (solidesAvantSources) suivreCotesFaces(state, solidesAvantSources, "commands");
  // L'apparence d'un objet supprimé disparaît avec lui (lot E.5).
  retirerApparencesOrphelines(state);
  // Contrôle final : limites, unicité et liens sur le document entier, avant de rendre la copie.
  // Les propriétés d'un objet disparu (supprimé, mur supprimé avec ses ouvertures) disparaissent avec lui.
  const presents = new Set([...state.objects.map((o) => o.id), ...state.architecture.map((a) => a.id)]);
  const proprietes = elaguerProprietes(state.proprietes ?? [], (id) => presents.has(id));
  // Contraintes (X.1-01) : celles que la géométrie ne satisfait plus passent « à résoudre », jamais recalculées en silence.
  suivreContraintes(state);
  const result = validateStudioDocument(sortie(state.id, state.objects, state.layers, state.dimensions, state.solides, state.annotations, state.architecture, proprietes, state.scenes, state.nonNatifs, state.exacts, state.graphismes, state.systemeProjet, state.sources, state.cotesFaces, state.blocs, state.insertions, state.contraintes, { niveaux: state.niveaux, composants: state.composants, occurrences: state.occurrences }, { surfaces: state.surfaces, subdivisions: state.subdivisions }));
  // Budget d'écriture des extrusions de polylignes fermées : un lot ne peut pas le dépasser ni l'aggraver une fois
  // dépassé ; une révision enregistrée reste toujours lisible (le budget ne s'applique qu'aux écritures).
  const apres = studioExtrudedRingVertices(result.objects);
  if (apres > STUDIO_LIMITS.extrudedRingsTotal && apres > avant) {
    fail("studioDocument.objects", `${STUDIO_LIMITS.extrudedRingsTotal} sommets discrétisés au plus pour l’ensemble des polylignes fermées extrudées du document`);
  }
  return result;
}
