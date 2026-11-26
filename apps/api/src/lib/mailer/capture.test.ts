import { mkdtempSync, readFileSync, existsSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capturerPourRecette } from "./capture.js";
import { readMailConfig } from "./index.js";

const dossier = () => mkdtempSync(join(tmpdir(), "fadi-capture-"));
const lien = "https://preprod.fadi.test/compte/creer#jeton=abc123";

describe("copie des courriels de recette (MAIL_CAPTURE_RECETTE, préproduction)", () => {
  it("absente par défaut ; chemin absolu exigé ; admise avec NODE_ENV=production (la préproduction y tourne)", () => {
    expect(readMailConfig({}).captureRecette).toBeNull();
    expect(readMailConfig({ NODE_ENV: "production", MAIL_CAPTURE_RECETTE: "/data/courriels/recette.jsonl" }).captureRecette).toBe("/data/courriels/recette.jsonl");
    expect(() => readMailConfig({ MAIL_CAPTURE_RECETTE: "recette.jsonl" })).toThrow(/chemin absolu/);
  });

  it("un domaine réservé est écrit au format du transport console, lisible par lib-invitations (API_LOG)", () => {
    const f = join(dossier(), "recette.jsonl");
    capturerPourRecette(f, { to: "sandbox-1@example.com", template: "signup", data: { link: lien }, locale: "fr" });
    const lignes = readFileSync(f, "utf8").trim().split("\n");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain('"to":"sandbox-1@example.com"');
    expect(JSON.parse(lignes[0]!).text).toContain(lien);
    expect(statSync(f).mode & 0o777).toBe(0o644);
  });

  it("une adresse réelle n'est jamais écrite", () => {
    const f = join(dossier(), "recette.jsonl");
    capturerPourRecette(f, { to: "roch@gmail.com", template: "signup", data: { link: lien } });
    expect(existsSync(f)).toBe(false);
  });

  it("au-delà de la taille maximale, le fichier repart vide ; un échec d'écriture ne lève jamais", () => {
    const f = join(dossier(), "recette.jsonl");
    writeFileSync(f, "x".repeat(200));
    capturerPourRecette(f, { to: "a@example.test", template: "signup", data: { link: lien } }, 100);
    expect(readFileSync(f, "utf8").startsWith("{")).toBe(true);
    expect(() => capturerPourRecette(join(dossier(), "absent", "x.jsonl"), { to: "a@example.com", template: "signup", data: { link: lien } })).not.toThrow();
  });
});
