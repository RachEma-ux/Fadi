import type { StudioPoint } from "../noyau/types.js";
import { dxfText, nb } from "./texte.js";

/** Écrivain DXF R12 ASCII : paires (code, valeur) et entités élémentaires, utilisées par chaque type d'objet (`objets/`). */
export class DxfWriter {
  readonly out: string[] = [];
  pair(code: number, value: string | number): void {
    this.out.push(String(code), typeof value === "number" ? nb(value) : value);
  }
  point(base: number, p: StudioPoint): void {
    this.pair(base, p.x);
    this.pair(base + 10, p.y);
    this.pair(base + 20, 0);
  }
  line(layer: string, a: StudioPoint, b: StudioPoint): void {
    this.pair(0, "LINE");
    this.pair(8, layer);
    this.point(10, a);
    this.point(11, b);
  }
  closedPolyline(layer: string, pts: readonly StudioPoint[]): void {
    this.polyline(layer, pts, true);
  }
  /** POLYLINE R12 (66 = 1, VERTEX… SEQEND) ; renflement d'un segment en code 42 sur son sommet de départ. */
  polyline(layer: string, pts: readonly StudioPoint[], closed: boolean, bulges?: readonly number[]): void {
    this.pair(0, "POLYLINE");
    this.pair(8, layer);
    this.pair(66, 1);
    this.point(10, { x: 0, y: 0 });
    this.pair(70, closed ? 1 : 0);
    pts.forEach((p, i) => {
      this.pair(0, "VERTEX");
      this.pair(8, layer);
      this.point(10, p);
      const b = bulges?.[i] ?? 0;
      if (b !== 0) this.pair(42, b);
    });
    this.pair(0, "SEQEND");
    this.pair(8, layer);
  }
  circle(layer: string, c: StudioPoint, r: number): void {
    this.pair(0, "CIRCLE");
    this.pair(8, layer);
    this.point(10, c);
    this.pair(40, r);
  }
  /** ARC : angles en degrés, sens trigonométrique, de 50 (début) à 51 (fin). */
  arc(layer: string, c: StudioPoint, r: number, start: number, end: number): void {
    this.pair(0, "ARC");
    this.pair(8, layer);
    this.point(10, c);
    this.pair(40, r);
    this.pair(50, (start * 180) / Math.PI);
    this.pair(51, (end * 180) / Math.PI);
  }
  text(layer: string, p: StudioPoint, height: number, value: string, angle: number): void {
    this.pair(0, "TEXT");
    this.pair(8, layer);
    this.point(10, p);
    this.pair(40, height);
    this.pair(1, dxfText(value));
    if (angle) this.pair(50, angle);
    this.pair(72, 1); // centré
    this.point(11, p);
  }
}
