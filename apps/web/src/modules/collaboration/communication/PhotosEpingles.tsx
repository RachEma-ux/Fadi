/**
 * Photos et épingles de la Communication (lot COM-13, COM-D15 à COM-D19) : affichage des photos jointes (servies par le
 * serveur, qui relit l'audience à chaque requête), plan d'une révision exacte avec son épingle (repère local, mètres,
 * y inversé comme l'export SVG Studio), pose d'une épingle, position déclarée (repère geographic, WGS84). Le plan est
 * l'export SVG de la révision citée : il ne change jamais quand la variante avance. Les photos du fil se chargent en
 * différé (unlazy, `components/ImageDifferee.tsx`) : seules celles qui approchent de la zone visible sont téléchargées.
 */
import { useMemo, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, comApi, type ComEpingle, type ComLocalisation, type ComPiece } from "../../../lib/api";
import { ConfirmDialog } from "../../../components/comptes/ComptesUI";
import { cheminVarianteStudio } from "../../studio/routes-studio";
import { ImageDifferee } from "../../../components/ImageDifferee";

const nf = (n: number, d = 2) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Cadre de vue d'un SVG (« minX minY largeur hauteur »), ou null. */
export function cadreDe(svg: string): [number, number, number, number] | null {
  const m = /viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"/.exec(svg);
  if (!m) return null;
  const v = m.slice(1, 5).map(Number) as [number, number, number, number];
  return v.every(Number.isFinite) && v[2] > 0 && v[3] > 0 ? v : null;
}

/** Point local (mètres) → coordonnées SVG de l'export Studio (y inversé). */
export const versSvg = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y });

export function PhotosMessage({ projectId, pieces, auteur }: { projectId: string; pieces: ComPiece[]; auteur: string }) {
  if (!pieces.length) return null;
  return (
    <div className="com-photos" data-com-photos={pieces.length}>
      {pieces.map((p) => (
        <a key={p.id} href={comApi.urlPiece(projectId, p.id)} target="_blank" rel="noreferrer" className="com-photo">
          <ImageDifferee src={comApi.urlPiece(projectId, p.id)} alt={`Photo jointe par ${auteur}`} width={p.width} height={p.height} data-com-photo={p.id} />
        </a>
      ))}
    </div>
  );
}

/** Plan SVG d'une révision avec une épingle ; `surClic` (pose) reçoit le point local en mètres. */
export function PlanEpingle({ svg, point, surClic }: { svg: string; point: { x: number; y: number } | null; surClic?: (p: { x: number; y: number }) => void }) {
  const cadre = cadreDe(svg);
  const url = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, [svg]);
  if (!cadre) return <p className="h7-muted">Plan illisible.</p>;
  const [vx, vy, vw, vh] = cadre;
  const r = Math.max(vw, vh) * 0.015;
  const clic = (e: MouseEvent<SVGSVGElement>) => {
    if (!surClic) return;
    const box = e.currentTarget.getBoundingClientRect();
    const sx = vx + ((e.clientX - box.left) / box.width) * vw;
    const sy = vy + ((e.clientY - box.top) / box.height) * vh;
    surClic({ x: Math.round(sx * 1000) / 1000, y: Math.round(-sy * 1000) / 1000 });
  };
  const p = point ? versSvg(point) : null;
  return (
    <div className="com-plan" style={{ aspectRatio: `${vw} / ${vh}` }} data-com-plan>
      <img src={url} alt="Plan de la révision épinglée" />
      <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className={surClic ? "com-plan-pose" : undefined} onClick={clic} role={surClic ? "button" : "img"}
        aria-label={surClic ? "Cliquer sur le plan pour poser l’épingle" : "Épingle sur le plan"} data-com-plan-zone>
        {p && <g data-com-epingle-marque><circle cx={p.x} cy={p.y} r={r} fill="#b3261e" fillOpacity="0.85" stroke="#fff" strokeWidth={r * 0.25} /><circle cx={p.x} cy={p.y} r={r * 0.3} fill="#fff" /></g>}
      </svg>
    </div>
  );
}

