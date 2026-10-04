/**
 * Mesures de la vue 3D (L3b.3) — module pur : durées de trame (rendu d'une image après une interaction), p95 sur
 * une fenêtre glissante. Les valeurs sont imprimées par le scénario (`⏱`), jamais annoncées avant mesure (R14).
 */
export const FENETRE_TRAMES = 240;

export class MesuresTrames {
  private readonly durees: number[] = [];
  ajouter(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.durees.push(ms);
    if (this.durees.length > FENETRE_TRAMES) this.durees.shift();
  }
  get nombre(): number {
    return this.durees.length;
  }
  /** Quantile `q` (0–1) par rang le plus proche ; `null` sans mesure. */
  quantile(q: number): number | null {
    if (this.durees.length === 0) return null;
    const tri = [...this.durees].sort((a, b) => a - b);
    const i = Math.min(tri.length - 1, Math.max(0, Math.ceil(q * tri.length) - 1));
    return tri[i] as number;
  }
  vider(): void {
    this.durees.length = 0;
  }
}
