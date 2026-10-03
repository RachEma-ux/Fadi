/**
 * Rapport d'import lisible (Markdown) : fonction pure, utilisée par le test qui tient à jour
 * `docs/atelier/lots/lot-1-rapport-import.md`.
 */
import type { RapportImport } from "../contrats/import.js";
import { LIBELLES_STATUT } from "../ontologie/provenance.js";

export interface SectionRapport {
  readonly titre: string;
  readonly lignes: readonly string[];
}

const echapper = (s: string) => s.replace(/\|/g, "\\|");

export function rapportImportMarkdown(rapport: RapportImport, sections: readonly SectionRapport[] = []): string {
  const l: string[] = [];
  l.push("# Lot 1 — Rapport d'import P.118 (L1.4)");
  l.push("");
  l.push("Généré par `packages/atelier-model/src/importeur/importer-p118.test.ts` (`ECRIRE_RAPPORT=1 npx vitest run`) ; ne pas éditer à la main.");
  l.push("Règles appliquées : cahier §6, D-021 (confirmées par D-022). Aucune valeur inventée : une valeur absente est « " + LIBELLES_STATUT["non-evaluee"] + " ».");
  l.push("");
  l.push("| Source | Valeur |");
  l.push("| --- | --- |");
  l.push(`| exampleId | ${rapport.source.exampleId ?? "—"} |`);
  l.push(`| sourceVersion | ${rapport.source.sourceVersion ?? "—"} |`);
  l.push(`| Empreinte de la source | \`${rapport.source.empreinteSource ?? "—"}\` |`);
  l.push(`| Empreinte du modèle produit | \`${rapport.empreinte}\` |`);
  l.push("");

  l.push("## Effectifs par famille");
  l.push("");
  l.push("| Famille | Source | Cible | Répartition des cibles |");
  l.push("| --- | ---: | ---: | --- |");
  for (const x of rapport.lignes) {
    const rep = x.parClasseCible ? Object.entries(x.parClasseCible).map(([c, n]) => `${c} ${n}`).join(", ") : "—";
    l.push(`| ${x.famille} | ${x.effectifSource} | ${x.effectifCible} | ${rep} |`);
  }
  l.push("");

  const niveaux = [...new Set(rapport.lignes.flatMap((x) => Object.keys(x.parNiveau ?? {})))];
  if (niveaux.length) {
    l.push("## Effectifs par niveau (source / cible)");
    l.push("");
    l.push(`| Famille | ${niveaux.join(" | ")} |`);
    l.push(`| --- | ${niveaux.map(() => "---:").join(" | ")} |`);
    for (const x of rapport.lignes) {
      if (!x.parNiveau) continue;
      l.push(`| ${x.famille} | ${niveaux.map((n) => (x.parNiveau?.[n] ? `${x.parNiveau[n]!.source} / ${x.parNiveau[n]!.cible}` : "—")).join(" | ")} |`);
    }
    l.push("");
  }

  l.push("## Transformations");
  l.push("");
  for (const x of rapport.lignes) {
    l.push(`- **${x.famille}**`);
    for (const t of x.transformations) l.push(`  - ${t}`);
  }
  l.push("");

  l.push("## Rôles inconnus");
  l.push("");
  if (rapport.rolesInconnus.length === 0) l.push("Aucun : tous les rôles de tracés rencontrés sont ceux du §6.");
  for (const r of rapport.rolesInconnus) l.push(`- \`${r.role}\` (${r.effectif}) : ${r.objetIds.join(", ")}`);
  l.push("");

  l.push("## Données non importées dans le modèle");
  l.push("");
  if (rapport.nonImporte.length === 0) l.push("Aucune.");
  for (const d of rapport.nonImporte) l.push(`- \`${d.chemin}\` — ${d.motif}`);
  l.push("");

  l.push("## Problèmes");
  l.push("");
  const parCode = new Map<string, number>();
  for (const p of rapport.problemes) parCode.set(`${p.code}|${p.gravite}`, (parCode.get(`${p.code}|${p.gravite}`) ?? 0) + 1);
  l.push("| Code | Gravité | Nombre |");
  l.push("| --- | --- | ---: |");
  for (const [k, n] of parCode) {
    const [code, gravite] = k.split("|");
    l.push(`| ${code} | ${gravite} | ${n} |`);
  }
  l.push("");
  const codes = [...new Set(rapport.problemes.map((p) => p.code))];
  for (const c of codes) {
    l.push(`### ${c}`);
    l.push("");
    for (const p of rapport.problemes.filter((x) => x.code === c)) l.push(`- ${echapper(p.message)}`);
    l.push("");
  }

  l.push("## Questions ouvertes");
  l.push("");
  if (rapport.questions.length === 0) l.push("Aucune.");
  for (const q of rapport.questions) l.push(`- ${q}`);
  l.push("");

  for (const s of sections) {
    l.push(`## ${s.titre}`);
    l.push("");
    for (const x of s.lignes) l.push(x);
    l.push("");
  }
  return `${l.join("\n").trimEnd()}\n`;
}
