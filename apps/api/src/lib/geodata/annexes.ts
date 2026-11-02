/**
 * Annexes de fiche (D-GD-37) : lecture contrôlée des concepts du producteur. Partagée par l'import de référence et ses
 * tests (sans base de données).
 */
import type { ConceptAnnexe } from "./versions.js";

/** Concepts du producteur : une entrée par concept et par langue (fr, ar), titre et texte non vides, ordre unique. */
export function lireConcepts(contenu: unknown): { source: string; liste: ConceptAnnexe[] } {
  const c = contenu as { source?: unknown; concepts?: unknown };
  if (typeof c?.source !== "string" || !c.source.trim() || !Array.isArray(c.concepts)) throw new Error("Annexe des concepts : { source, concepts: [...] } attendu.");
  const vus = new Set<string>();
  const liste = c.concepts.map((x: { langue?: unknown; ordre?: unknown; titre?: unknown; texte?: unknown }, i) => {
    if ((x.langue !== "fr" && x.langue !== "ar") || !Number.isInteger(x.ordre) || typeof x.titre !== "string" || !x.titre.trim() || typeof x.texte !== "string") throw new Error(`Annexe des concepts : entrée ${i} invalide.`);
    const k = `${x.langue}:${x.ordre}`;
    if (vus.has(k)) throw new Error(`Annexe des concepts : ordre ${k} en double.`);
    vus.add(k);
    return { langue: x.langue as ConceptAnnexe["langue"], ordre: x.ordre as number, titre: x.titre, texte: x.texte };
  });
  return { source: c.source, liste };
}

