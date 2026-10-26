/**
 * EX-059 — isolation du calcul lourd : « Le fil principal assure événements, retours immédiats et rendu. » Cas positif
 * prescrit : soumettre un booléen lourd avec mesures et observer l'interaction disponible via le Worker ; cas négatif :
 * un calcul coûteux qui bloque durablement l'interface reste visible comme tel.
 *
 * Pur : verdict d'une mesure de réactivité prise **pendant** un calcul confié à un Worker (lecture DXF, booléen exact…).
 * - « disponible » : calcul hors du fil principal, assez long pour juger (au moins le budget INP), trames continues
 *   (≥ 3), la plus longue trame sous le budget INP et sous la moitié de la durée du calcul, et chaque interaction
 *   mesurée pendant le calcul sous le budget INP (DEC-13) ;
 * - « bloque » : une de ces conditions échoue alors que le calcul était assez long ;
 * - « non-evalue » : calcul trop court pour juger, ou aucune interaction mesurée pendant le calcul.
 */
import { STUDIO_BUDGETS_CWV } from "./core-web-vitals.js";

export interface StudioMesureReactivite {
  /** Nature du calcul (p. ex. « booléen exact OCCT », « lecture DXF »). */
  calcul: string;
  calculMs: number;
  /** Calcul exécuté dans un Worker (false : sur le fil principal, ou repli). */
  surWorker: boolean;
  trames: number;
  trameMaxMs: number;
  /** Durées (Event Timing) des interactions faites pendant le calcul. */
  interactionsMs: readonly number[];
}

export interface StudioVerdictReactivite { verdict: "disponible" | "bloque" | "non-evalue"; motifs: string[]; budgetInpMs: number }

export function studioJugerReactivite(m: StudioMesureReactivite, budgetInpMs: number = STUDIO_BUDGETS_CWV.inpMs): StudioVerdictReactivite {
  const motifs: string[] = [];
  if (!(m.calculMs >= budgetInpMs)) return { verdict: "non-evalue", motifs: [`calcul de ${m.calculMs.toFixed(0)} ms, plus court que le budget INP (${budgetInpMs} ms) : rien à juger`], budgetInpMs };
  if (m.interactionsMs.length === 0) return { verdict: "non-evalue", motifs: ["aucune interaction mesurée pendant le calcul"], budgetInpMs };
  if (!m.surWorker) motifs.push("calcul sur le fil principal (aucun Worker)");
  if (m.trames < 3) motifs.push(`${m.trames} trame(s) pendant le calcul : rendu interrompu`);
  if (m.trameMaxMs > budgetInpMs) motifs.push(`trame la plus longue ${m.trameMaxMs.toFixed(1)} ms > ${budgetInpMs} ms`);
  if (m.trameMaxMs >= m.calculMs / 2) motifs.push(`trame la plus longue ${m.trameMaxMs.toFixed(1)} ms ≥ moitié du calcul (${(m.calculMs / 2).toFixed(0)} ms)`);
  const lentes = m.interactionsMs.filter((d) => d > budgetInpMs);
  if (lentes.length) motifs.push(`${lentes.length} interaction(s) au-delà de ${budgetInpMs} ms : ${lentes.join(", ")}`);
  return { verdict: motifs.length ? "bloque" : "disponible", motifs, budgetInpMs };
}
