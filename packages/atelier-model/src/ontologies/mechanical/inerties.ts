/**
 * Inerties (P2-6, DA-17-10) — pur. Volume, centre de volume et tenseur d'inertie d'une pièce depuis son maillage posé ;
 * masse et inertie massique seulement si une masse volumique **déclarée avec sa source** est portée par la pièce
 * (R3 : aucune densité n'est connue du code). Assemblage : somme des pièces évaluables, pièces non évaluées listées.
 */
import type { ModeleAtelier, Occurrence } from "../../modele.js";
import { proprietesMasse, type V3 } from "../../geometrie-3d.js";
import { positionsPosees3, type RepereAssemblage } from "./geometrie.js";
import { piecesDe, repereAssemblage } from "./index.js";

export interface InertiePiece {
  pieceId: string;
  volume: number;
  centre: V3;
  /** Tenseur géométrique (densité 1) au centre de volume, 3 × 3 ligne par ligne (m⁵). */
  inertieGeometrique: number[];
  masseVolumique: { valeur: number; source: string } | null;
  masse: number | null;
  /** Tenseur massique au centre (kg·m²) ; null sans masse volumique. */
  inertie: number[] | null;
}

export function inertiePiece(etat: ModeleAtelier, piece: Occurrence<"piece-mecanique">): InertiePiece {
  const repere: RepereAssemblage | null = piece.params.assemblageId ? repereAssemblage(etat, piece.params.assemblageId) : null;
  const positions = positionsPosees3(piece.params.maillage, piece.params.pose, repere);
  const pm = proprietesMasse({ positions, indices: piece.params.maillage.indices });
  const mv = piece.params.masseVolumique ?? null;
  return {
    pieceId: piece.id,
    volume: pm.volume,
    centre: pm.centre,
    inertieGeometrique: pm.inertie,
    masseVolumique: mv,
    masse: mv ? pm.volume * mv.valeur : null,
    inertie: mv ? pm.inertie.map((v) => v * mv.valeur) : null,
  };
}

export interface InertieAssemblage {
  assemblageId: string;
  pieces: InertiePiece[];
  volume: number;
  masse: number | null;
  centreDeMasse: V3 | null;
  /** Tenseur massique au centre de masse de l'assemblage (Huygens), null si une pièce n'a pas de masse volumique. */
  inertie: number[] | null;
  nonEvaluees: string[];
}

export function inertieAssemblage(etat: ModeleAtelier, assemblageId: string): InertieAssemblage {
  const pieces = piecesDe(etat, assemblageId).map((p) => inertiePiece(etat, p));
  const volume = pieces.reduce((s, p) => s + p.volume, 0);
  const nonEvaluees = pieces.filter((p) => p.masse === null).map((p) => p.pieceId);
  if (nonEvaluees.length || !pieces.length) return { assemblageId, pieces, volume, masse: null, centreDeMasse: null, inertie: null, nonEvaluees };
  const masse = pieces.reduce((s, p) => s + p.masse!, 0);
  const c: V3 = [0, 0, 0];
  for (const p of pieces) for (let i = 0; i < 3; i++) c[i] = c[i]! + (p.masse! * p.centre[i]!) / masse;
  const I = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pieces) {
    const d: V3 = [p.centre[0] - c[0], p.centre[1] - c[1], p.centre[2] - c[2]];
    const d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) I[3 * i + j] = I[3 * i + j]! + p.inertie![3 * i + j]! + p.masse! * ((i === j ? d2 : 0) - d[i]! * d[j]!);
  }
  return { assemblageId, pieces, volume, masse, centreDeMasse: c, inertie: I, nonEvaluees };
}
