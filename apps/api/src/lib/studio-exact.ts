/**
 * Noyau exact côté serveur pour Studio (lot F2, IF-003, R9) : chaque commande `studio.solide.booleen` d'un lot est
 * **recalculée** ici par le même `@parcours/geometry-exact` que le navigateur (OCCT en WebAssembly, chargé à la demande
 * dans le processus par `atelier-exact.ts`, jamais au démarrage), depuis les opérandes du document du serveur tel qu'il
 * est juste avant la commande — jamais depuis une géométrie fournie par le client. L'empreinte annoncée par le
 * navigateur doit être celle du serveur, sinon le lot est refusé (400 `invalid_commands`, code `exact-mismatch`) ; le
 * serveur écrit ensuite **son** résultat dans la commande (brep, maillage, mesures) : il fait autorité.
 *
 * X.1-05 : chaque `studio.surface.epaissir` (épaississement d'une surface libre NURBS) suit le même chemin — recalculé
 * depuis la surface du document du serveur (opération `nurbs` du noyau), empreinte comparée, résultat du serveur écrit ;
 * de même chaque `studio.subdivision.solidifier` (maillage subdivisé recalculé, opération `polyedre`).
 */
import { studioCaptureBooleen, studioCaptureEpaississement, studioCaptureSolidification, studioPiecesStep, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { ErreurExacte, type SolideExact } from "@parcours/geometry-exact";
import { moteurExact } from "./atelier-exact.js";
import { surveillanceStudio } from "./studio-surveillance.js";

export const TYPE_BOOLEEN_STUDIO = "studio.solide.booleen";
/** X.1-05 : épaississement exact d'une surface libre, recalculé comme le booléen. */
export const TYPE_EPAISSIR_STUDIO = "studio.surface.epaissir";
/** X.1-05 : solidification d'une surface de subdivision fermée (polyèdre du maillage subdivisé), recalculée de même. */
export const TYPE_SOLIDIFIER_STUDIO = "studio.subdivision.solidifier";
const TYPES_EXACTS_STUDIO: ReadonlySet<string> = new Set([TYPE_BOOLEEN_STUDIO, TYPE_EPAISSIR_STUDIO, TYPE_SOLIDIFIER_STUDIO]);

export interface RefusExactStudio { status: 400; body: Record<string, unknown> }

type Brut = Record<string, unknown>;
const refus = (path: string, code: string, message: string): RefusExactStudio => ({ status: 400, body: { error: "invalid_commands", code, path, message } });

/** Application des commandes du modèle, fournie par le seul point d'entrée des écritures (`studio-commands.ts`, INV-010). */
export type AppliquerStudio = (document: StudioDocument, commands: readonly StudioCommand[]) => StudioDocument;

/**
 * Recalcule les booléens exacts du lot (sur `document`, la tête du serveur) et remplace leurs résultats par ceux du
 * serveur. Retourne un refus à renvoyer tel quel, ou null quand tout est cohérent (ou qu'il n'y a aucun booléen : le
 * noyau n'est alors pas chargé). `appliquer` (l'application du modèle, en mémoire, sans écriture) donne le document
 * juste avant chaque booléen ; un état intermédiaire invalide avant un booléen est refusé (`exact-etat-intermediaire`), jamais laissé sans recalcul.
 */
export async function revaliderBooleensStudio(document: StudioDocument, commands: StudioCommand[], appliquer: AppliquerStudio): Promise<RefusExactStudio | null> {
  const cibles = commands.map((c, i) => [c, i] as const).filter(([c]) => TYPES_EXACTS_STUDIO.has(c.toolId));
  if (!cibles.length) return null;
  // Noyau chargé seulement pour un booléen dont les opérandes sont relus dans CE document : des opérandes absents (d'une
  // autre variante ou d'un autre projet, BLOC-02) sont refusés avant tout appel au noyau.
  let M: Awaited<ReturnType<typeof moteurExact>> | null = null;
  let doc = document;
  let applique = 0;
  for (const [c, i] of cibles) {
    // Document du serveur juste avant la commande i (les booléens précédents portent déjà le résultat du serveur).
    if (i > applique) {
      // Le serveur ne recalcule un booléen que sur un état intermédiaire valide : si les commandes qui le précèdent ne
      // s'appliquent pas seules (même si le lot complet serait valide), le lot est refusé — jamais accepté sans recalcul.
      try { doc = appliquer(doc, commands.slice(applique, i)); } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return refus(`commands[${i}]`, "exact-etat-intermediaire", `les commandes qui précèdent ce booléen ne s’appliquent pas seules (${message}) : envoyez le booléen dans un lot séparé`);
      }
      applique = i;
    }
    const p = (c.params ?? {}) as Brut;
    let entrees: unknown;
    if (c.toolId === TYPE_SOLIDIFIER_STUDIO) {
      // Maillage subdivisé recalculé depuis la surface de CE document (Loop, pur), puis cousu par le noyau.
      const capture = studioCaptureSolidification(doc, { subdivision: String(p["subdivision"] ?? "") });
      if (!capture.ok) return refus(`commands[${i}].params`, "studio-invalid", capture.message);
      entrees = capture.capture.entrees;
    } else if (c.toolId === TYPE_EPAISSIR_STUDIO) {
      // Surface relue dans CE document ; épaisseur et côté de la commande (validés par la capture, rien par défaut).
      const e = p["epaisseur"];
      const capture = studioCaptureEpaississement(doc, { surface: String(p["surface"] ?? ""), epaisseur: typeof e === "number" ? e : null, sens: String(p["sens"] ?? "") });
      if (!capture.ok) return refus(`commands[${i}].params`, "studio-invalid", capture.message);
      entrees = capture.capture.entrees;
    } else {
      const operandes = Array.isArray(p["operandes"]) ? (p["operandes"] as unknown[]).map(String) : [];
      const capture = studioCaptureBooleen(doc, { operation: String(p["operation"] ?? ""), operandes });
      if (!capture.ok) return refus(`commands[${i}].params`, "studio-invalid", capture.message);
      entrees = capture.capture.entrees;
    }
    M ??= await moteurExact();
    let r: SolideExact;
    try {
      const moteur = M;
      r = surveillanceStudio.mesurer("exact", c.toolId, () => moteur.executer(entrees));
    } catch (err) {
      const message = err instanceof ErreurExacte || err instanceof Error ? err.message : String(err);
      return refus(`commands[${i}].params`, "exact-echec", `noyau exact : ${message}`);
    }
    const annoncee = (p["resultat"] as Brut | undefined)?.["empreinte"];
    if (annoncee !== r.empreinte) {
      return refus(`commands[${i}].params.resultat.empreinte`, "exact-mismatch", `le calcul du navigateur (${String(annoncee)}) ne reproduit pas celui du serveur (${r.empreinte}) : reprenez l’opération`);
    }
    p["resultat"] = { brep: r.brep, maillage: r.maillage, volume: r.volume, aire: r.aire, faces: r.faces, solides: r.solides, moteur: r.moteur, versionMoteur: r.versionMoteur, empreinte: r.empreinte };
  }
  return null;
}

/**
 * Export STEP d'une révision (E.6-04) : pièces décrites par le modèle (`studioPiecesStep`, une par élément solide,
 * nommée par son identifiant Studio échappé), écrites par le noyau exact chargé à la demande (`exporterStepPieces` :
 * assemblage XCAF AP214, millimètres déclarés, géométrie × 1 000, horodatage de la révision). `null` : aucun solide à
 * écrire (l'appelant refuse, jamais un fichier vide).
 */
export async function exportStudioStep(document: StudioDocument, horodatage: string, nomFichier: string): Promise<string | null> {
  const { pieces } = studioPiecesStep(document);
  if (!pieces.length) return null;
  const M = await moteurExact();
  return M.exporterStepPieces(pieces, { horodatage, nomFichier });
}
