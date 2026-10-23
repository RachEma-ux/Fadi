/**
 * Anti-dérive du concept Gestion des comptes : le dossier du chantier cite le concept officiel v2.2 par empreinte.
 * Si le .docx ou le .md de « Fadi Concept/ » change sans que `concept.md` soit régénéré (`node scripts/users-concept.mjs
 * --write`), ce test échoue : la nouvelle version doit être relue avant que le code s'en réclame.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const racine = (rel: string) => new URL(`../../../../${rel}`, import.meta.url);
const sha = (rel: string) => createHash("sha256").update(readFileSync(racine(rel))).digest("hex");

describe("concept Users Management — anti-dérive", () => {
  const sums = readFileSync(racine("docs/workstreams/users-management/concept.md.sha256"), "utf8")
    .trim().split("\n").map((ligne) => { const [hash, ...rest] = ligne.split("  "); return { hash, file: rest.join("  ") }; });

  it("les trois empreintes sont déclarées", () => {
    expect(sums.map((s) => s.file)).toEqual([
      "Fadi Concept/Fadi Concept - Users Management.docx",
      "Fadi Concept/Fadi Concept - Users Management.md",
      "docs/workstreams/users-management/concept.md",
    ]);
  });

  it.each(["docx", "md", "concept"])("empreinte %s identique", (cle) => {
    const entree = sums[["docx", "md", "concept"].indexOf(cle)]!;
    expect(sha(entree.file), `${entree.file} a changé : régénérer concept.md (scripts/users-concept.mjs --write) et relire`).toBe(entree.hash);
  });

  it("concept.md recopie le .md officiel", () => {
    const concept = readFileSync(racine("docs/workstreams/users-management/concept.md"), "utf8");
    const officiel = readFileSync(racine("Fadi Concept/Fadi Concept - Users Management.md"), "utf8");
    expect(concept.endsWith(officiel)).toBe(true);
    expect(officiel).toContain("Version 2.2");
  });
});
