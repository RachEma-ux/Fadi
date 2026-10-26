import { avecArchitecture, creerEchelle, creerMur, creerOuverture, deplacerAvecArchitecture, modifierArchitecture, supprimerArchitecture } from "../commandes/architecture.js";
import { creerCalque, modifierCalque, placerSurCalque } from "../commandes/calques.js";
import { CREATION_FORMES, creerCote, creerCoteAngulaire, creerTexte } from "../commandes/dessin.js";
import { decaler, deplacer, modifier, supprimer } from "../commandes/modification.js";
import { copier, echelle, rotation, symetrie } from "../commandes/modification.js";
import { aplatir, extruder } from "../commandes/volume.js";
import { creerBoite, creerPrisme, decalerFace, deplacerSolide, diviserFace, pivoterSolide, resoudreLien, suivreSourcesSolides, supprimerSolides } from "../commandes/volume-libre.js";
import { creerBooleen, idsReserves } from "../commandes/booleen.js";
import { definirPropriete, elaguerProprietes, retirerPropriete, type StudioPropriete } from "../exigences/proprietes.js";
import { studioExtrudedRingVertices } from "../objets/polyligne.js";
import { creerScene, definirApparence, modifierScene, retirerApparences, retirerApparencesOrphelines, supprimerScenes } from "../commandes/scenes.js";
import { conserverNonNatif, retirerNonNatifs } from "../commandes/non-natifs.js";
import { creerGraphisme, declarerSource, definirSystemeProjet, retirerGraphismes } from "../commandes/graphismes.js";
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
  "studio.dessin.deplacer": deplacerAvecArchitecture(deplacer),
  "studio.dessin.modifier": modifier,
  "studio.dessin.decaler": decaler,
  "studio.dessin.cote": creerCote,
  "studio.dessin.supprimer": avecArchitecture(supprimer, "supprimer"),
  "studio.dessin.copier": avecArchitecture(copier, "copier"),
  "studio.dessin.rotation": avecArchitecture(rotation, "rotation"),
  "studio.dessin.symetrie": avecArchitecture(symetrie, "symetrie"),
  "studio.dessin.echelle": avecArchitecture(echelle, "echelle"),
  "studio.calque.creer": creerCalque,
  "studio.calque.modifier": modifierCalque,
  "studio.objet.calque": avecArchitecture(placerSurCalque, "calque"),
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
    id: current.id, objects: current.objects, layers: current.layers ?? [], dimensions: current.dimensions ?? [], solides: current.solides ?? [], exacts: current.exacts ?? [], annotations: current.annotations ?? [], architecture: current.architecture ?? [], scenes: current.scenes ?? [], nonNatifs: current.nonNatifs ?? [], graphismes: current.graphismes ?? [], sources: current.sources ?? [], ...(current.systemeProjet ? { systemeProjet: current.systemeProjet } : {}),
    ids: new Set([...current.objects.map((o) => o.id), ...(current.dimensions ?? []).map((d) => d.id), ...(current.solides ?? []).map((s) => s.id), ...(current.exacts ?? []).flatMap(idsReserves), ...(current.annotations ?? []).map((a) => a.id), ...(current.architecture ?? []).map((a) => a.id), ...(current.nonNatifs ?? []).map((n) => n.id), ...(current.graphismes ?? []).map((g) => g.id)]),
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
    HANDLERS[toolId as StudioCommandToolId](state, c.params, path);
  }
  // Prismes liés à une polyligne (lot F1) : recalculés, ou refus si une commande a changé seule leur emprise liée.
  if (state.solides.length) suivreSourcesSolides(state, solidesAvant, "commands");
  // L'apparence d'un objet supprimé disparaît avec lui (lot E.5).
  retirerApparencesOrphelines(state);
  // Contrôle final : limites, unicité et liens sur le document entier, avant de rendre la copie.
  // Les propriétés d'un objet disparu (supprimé, mur supprimé avec ses ouvertures) disparaissent avec lui.
  const presents = new Set([...state.objects.map((o) => o.id), ...state.architecture.map((a) => a.id)]);
  const proprietes = elaguerProprietes(state.proprietes ?? [], (id) => presents.has(id));
  const result = validateStudioDocument(sortie(state.id, state.objects, state.layers, state.dimensions, state.solides, state.annotations, state.architecture, proprietes, state.scenes, state.nonNatifs, state.exacts, state.graphismes, state.systemeProjet, state.sources));
  // Budget d'écriture des extrusions de polylignes fermées : un lot ne peut pas le dépasser ni l'aggraver une fois
  // dépassé ; une révision enregistrée reste toujours lisible (le budget ne s'applique qu'aux écritures).
  const apres = studioExtrudedRingVertices(result.objects);
  if (apres > STUDIO_LIMITS.extrudedRingsTotal && apres > avant) {
    fail("studioDocument.objects", `${STUDIO_LIMITS.extrudedRingsTotal} sommets discrétisés au plus pour l’ensemble des polylignes fermées extrudées du document`);
  }
  return result;
}
