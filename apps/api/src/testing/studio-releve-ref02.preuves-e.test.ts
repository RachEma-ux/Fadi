import { describe, expect, it } from "vitest";
/**
 * G1-02 — « Relever toutes les exigences du référentiel dans le registre de traçabilité ». Comparaison, identifiant par
 * identifiant, de la source officielle REF-02 (`Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx`, texte des
 * paragraphes `w:p` numérotés à partir de 1) avec les fiches (`studio-141-fiches-v2.json`) et le registre
 * (`docs/workstreams/studio/task-register.json`) :
 *  - toute exigence EX, tout contrat IF, tout critère AC et tout invariant INV de la source a sa fiche, au paragraphe et au
 *    texte exacts, et sa tâche `TR-<id>` dans le registre, qui pointe vers cette fiche ;
 *  - aucune fiche ni tâche `TR-` n'est sans source (rien d'ajouté, rien d'omis) ; les quatre familles restent distinctes.
 * Pur : aucune base, aucun réseau.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { paragraphesDocx } from "./sources-tracabilite.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const REF02 = "Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx";
const FICHES = "docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json";
const REGISTRE = "docs/workstreams/studio/task-register.json";

interface Fiche { id: string; type: string; task_source: string; texte_exact: string; source_paragraphs: number[] }
interface Tache { id: string; fiche_active?: string }
interface Releve { id: string; type: "EX" | "IF" | "AC" | "INV"; paragraphe: number; texte: string }

/** Identifiants relevés dans les paragraphes de la source : EX/IF « ID — titre », AC « ID. texte », INV cellule « ID » suivie de son énoncé. */
export function releverSource(p: readonly string[]): Releve[] {
  const out: Releve[] = [];
  p.forEach((texte, i) => {
    let m = /^(EX|IF)-\d{3} — /.exec(texte);
    if (m) { out.push({ id: texte.slice(0, m[0].length - 3), type: m[1] as "EX" | "IF", paragraphe: i + 1, texte }); return; }
    m = /^AC-\d{3}\. /.exec(texte);
    if (m) { out.push({ id: texte.slice(0, 6), type: "AC", paragraphe: i + 1, texte }); return; }
    if (/^INV-\d{3}$/.test(texte)) out.push({ id: texte, type: "INV", paragraphe: i + 1, texte: p[i + 1] ?? "" });
  });
  return out;
}

/** Écarts entre le relevé de la source et les fiches / le registre (vide : relevé complet et exact). */
export function ecartsReleve(source: readonly Releve[], fiches: readonly Fiche[], taches: readonly Tache[]): string[] {
  const ecarts: string[] = [];
  const parFiche = new Map(fiches.map((f) => [f.id, f]));
  const parTache = new Map(taches.filter((t) => t.id.startsWith("TR-")).map((t) => [t.id, t]));
  const vus = new Set<string>();
  for (const s of source) {
    if (vus.has(s.id)) ecarts.push(`${s.id} : doublon dans la source`);
    vus.add(s.id);
    const f = parFiche.get(s.id);
    if (!f) { ecarts.push(`${s.id} : aucune fiche`); continue; }
    if (f.type !== s.type) ecarts.push(`${s.id} : famille ${f.type} au lieu de ${s.type}`);
    if (f.source_paragraphs[0] !== s.paragraphe) ecarts.push(`${s.id} : paragraphe ${f.source_paragraphs[0]} au lieu de ${s.paragraphe}`);
    if (f.texte_exact !== s.texte) ecarts.push(`${s.id} : texte différent de la source`);
    const t = parTache.get(`TR-${s.id}`);
    if (!t) ecarts.push(`${s.id} : aucune tâche TR-${s.id} au registre`);
    else if (f.task_source !== t.id || !t.fiche_active?.endsWith(`#${s.id}`)) ecarts.push(`${s.id} : tâche non reliée à sa fiche`);
  }
  for (const f of fiches) if (!vus.has(f.id)) ecarts.push(`${f.id} : fiche sans source`);
  for (const id of parTache.keys()) if (!vus.has(id.slice(3))) ecarts.push(`${id} : tâche sans source`);
  return ecarts;
}

const lire = (c: string) => readFileSync(`${RACINE}${c}`);
const source = () => releverSource(paragraphesDocx(lire(REF02)));
const fiches = () => (JSON.parse(lire(FICHES).toString("utf8")) as { fiches: Fiche[] }).fiches;
const taches = () => (JSON.parse(lire(REGISTRE).toString("utf8")) as { tasks: Tache[] }).tasks;

describe("G1-02 — relevé de toutes les exigences de REF-02 dans le registre de traçabilité", () => {
  it("G1-02 [−] relevé construit : exigence omise, texte altéré, fiche ou tâche sans source, tâche non reliée → écarts nommés", () => {
    const src: Releve[] = [
      { id: "EX-001", type: "EX", paragraphe: 10, texte: "EX-001 — A." },
      { id: "EX-002", type: "EX", paragraphe: 11, texte: "EX-002 — B." },
    ];
    const f: Fiche[] = [
      { id: "EX-001", type: "EX", task_source: "TR-EX-001", texte_exact: "EX-001 — A (modifié).", source_paragraphs: [10] },
      { id: "EX-009", type: "EX", task_source: "TR-EX-009", texte_exact: "EX-009 — Z.", source_paragraphs: [99] },
    ];
    const t: Tache[] = [{ id: "TR-EX-001", fiche_active: "x.json#EX-002" }, { id: "TR-EX-009", fiche_active: "x.json#EX-009" }];
    expect(ecartsReleve(src, f, t)).toEqual([
      "EX-001 : texte différent de la source", "EX-001 : tâche non reliée à sa fiche", "EX-002 : aucune fiche",
      "EX-009 : fiche sans source", "TR-EX-009 : tâche sans source",
    ]);
  });

  it("G1-02 [+] source réelle : 104 EX, 11 IF, 11 AC et 15 INV relevés, chacun avec sa fiche exacte et sa tâche TR- au registre, rien d'omis ni d'ajouté", () => {
    const s = source();
    const compte = (type: string) => s.filter((x) => x.type === type).length;
    expect([compte("EX"), compte("IF"), compte("AC"), compte("INV")]).toEqual([104, 11, 11, 15]);
    expect(ecartsReleve(s, fiches(), taches())).toEqual([]);
  });
});