export function EpingleMessage({ projectId, epingle }: { projectId: string; epingle: ComEpingle & { variante: string | null } }) {
  const [ouvert, setOuvert] = useState(false);
  const plan = useQuery({ queryKey: ["com", projectId, "plan", epingle.variantId, epingle.revisionId], queryFn: () => comApi.plan(projectId, epingle.studyId, epingle.variantId, epingle.revisionId), enabled: ouvert });
  return (
    <details className="com-epingle" data-com-epingle={epingle.revisionId} open={ouvert} onToggle={(e) => setOuvert((e.target as HTMLDetailsElement).open)}>
      <summary>
        {"Épinglé sur "}<span translate="no">{epingle.variante ?? "une variante Studio"}</span>{` · révision ${epingle.revisionId.slice(-8)} · point (${nf(epingle.point.x)} ; ${nf(epingle.point.y)}) m`}
        {epingle.objetIds.length > 0 && ` · ${epingle.objetIds.length} objet(s) cité(s)`}
      </summary>
      <p className="h7-muted">L’épingle reste sur cette révision, même si la variante a avancé depuis. <Link to={cheminVarianteStudio(projectId, epingle.studyId, epingle.variantId, epingle.revisionId, { domaine: "documentation" })}>Ouvrir la révision dans Studio</Link></p>
      {ouvert && (plan.data ? <PlanEpingle svg={plan.data.svg} point={epingle.point} /> : plan.isError ? <p role="alert">Plan indisponible.</p> : <p role="status">Lecture du plan…</p>)}
    </details>
  );
}

export function LocalisationMessage({ l }: { l: ComLocalisation }) {
  return (
    <p className="h7-muted com-localisation" data-com-localisation>
      {"Position déclarée par l’auteur : "}<span translate="no">{`${l.lat.toFixed(5)}, ${l.lon.toFixed(5)}`}</span>
      {` (WGS84${l.precisionM !== null ? `, ± ${Math.round(l.precisionM)} m` : ""})`}
    </p>
  );
}

export interface EpingleChoisie { studyId: string; variantId: string; revisionId: string; variante: string; point: { x: number; y: number } }

/** Pose d'une épingle : étude et variante (celle du contexte proposée), plan de la tête, clic sur le plan. */
export function DialogueEpingle({ projectId, initial, onFin }: { projectId: string; initial: { studyId: string; variantId: string } | null; onFin: (e: EpingleChoisie | null) => void }) {
  const [studyId, setStudyId] = useState(initial?.studyId ?? "");
  const [variantId, setVariantId] = useState(initial?.variantId ?? "");
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const etudes = useQuery({ queryKey: ["studio-etudes-com", projectId], queryFn: () => api.studioStudies(projectId) });
  const variantes = useQuery({ queryKey: ["studio-variantes-com", projectId, studyId], queryFn: () => api.studioVariants(projectId, studyId), enabled: !!studyId });
  const plan = useQuery({ queryKey: ["com", projectId, "plan", variantId, "tete"], queryFn: () => comApi.plan(projectId, studyId, variantId), enabled: !!studyId && !!variantId });
  return (
    <ConfirmDialog title="Épingler sur un plan" confirmLabel="Poser l’épingle" confirmDisabled={!point || !plan.data} onClose={() => onFin(null)}
      onConfirm={() => { if (point && plan.data) onFin({ studyId, variantId, revisionId: plan.data.revisionId, variante: plan.data.variante, point }); }}>
      <label>Étude
        <select value={studyId} onChange={(e) => { setStudyId(e.target.value); setVariantId(""); setPoint(null); }}>
          <option value="">—</option>
          {etudes.data?.studies.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>Variante
        <select value={variantId} onChange={(e) => { setVariantId(e.target.value); setPoint(null); }}>
          <option value="">—</option>
          {variantes.data?.variants.filter((v) => !v.archived).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      {plan.data && (
        <>
          <p className="h7-muted">{`Révision affichée : ${plan.data.revisionId.slice(-8)} (tête de la variante). L’épingle restera sur cette révision exacte.`}</p>
          <PlanEpingle svg={plan.data.svg} point={point} surClic={setPoint} />
          <p className="h7-muted" data-com-epingle-point>{point ? `Point : (${nf(point.x)} ; ${nf(point.y)}) m, repère local du plan` : "Cliquez sur le plan pour poser l’épingle."}</p>
        </>
      )}
      {plan.isError && <p role="alert">Plan indisponible pour cette variante.</p>}
    </ConfirmDialog>
  );
}
