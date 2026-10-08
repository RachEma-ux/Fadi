/**
 * Cinématique (P2-6, DA-17-04, 05, 06) — pure. Une trajectoire est la suite des poses résolues d'un assemblage quand
 * une liaison pilotée parcourt une plage de valeurs ; l'analyse de mouvement relève, pas par pas, les volumes communs
 * entre pièces de l'assemblage et le bâtiment (ou entre pièces), jamais corrigés. Rien n'est écrit : le modèle n'est
 * pas modifié, chaque pas est un état dérivé.
 */
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque, Pose3 } from "../../modele.js";
import { interferences } from "../../interferences.js";
import { piecesDe, resoudreAssemblage } from "./index.js";
import { PILOTAGE } from "./liaisons.js";

export interface PasCinematique {
  valeur: number;
  poses: Record<string, Pose3>;
  emprises: Record<string, { x: number; y: number }[]>;
  diagnostic: string | null;
  /** Volumes communs (m³) entre une pièce de l'assemblage et un autre corps à ce pas (objets, volume). */
  collisions: { objets: [string, string]; volume: number }[];
}

export interface Trajectoire {
  liaisonId: string;
  assemblageId: string;
  unite: "deg" | "m";
  pas: PasCinematique[];
  /** Pas où la résolution a échoué (sur-contraint ou non convergé). */
  echecs: number[];
}

/** État dérivé où la liaison vaut `valeur` (assemblage résolu), ou null si la résolution échoue. */
export function etatPourValeur(etat: ModeleAtelier, liaisonId: string, valeur: number): ModeleAtelier | null {
  const l = etat.objets[liaisonId];
  if (!l || l.classe !== "liaison") return null;
  const a = etat.objets[l.params.a];
  const asmId = a?.classe === "piece-mecanique" ? a.params.assemblageId : null;
  if (!asmId) return null;
  const avec: ModeleAtelier = { ...etat, objets: { ...etat.objets, [liaisonId]: { ...l, params: { ...l.params, valeur } } } };
  try { return resoudreAssemblage(avec, asmId).etat; } catch { return null; }
}

/** Trajectoire d'une liaison pilotée de `de` à `a` en `nombre` pas (bornes comprises), avec analyse de mouvement si demandée. */
export function trajectoire(etat: ModeleAtelier, liaisonId: string, de: number, a: number, nombre: number, options: { collisions?: boolean } = {}): Trajectoire {
  const l = etat.objets[liaisonId];
  if (!l || l.classe !== "liaison") throw new Error(`${liaisonId} n'est pas une liaison`);
  const pil = PILOTAGE[l.params.type];
  if (!pil) throw new Error(`liaison ${l.params.type} : non pilotable`);
  const piece = etat.objets[l.params.a];
  const assemblageId = piece?.classe === "piece-mecanique" ? piece.params.assemblageId : null;
  if (!assemblageId) throw new Error(`liaison ${liaisonId} : pièce hors assemblage`);
  const n = Math.max(2, Math.min(200, Math.round(nombre)));
  const pas: PasCinematique[] = [];
  const echecs: number[] = [];
  let courant = etat; // chaque pas part du précédent (continuité de la trajectoire)
  for (let i = 0; i < n; i++) {
    const valeur = de + ((a - de) * i) / (n - 1);
    const e = etatPourValeur(courant, liaisonId, valeur);
    if (e) courant = e;
    if (!e) { echecs.push(i); pas.push({ valeur, poses: {}, emprises: {}, diagnostic: "non résolu", collisions: [] }); continue; }
    const pieces = piecesDe(e, assemblageId);
    const poses: Record<string, Pose3> = {}, emprises: Record<string, { x: number; y: number }[]> = {};
    for (const p of pieces) { poses[p.id] = p.params.pose; emprises[p.id] = p.params.emprise.map((q) => ({ x: q.x, y: q.y })); }
    const ids = new Set(pieces.map((p) => p.id));
    const collisions = options.collisions ? interferences(e).filter((x) => ids.has(x.objets[0]) || ids.has(x.objets[1])).map((x) => ({ objets: x.objets, volume: Math.round(x.volume * 1e6) / 1e6 })) : [];
    pas.push({ valeur, poses, emprises, diagnostic: (e.objets[assemblageId] as Occurrence<"assemblage">).params.diagnostic, collisions });
  }
  return { liaisonId, assemblageId, unite: pil.unite, pas, echecs };
}

/** Course libre : plus grande plage [de, a] parcourue sans collision ni échec (premier pas qui bute, s'il y en a un). */
export function premierObstacle(t: Trajectoire): { indice: number; valeur: number; objets: [string, string] | null } | null {
  for (let i = 0; i < t.pas.length; i++) {
    const p = t.pas[i]!;
    if (t.echecs.includes(i)) return { indice: i, valeur: p.valeur, objets: null };
    if (p.collisions.length) return { indice: i, valeur: p.valeur, objets: p.collisions[0]!.objets };
  }
  return null;
}

export type { OccurrenceQuelconque };
