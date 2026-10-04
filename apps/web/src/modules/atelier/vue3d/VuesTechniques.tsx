/**
 * Panneau « Vue technique » de la vue 3D (L3b.4) : plan (coupe horizontale), coupes nord–sud, est–ouest et selon
 * un plan quelconque, façades — en SVG, calculés par `vues.ts` depuis la scène et `core-geometry`. Vues de travail :
 * pas d'export ni d'annotation (lot 5). Un clic sur une forme sélectionne l'objet (Maj : basculer).
 */
import { useMemo, useState } from "react";
import type { IdObjet } from "@parcours/atelier-model";
import type { Scene3d } from "./scene";
import { etendue, LIBELLES_VUE, vueTechnique, type Forme2d, type TypeVue } from "./vues";

const TYPES = Object.keys(LIBELLES_VUE) as TypeVue[];
const REMPLI: Readonly<Record<Forme2d["style"], string>> = { coupe: "#2f3a35", vue: "#ffffff", baie: "#a9cfd6" };
const TRAIT: Readonly<Record<Forme2d["style"], string>> = { coupe: "#1b2420", vue: "#5b6b63", baie: "#3f7a78" };

export interface ProprietesVuesTechniques {
  readonly scene: Scene3d;
  readonly niveaux: readonly { readonly id: IdObjet; readonly nom: string; readonly elevation: number }[];
  /** Altitude de coupe proposée pour le plan (niveau actif + 1,20 m). */
  readonly hauteurPlan: number;
  readonly selection: ReadonlySet<IdObjet>;
  onChoisir(id: IdObjet, basculer: boolean): void;
}

export function VuesTechniques({ scene, niveaux, hauteurPlan, selection, onChoisir }: ProprietesVuesTechniques) {
  const [type, setType] = useState<TypeVue>("coupe-ns");
  const [positions, setPositions] = useState<Partial<Record<TypeVue, number>>>({});
  const [angle, setAngle] = useState(30);
  const e = etendue(scene);
  const bornesCurseur: readonly [number, number] = !e ? [0, 1] : type === "plan" ? e.z : type === "coupe-ns" ? e.x : type === "coupe-eo" ? e.y : [-Math.hypot(e.x[1] - e.x[0], e.y[1] - e.y[0]) / 2, Math.hypot(e.x[1] - e.x[0], e.y[1] - e.y[0]) / 2];
  const defaut = !e ? 0 : type === "plan" ? hauteurPlan : type === "coupe-ns" ? e.centre[0] : type === "coupe-eo" ? e.centre[1] : 0;
  const position = positions[type] ?? defaut;
  const avecPosition = type === "plan" || type.startsWith("coupe");
  const vue = useMemo(() => vueTechnique(scene, niveaux, { type, position, angle }), [scene, niveaux, type, position, angle]);

  const b = vue.bornes;
  const marge = b ? Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) * 0.04 + 0.5 : 1;
  const vb = b ? [b.min[0] - marge, -(b.max[1] + marge), b.max[0] - b.min[0] + 2 * marge, b.max[1] - b.min[1] + 2 * marge] : [0, 0, 10, 10];
  const taille = (vb[2] ?? 10) / 60;
  const chemin = (pts: readonly (readonly [number, number])[]) => `M${pts.map(([u, v]) => `${u.toFixed(3)},${(-v).toFixed(3)}`).join("L")}Z`;

  return (
    <section className="atl-3d-vues" aria-labelledby="atl-3d-vues-titre" data-testid="atl-vue-technique" data-type={type} data-formes={vue.formes.length}>
      <h3 id="atl-3d-vues-titre" className="atl-sr">
        Vue technique
      </h3>
      <div className="atl-3d-barre">
        <label className="atl-3d-moteur">
          Vue
          <select value={type} onChange={(ev) => setType(ev.target.value as TypeVue)} data-testid="atl-vue-technique-type">
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {LIBELLES_VUE[t]}
              </option>
            ))}
          </select>
        </label>
        {avecPosition && (
          <label className="atl-3d-coupe">
            {type === "plan" ? "Altitude" : type === "coupe-quelconque" ? "Décalage" : "Position"} {position.toFixed(2).replace(".", ",")} m
            <input type="range" min={Math.floor(bornesCurseur[0])} max={Math.ceil(bornesCurseur[1])} step={0.1} value={position} onChange={(ev) => setPositions((p) => ({ ...p, [type]: Number(ev.target.value) }))} data-testid="atl-vue-technique-position" />
          </label>
        )}
        {type === "coupe-quelconque" && (
          <label className="atl-3d-coupe">
            Angle {angle}°
            <input type="range" min={0} max={179} step={1} value={angle} onChange={(ev) => setAngle(Number(ev.target.value))} data-testid="atl-vue-technique-angle" />
          </label>
        )}
      </div>
      <p className="atl-3d-etat atl-petit">
        {vue.titre} · {vue.formes.length} forme(s) · vue de travail, sans export (documents : lot 5)
      </p>
      <svg className="atl-3d-svg" viewBox={vb.join(" ")} role="img" aria-label={`${vue.titre} : ${vue.formes.length} forme(s)`} preserveAspectRatio="xMidYMid meet">
        {vue.niveaux.map((n) => (
          <g key={`${n.nom}-${n.v}`} className="atl-3d-niveau">
            <line x1={vb[0]} x2={(vb[0] ?? 0) + (vb[2] ?? 0)} y1={-n.v} y2={-n.v} stroke="#8a9a92" strokeDasharray={`${taille} ${taille / 2}`} strokeWidth={taille / 8} />
            <text x={(vb[0] ?? 0) + taille / 2} y={-n.v - taille / 3} fontSize={taille} fill="#183d32">
              {n.nom} {n.v.toFixed(2).replace(".", ",")} m
            </text>
          </g>
        ))}
        {vue.formes.map((f, i) => (
          <path
            key={`${f.objetId}-${i}`}
            d={[f.points, ...(f.trous ?? [])].map(chemin).join("")}
            fillRule="evenodd"
            fill={REMPLI[f.style]}
            stroke={selection.has(f.objetId) ? "#e8833a" : TRAIT[f.style]}
            strokeWidth={selection.has(f.objetId) ? 2.5 : 1}
            vectorEffect="non-scaling-stroke"
            onClick={(ev) => onChoisir(f.objetId, ev.shiftKey)}
            data-objet={f.objetId}
          >
            <title>{f.objetId}</title>
          </path>
        ))}
      </svg>
    </section>
  );
}
