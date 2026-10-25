/**
 * Noyau exact côté serveur pour Studio (lot F2, IF-003, R9) : chaque commande `studio.solide.booleen` d'un lot est
 * **recalculée** ici par le même `@parcours/geometry-exact` que le navigateur (OCCT en WebAssembly, chargé à la demande
 * dans le processus par `atelier-exact.ts`, jamais au démarrage), depuis les opérandes du document du serveur tel qu'il
 * est juste avant la commande — jamais depuis une géométrie fournie par le client. L'empreinte annoncée par le
 * navigateur doit être celle du serveur, sinon le lot est refusé (400 `invalid_commands`, code `exact-mismatch`) ; le
 * serveur écrit ensuite **son** résultat dans la commande (brep, maillage, mesures) : il fait autorité.
 */
import { studioCaptureBooleen, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { ErreurExacte, type SolideExact } from "@parcours/geometry-exact";
import { moteurExact } from "./atelier-exact.js";

export const TYPE_BOOLEEN_STUDIO = "studio.solide.booleen";

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
  const cibles = commands.map((c, i) => [c, i] as const).filter(([c]) => c.toolId === TYPE_BOOLEEN_STUDIO);
  if (!cibles.length) return null;
  const M = await moteurExact();
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
    const operandes = Array.isArray(p["operandes"]) ? (p["operandes"] as unknown[]).map(String) : [];
    const capture = studioCaptureBooleen(doc, { operation: String(p["operation"] ?? ""), operandes });
    if (!capture.ok) return refus(`commands[${i}].params`, "studio-invalid", capture.message);
    let r: SolideExact;
    try {
      r = M.executer(capture.capture.entrees);
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
