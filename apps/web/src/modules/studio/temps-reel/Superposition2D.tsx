/**
 * Temps réel — surimpression de la planche 2D (RTC-2) : pointeurs et sélections des autres participants, dans le repère
 * `local-2d` du document (mètres), jamais une donnée du document ni une annotation. Chaque marque porte le nom de la
 * personne : la présence ne dépend jamais de la seule couleur. Rien ici n'intercepte les clics (`pointer-events: none`).
 */
import type { StudioDocument } from "@parcours/atelier-model";
import { emprise, type Cadre } from "../planche2d/geometrie-2d";
import type { PointeurDistant } from "./etat-session";

const TEINTES = ["#b4005a", "#005fb4", "#007a3d", "#8a4b00", "#5a2db4", "#00707a"];
const teinte = (userId: string) => TEINTES[[...userId].reduce((n, c) => n + c.charCodeAt(0), 0) % TEINTES.length]!;

/** Emprise d'un seul objet du document (forme, cote, annotation ou mur), ou null s'il n'est pas dessiné en plan. */
function empriseObjet(doc: StudioDocument, id: string) {
  const seul: StudioDocument = {
    ...doc,
    objects: doc.objects.filter((o) => o.id === id),
    dimensions: (doc.dimensions ?? []).filter((d) => d.id === id),
    annotations: (doc.annotations ?? []).filter((a) => a.id === id),
    architecture: (doc.architecture ?? []).filter((a) => a.id === id),
  };
  return emprise(seul, () => true);
}

export interface Superposition2DProps {
  doc: StudioDocument;
  cadre: Cadre;
  pointeurs: readonly PointeurDistant[];
  selections: Readonly<Record<string, readonly string[]>>;
  noms: Readonly<Record<string, string>>;
}

export function Superposition2D({ doc, cadre, pointeurs, selections, noms }: Superposition2DProps) {
  const r = cadre.w * 0.006, police = cadre.w * 0.014, trait = cadre.w * 0.002;
  return (
    <g className="tr-superposition" data-tr-superposition pointerEvents="none" aria-hidden="true" {...({ translate: "no" } as object)}>
      {Object.entries(selections).flatMap(([userId, ids]) => ids.map((id) => {
        const e = empriseObjet(doc, id);
        if (!e) return null;
        const m = r * 1.5;
        return (
          <g key={`${userId}:${id}`} data-tr-selection-distante={id} data-tr-de={userId}>
            <rect x={e.min.x - m} y={e.min.y - m} width={e.max.x - e.min.x + 2 * m} height={e.max.y - e.min.y + 2 * m}
              fill="none" stroke={teinte(userId)} strokeWidth={trait} strokeDasharray={`${trait * 4} ${trait * 3}`} />
            <text x={e.min.x - m} y={e.min.y - m - police * 0.3} fontSize={police * 0.8} fill={teinte(userId)}>{noms[userId] ?? ""}</text>
          </g>
        );
      }))}
      {pointeurs.filter((p) => p.espace === "plan").map((p) => (
        <g key={p.userId} data-tr-pointeur={p.userId} transform={`translate(${p.x} ${p.y})`}>
          <circle r={r} fill={teinte(p.userId)} stroke="#fff" strokeWidth={trait} />
          <text x={r * 1.6} y={-r * 1.2} fontSize={police} fill={teinte(p.userId)} stroke="#fff" strokeWidth={trait * 0.6} paintOrder="stroke">{p.nom || noms[p.userId] || ""}</text>
        </g>
      ))}
    </g>
  );
}
