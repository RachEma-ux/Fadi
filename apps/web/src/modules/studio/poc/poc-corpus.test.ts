/**
 * G2-03 — POC autorisés (ADR-STUDIO-PILOTE-01 P-05) joués sur les corpus S1–S7 pertinents, résultats datés et
 * reproductibles. Toujours joué par `npm test` (tailles 100 et 10 000) ; avec `STUDIO_POC_SORTIE=<dossier sous
 * atelier-captures/>`, le rapport daté (`poc-corpus.json`, `poc-corpus.md` : date en heure suisse, commit, environnement,
 * graines, empreintes, verdicts, durées, commande de reproduction) est écrit — c'est ce que consigne le workflow
 * « Studio — POC des corpus » et le rapport versionné `docs/ai-team/reports/etat-studio/POC-CORPUS.json`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { GRAINES_CORPUS } from "@parcours/atelier-model/studio-corpus";
import { empreinteResultats, jouerPocs, poc2d, POC_HORS_CORPUS, type EmpreintesConservees, type ResultatPoc } from "./poc-corpus";

vi.setConfig({ testTimeout: 300_000 });
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const CONSERVE = JSON.parse(readFileSync(join(RACINE, "packages/atelier-model/src/studio/corpus/empreintes.json"), "utf8")) as EmpreintesConservees;
const horloge = () => performance.now();

/** Heure suisse (Europe/Zurich), ISO 8601 avec décalage. */
export function heureSuisse(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" }).formatToParts(d).map((x) => [x.type, x.value]));
  const decalage = String(p.timeZoneName).replace("GMT", "") || "+00:00";
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${decalage}`;
}

function rapportMarkdown(r: { date: string; commit: string; environnement: Record<string, string | number>; empreinte: string; resultats: ResultatPoc[] }): string {
  return [
    "# POC de la porte G2 sur les corpus S1–S7 (G2-03)", "",
    `Exécution du ${r.date} (heure suisse), commit \`${r.commit}\`. Empreinte des résultats déterministes : \`${r.empreinte}\`.`,
    "Périmètre autorisé : ADR-STUDIO-PILOTE-01 P-05 (contexte, 2D, association, chargement, index, conflit, reprise, publication).",
    "Reproduire : `STUDIO_POC_SORTIE=atelier-captures/poc-corpus npx --workspace=@fadi/web vitest run src/modules/studio/poc/poc-corpus.test.ts`.",
    "Les durées sont mesurées sans seuil ni verdict (DEC-13) et hors empreinte.", "",
    "## Environnement", "", ...Object.entries(r.environnement).map(([k, v]) => `- ${k} : ${v}`), "",
    "## Résultats", "", "| POC | Scène | Taille | Verdict | Valeurs | Durées (ms) |", "|---|---|---:|---|---|---|",
    ...r.resultats.map((x) => `| ${x.poc} | ${x.scene} | ${x.taille} | ${x.verdict}${x.ecarts.length ? ` (${x.ecarts.join(" ; ")})` : ""} | ${Object.entries(x.valeurs).map(([k, v]) => `${k}=${String(v).slice(0, 24)}`).join(", ")} | ${Object.entries(x.durees).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ")} |`),
    "", "## POC hors corpus", "", ...POC_HORS_CORPUS.map((x) => `- ${x.poc} : ${x.raison}`), "",
  ].join("\n");
}

describe("G2-03 — POC autorisés sur les corpus S1–S7", () => {
  const resultats = jouerPocs(CONSERVE, horloge);

  it("G2-03 [+] chaque POC autorisé, sur chaque corpus pertinent, est conforme à son oracle ou à sa référence conservée", () => {
    const pocs = new Set(resultats.map((r) => r.poc));
    expect([...pocs].sort()).toEqual(["2d", "3d", "association", "chargement", "conflit", "index", "publication", "reprise"]);
    expect(new Set(resultats.map((r) => r.scene))).toEqual(new Set(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]));
    expect(resultats.filter((r) => r.verdict !== "conforme").map((r) => `${r.poc} ${r.scene} ${r.taille} : ${r.ecarts.join(" ; ")}`)).toEqual([]);
    expect(POC_HORS_CORPUS.map((x) => x.poc)).toEqual(["contexte"]);
  });

  it("G2-03 [+] résultats reproductibles : deuxième exécution, même empreinte des résultats déterministes", () => {
    expect(empreinteResultats(jouerPocs(CONSERVE, horloge))).toBe(empreinteResultats(resultats));
  });

  it("G2-03 [−] une référence conservée altérée d'un octet fait passer le POC en écart", () => {
    const altere = structuredClone(CONSERVE);
    const e = altere.scenes.S1!["100"]!;
    e.corpus = `${e.corpus.slice(0, -1)}${e.corpus.endsWith("0") ? "1" : "0"}`;
    const r = poc2d("S1", 100, altere, horloge);
    expect(r.verdict).toBe("écart");
    expect(r.ecarts).toContain("empreinte du corpus = empreinte conservée");
  });

  it("G2-03 [+] rapport daté et reproductible : date en heure suisse, commit, environnement, graines, empreinte, commande", () => {
    expect(heureSuisse(new Date("2026-10-25T09:00:00Z"))).toBe("2026-10-25T10:00:00+01:00");
    expect(heureSuisse(new Date("2026-07-01T09:00:00Z"))).toBe("2026-07-01T11:00:00+02:00");
    const sortie = process.env.STUDIO_POC_SORTIE;
    if (!sortie) return;
    const captures = resolve(RACINE, "atelier-captures"), out = resolve(RACINE, sortie), rel = relative(captures, out);
    if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error(`STUDIO_POC_SORTIE doit être un sous-dossier de ${captures}${sep}`);
    const commit = process.env.STUDIO_POC_COMMIT ?? execFileSync("git", ["-C", RACINE, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const environnement = {
      node: process.versions.node, icu: process.versions.icu ?? "absent", plateforme: `${platform()} ${release()} (${arch()})`,
      processeur: `${cpus()[0]?.model ?? "inconnu"} × ${cpus().length}`, memoire: `${Math.round(totalmem() / 2 ** 30)} Gio`,
      execution: process.env.GITHUB_RUN_ID ? `GitHub Actions, exécution ${process.env.GITHUB_RUN_ID} (${process.env.GITHUB_WORKFLOW ?? ""})` : "poste local",
    };
    const rapport = {
      schema: "studio-poc-corpus/1", date: heureSuisse(new Date()), commit, environnement,
      autorisation: "ADR-STUDIO-PILOTE-01 P-05 (G2-02) : contexte, 2D, association, chargement, index, conflit, reprise, publication",
      graines: GRAINES_CORPUS, tailles: [100, 10_000], empreinte: empreinteResultats(resultats),
      commande: "STUDIO_POC_SORTIE=atelier-captures/poc-corpus npx --workspace=@fadi/web vitest run src/modules/studio/poc/poc-corpus.test.ts",
      horsCorpus: POC_HORS_CORPUS, resultats,
    };
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "poc-corpus.json"), `${JSON.stringify(rapport, null, 1)}\n`);
    writeFileSync(join(out, "poc-corpus.md"), rapportMarkdown(rapport));
  });
});
