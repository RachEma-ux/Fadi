import { describe, expect, it } from "vitest";
/**
 * X.3-01 — les 141 fiches de traçabilité (EX, INV, IF, AC) reliées aux lots et aux composants candidats SANS changer
 * leurs identifiants, contrôlé contre la source elle-même : le référentiel technique REF-02
 * (`Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx`, `word/document.xml`, paragraphes `w:p` numérotés à
 * partir de 1, comme `studio-tracabilite.test.ts`).
 *
 * - Couverture complète : l'ensemble des identifiants définis par REF-02 (paragraphe « XX-nnn — … ») est exactement
 *   celui des fiches (`docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json`) et celui des tâches TR-* du
 *   registre (`docs/workstreams/studio/task-register.json`) ; aucun identifiant ajouté, perdu ou renuméroté.
 * - Identifiants inchangés : chaque fiche cite le paragraphe de REF-02 où son identifiant est défini, et son
 *   `texte_exact` commence par le texte de ce paragraphe (identifiant compris) ; la tâche du registre est `TR-<id>`.
 * - Liens : chaque fiche porte au moins un lot du Plan (lettres I, A, B, C, D, E, F, R, X ; « pilotage » et « option »
 *   précisent seulement) et au moins un composant candidat nommé.
 * Pur : lecture de fichiers du dépôt et décompression `zlib`, sans base ni réseau.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { paragraphesDocx } from "./sources-tracabilite.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const lire = (chemin: string) => readFileSync(`${RACINE}${chemin}`);
const REF02 = "Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx";
const FICHES = "docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json";
const REGISTRE = "docs/workstreams/studio/task-register.json";
const ID = /^(EX|INV|IF|AC)-\d{3}\b/;

interface Fiche { id: string; type: string; task_source: string; source_path: string; source_paragraphs: number[]; texte_exact: string; lot: string; composants_candidats: { chemin: string }[] }

const paragraphes = paragraphesDocx(lire(REF02));
/**
 * Identifiants définis par REF-02 (définition, pas une simple citation) : paragraphe « EX-nnn — … » / « IF-nnn — … »,
 * « AC-nnn. … », ou cellule de tableau réduite à l'identifiant (« INV-nnn », libellé dans le paragraphe suivant).
 */
const definis = new Map<string, number>();
paragraphes.forEach((p, i) => {
  const m = /^((?:EX|INV|IF|AC)-\d{3})(?: — |\. |$)/.exec(p.trim());
  if (m && !definis.has(m[1]!)) definis.set(m[1]!, i + 1);
});
const fiches = (JSON.parse(lire(FICHES).toString("utf8")) as { fiches: Fiche[] }).fiches;
const registre = (JSON.parse(lire(REGISTRE).toString("utf8")) as { tasks: { id: string }[] }).tasks;

describe("X.3-01 : fiches EX / INV / IF / AC reliées sans changer leurs identifiants (contrôle contre REF-02)", () => {
  it("REF-02 définit 141 identifiants : 104 EX, 15 INV, 11 IF, 11 AC", () => {
    const parType = (t: string) => [...definis.keys()].filter((k) => k.startsWith(`${t}-`)).length;
    expect({ total: definis.size, EX: parType("EX"), INV: parType("INV"), IF: parType("IF"), AC: parType("AC") }).toEqual({ total: 141, EX: 104, INV: 15, IF: 11, AC: 11 });
  });

  it("couverture complète : identifiants des fiches = identifiants de REF-02 = tâches TR-* du registre, sans doublon", () => {
    const ids = fiches.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...definis.keys()].sort());
    const tr = registre.map((t) => t.id).filter((id) => id.startsWith("TR-")).map((id) => id.slice(3));
    expect(new Set(tr).size).toBe(tr.length);
    expect([...tr].sort()).toEqual([...definis.keys()].sort());
  });

  it("identifiants inchangés : chaque fiche cite son paragraphe de définition dans REF-02, son texte exact en part, sa tâche est TR-<id>", () => {
    const ecarts: string[] = [];
    for (const f of fiches) {
      const n = f.source_paragraphs[0]!;
      const p = (paragraphes[n - 1] ?? "").trim();
      if (f.source_path !== REF02) ecarts.push(`${f.id} : source ${f.source_path}`);
      if (definis.get(f.id) !== n) ecarts.push(`${f.id} : paragraphe cité ${n}, défini en ${definis.get(f.id)}`);
      if (!ID.test(p) || !(p === f.id || p.startsWith(`${f.id} `) || p.startsWith(`${f.id}.`))) ecarts.push(`${f.id} : paragraphe ${n} = « ${p.slice(0, 40)} »`);
      // Cellule réduite à l'identifiant : le texte exact est le libellé du paragraphe suivant, cité lui aussi.
      const texte = p === f.id ? (paragraphes[n] ?? "").trim() : p;
      if (p === f.id && f.source_paragraphs[1] !== n + 1) ecarts.push(`${f.id} : libellé (paragraphe ${n + 1}) non cité`);
      if (!texte || !f.texte_exact.startsWith(texte)) ecarts.push(`${f.id} : texte exact différent du paragraphe ${p === f.id ? n + 1 : n}`);
      if (f.type !== f.id.split("-")[0] || f.task_source !== `TR-${f.id}`) ecarts.push(`${f.id} : type ${f.type}, tâche ${f.task_source}`);
    }
    expect(ecarts).toEqual([]);
  });

  it("liens : chaque fiche porte un lot du Plan et au moins un composant candidat nommé", () => {
    const ecarts = fiches.filter((f) => {
      const lettres = f.lot.split("/").map((x) => x.trim().split(" ")[0]!);
      return !lettres.length || lettres.some((l) => !/^([IABCDEFRX]|pilotage)$/.test(l)) || !lettres.some((l) => /^[IABCDEFRX]$/.test(l)) || !Array.isArray(f.composants_candidats) || f.composants_candidats.length === 0
        || f.composants_candidats.some((c) => typeof c.chemin !== "string" || !c.chemin.trim());
    }).map((f) => `${f.id} : lot « ${f.lot} », ${f.composants_candidats?.length ?? 0} composant(s)`);
    expect(ecarts).toEqual([]);
  });
});
