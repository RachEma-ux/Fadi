/**
 * Canevas du moteur Canvas de la planche (F.1-02), posé exactement sur la planche SVG (mêmes bords, même cadre de vue) et
 * transparent aux gestes (`pointer-events: none`) : la planche SVG garde désignation, accrochage et accessibilité. Monté
 * seulement quand la règle F.1-01 autorise Canvas (`moteurPlanche`) ; redessiné à chaque document, cadre ou taille.
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { StudioDocument } from "@parcours/atelier-model";
import type { Cadre } from "../geometrie-2d";
import type { Contexte2D } from "./comparaison-moteurs";
import { rendrePlancheCanvas, scenePlanche } from "./moteur-canvas";

export function PlancheCanvas({ doc, cadre, svgRef }: { doc: StudioDocument; cadre: Cadre; svgRef: RefObject<SVGSVGElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(() => scenePlanche(doc), [doc]);
  useEffect(() => {
    const k = ref.current, svg = svgRef.current;
    if (!k || !svg) return;
    let image = 0;
    const tracer = () => {
      image = 0;
      const ctx = k.getContext("2d");
      if (!ctx) return;
      // Bords du canevas = boîte de contenu de la planche SVG (bordure exclue), en pixels de l'appareil.
      const s = getComputedStyle(svg), bg = parseFloat(s.borderLeftWidth) || 0, bh = parseFloat(s.borderTopWidth) || 0;
      const l = svg.clientWidth, h = svg.clientHeight, dpr = window.devicePixelRatio || 1;
      const r = svg.getBoundingClientRect(), p = k.parentElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
      Object.assign(k.style, { left: `${r.left - p.left + bg}px`, top: `${r.top - p.top + bh}px`, width: `${l}px`, height: `${h}px` });
      k.width = Math.max(1, Math.round(l * dpr)); k.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rendrePlancheCanvas(ctx as unknown as Contexte2D & { clearRect(x: number, y: number, w: number, h: number): void }, scene, cadre, l, h);
      k.dataset.studioPlancheCanvasTrace = String(Number(k.dataset.studioPlancheCanvasTrace ?? "0") + 1);
    };
    const demander = () => { if (!image) image = requestAnimationFrame(tracer); };
    demander();
    const obs = typeof ResizeObserver === "function" ? new ResizeObserver(demander) : null;
    obs?.observe(svg);
    return () => { obs?.disconnect(); if (image) cancelAnimationFrame(image); };
  }, [scene, cadre.x, cadre.y, cadre.w, cadre.h, svgRef]);
  return <canvas ref={ref} className="studio-planche-canvas" aria-hidden="true" data-studio-planche-canvas />;
}
