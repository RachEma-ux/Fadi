/**
 * Saisie de longueurs en unités non métriques (D-130, DA-01-01) : une longueur tapée avec son unité — mm, cm, m, km,
 * pouces (in, po, ″, ") ou pieds (ft, pi, ′, ') et la forme pieds-pouces (3'6", 3 ft 6 in) — est convertie
 * explicitement en mètres (facteurs exacts : 1 in = 0,0254 m, 1 ft = 0,3048 m) ; le modèle ne stocke que des mètres
 * et le champ affiche la valeur convertie. Sans unité : mètres, calcul compris (`nombreSaisi`).
 */
import { nombreSaisi } from "./scripts.js";

const FACTEURS: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, po: 0.0254, '"': 0.0254, "″": 0.0254, ft: 0.3048, pi: 0.3048, "'": 0.3048, "′": 0.3048 };
const NOMBRE = String.raw`[-+]?\d+(?:[.,]\d+)?`;
const PIEDS = String.raw`(?:ft|pi|'|′)`;
const POUCES = String.raw`(?:in|po|"|″)`;

export function longueurSaisie(texte: string): number | null {
  const t = texte.trim().toLowerCase();
  if (!t) return null;
  const n = (s: string) => Number(s.replace(",", "."));
  const r9 = (v: number) => Math.round(v * 1e9) / 1e9;
  const pp = new RegExp(`^(${NOMBRE})\\s*${PIEDS}\\s*(${NOMBRE})\\s*${POUCES}?$`).exec(t);
  if (pp) return r9(n(pp[1]!) * 0.3048 + Math.sign(n(pp[1]!) || 1) * n(pp[2]!) * 0.0254);
  const u = new RegExp(`^(${NOMBRE})\\s*(mm|cm|km|m|in|po|"|″|ft|pi|'|′)$`).exec(t);
  if (u) return r9(n(u[1]!) * FACTEURS[u[2]!]!);
  return nombreSaisi(texte);
}
