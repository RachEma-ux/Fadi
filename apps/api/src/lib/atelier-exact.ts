/**
 * Noyau exact côté serveur (P2-1, D-177) : le même `@parcours/geometry-exact` (occt-wasm, binaire LGPL chargé à la
 * demande dans le processus Node) recalcule chaque opération annoncée par le navigateur. Une commande
 * `solideExact.creer` arrive avec `operation.entrees` (l'opération) et, facultativement, l'empreinte du brep obtenu
 * en aperçu : le serveur calcule, refuse (409, motif `exact`) si l'empreinte annoncée diffère de la sienne, et écrit
 * **ses** résultats (brep, maillage, volume, aire, faces) dans les paramètres — le serveur est l'autorité (R9).
 * Jamais chargé à l'ouverture : seulement quand une telle commande arrive.
 */
import { ErreurExacte, MoteurExact, type OperationExacte, type SolideExact } from "@parcours/geometry-exact";
import type { Commande } from "@parcours/atelier-model";

let moteur: Promise<MoteurExact> | null = null;
export function moteurExact(): Promise<MoteurExact> {
  moteur ??= MoteurExact.charger().catch((e) => { moteur = null; throw e; });
  return moteur;
}

export const TYPE_CREER_EXACT = "solideExact.creer";

export interface RefusExact { status: 400 | 409; reponse: Record<string, unknown> }

type Brut = Record<string, unknown>;

/** Opération d'une commande `solideExact.creer` (dans `params.operation.entrees`), ou null si absente. */
function entreesDe(c: Commande): unknown {
  const p = (c.params ?? {}) as Brut;
  const params = (p["params"] as Brut | undefined) ?? p;
  const op = params["operation"] as Brut | undefined;
  return op?.["entrees"] ?? null;
}

/**
 * Recalcule les commandes `solideExact.creer` d'un lot et remplace leurs résultats par ceux du serveur. Retourne un
 * refus à renvoyer tel quel, ou null quand tout est cohérent. Les commandes sans `operation.entrees` sont refusées :
 * un brep ne s'écrit jamais sans être recalculé ici.
 */
export async function revaliderSolidesExacts(commandes: Commande[]): Promise<RefusExact | null> {
  const cibles = commandes.map((c, i) => [c, i] as const).filter(([c]) => c.type === TYPE_CREER_EXACT);
  if (!cibles.length) return null;
  const M = await moteurExact();
  for (const [c, i] of cibles) {
    const entrees = entreesDe(c);
    if (!entrees) return { status: 400, reponse: { erreur: "invalide", details: [{ chemin: `commands[${i}].params.operation.entrees`, message: "opération exacte absente : le serveur recalcule toute géométrie exacte" }] } };
    let r: SolideExact;
    try {
      r = M.executer(entrees as OperationExacte);
    } catch (err) {
      if (err instanceof ErreurExacte) return { status: 400, reponse: { erreur: "invalide", details: [{ chemin: `commands[${i}].params.operation.entrees.${err.chemin}`, message: err.message }] } };
      return { status: 400, reponse: { erreur: "invalide", details: [{ chemin: `commands[${i}].params.operation.entrees`, message: `noyau exact : ${err instanceof Error ? err.message : String(err)}` }] } };
    }
    const p = (c.params ?? {}) as Brut;
    const params = ((p["params"] as Brut | undefined) ?? p) as Brut;
    const annoncee = params["empreinteBrep"];
    if (typeof annoncee === "string" && annoncee !== r.empreinte) {
      return { status: 409, reponse: { erreur: "conflit", motif: "exact", conflits: [{ chemin: `commands[${i}].params.empreinteBrep`, motif: `l'aperçu du navigateur (${annoncee}) ne reproduit pas le calcul du serveur (${r.empreinte}) : reprenez l'opération` }] } };
    }
    const op = (params["operation"] as Brut | undefined) ?? {};
    const { entrees: _e, ...operation } = op;
    // Perçage (P2-7) : les entrées sont retirées (le brep y figure), mais le trou d'une opération « trou » est conservé
    // tel que le noyau l'a validé, pour le tableau des perçages.
    const e = entrees as { type?: string; centre?: unknown; direction?: unknown; diametre?: unknown; profondeur?: unknown };
    const percage = e.type === "trou" ? { centre: e.centre, direction: e.direction, diametre: e.diametre, profondeur: e.profondeur ?? null } : undefined;
    Object.assign(params, { brep: r.brep, maillage: r.maillage, volume: r.volume, aire: r.aire, faces: r.faces, moteur: r.moteur, versionMoteur: r.versionMoteur, empreinteBrep: r.empreinte, operation: { ...operation, type: e.type ?? operation["type"] ?? "inconnue", ...(percage ? { percage } : {}) } });
  }
  return null;
}
