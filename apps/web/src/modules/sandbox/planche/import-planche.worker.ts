/// <reference lib="webworker" />
/**
 * Travailleur d'import de la Planche (cas 4, étape 7a, D10-F14-027) : lecture du fichier (OBJ, STL, IFC) et construction
 * des maillages hors du fil principal, avec progression ; la Planche reste utilisable pendant l'import. Rien n'est posé
 * ici : le fil principal pose les contenus rendus (`poserImport`) en une seule opération, annulable. « Annuler » arrête
 * le travailleur : aucun effet sur le dessin.
 *
 * Borne de l'appareil : avant le premier import, un étalonnage construit et pose une gaufre de `TRIANGLES_ETALON`
 * triangles ; le débit mesuré (triangles par seconde) fixe la borne à `BUDGET_IMPORT_S` secondes de travail.
 */
import { construireImport, lireMaillages, modeleVide, poserImport, type ContenuImporte, type FormatImport, type MaillageLu } from "@parcours/sandbox-planche-model";

export const TRIANGLES_ETALON = 2000;

export type DemandeImport =
  | { readonly genre: "etalonner" }
  | { readonly genre: "importer"; readonly format: FormatImport; readonly donnees: string | Uint8Array; readonly echelle: number | null; readonly nom: string; readonly borne: number };

export type MessageImport =
  | { readonly genre: "etalon"; readonly trianglesParSeconde: number }
  | { readonly genre: "lu"; readonly triangles: number; readonly echelleFichier: number | null }
  | { readonly genre: "progression"; readonly fait: number; readonly total: number }
  | { readonly genre: "trop-gros"; readonly triangles: number; readonly borne: number }
  | { readonly genre: "fini"; readonly contenus: readonly ContenuImporte[]; readonly ignores: number; readonly echelle: number; readonly ms: number }
  | { readonly genre: "erreur"; readonly code: string; readonly message: string };

/** Gaufre de n × n cases, deux triangles par case (aucune fusion : cas le plus lent). */
export function gaufre(n: number): MaillageLu {
  const positions: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) positions.push(i, j, ((i * 7 + j * 13) % 5) * 0.1 + i * j * 1e-3);
  const triangles: number[] = [];
  const k = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) triangles.push(k(i, j), k(i + 1, j), k(i + 1, j + 1), k(i, j), k(i + 1, j + 1), k(i, j + 1));
  return { nom: "étalon", positions, triangles };
}

/** Débit mesuré : construction et pose d'une gaufre (la pose se fait ensuite dans le fil principal, comptée ici aussi). */
export function etalonner(): number {
  const g = gaufre(Math.round(Math.sqrt(TRIANGLES_ETALON / 2)));
  construireImport([g], 1); // mise en route du moteur JavaScript, non comptée
  const t0 = performance.now();
  const c = construireImport([g], 1);
  poserImport(modeleVide(), c.contenus, 0, 1);
  const ms = Math.max(performance.now() - t0, 1);
  return Math.round((g.triangles.length / 3 / ms) * 1000);
}

const porte = self as unknown as { onmessage: ((e: MessageEvent<DemandeImport>) => void) | null; postMessage(m: MessageImport): void };
const envoyer = (m: MessageImport): void => porte.postMessage(m);

porte.onmessage = (e) => {
  const d = e.data;
  try {
    if (d.genre === "etalonner") {
      envoyer({ genre: "etalon", trianglesParSeconde: etalonner() });
      return;
    }
    const lu = lireMaillages(d.format, d.donnees);
    const total = lu.maillages.reduce((n, x) => n + x.triangles.length / 3, 0);
    envoyer({ genre: "lu", triangles: total, echelleFichier: lu.echelleFichier });
    if (total > d.borne) {
      envoyer({ genre: "trop-gros", triangles: total, borne: d.borne });
      return;
    }
    const echelle = lu.echelleFichier ?? d.echelle ?? 1;
    const t0 = performance.now();
    let dernier = 0;
    const c = construireImport(lu.maillages, echelle, d.nom, (fait, tot) => {
      const maintenant = performance.now();
      if (maintenant - dernier > 80 || fait === tot) {
        dernier = maintenant;
        envoyer({ genre: "progression", fait, total: tot });
      }
    });
    envoyer({ genre: "fini", contenus: c.contenus, ignores: c.ignores, echelle, ms: performance.now() - t0 });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "illisible";
    envoyer({ genre: "erreur", code, message: err instanceof Error ? err.message : String(err) });
  }
};
