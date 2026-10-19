/**
 * Mesure des recherches spatiales (C.1-01) : contrôle léger du script (toujours joué : petites tailles, résultats
 * identiques entre index et parcours linéaire) et **mesure complète derrière `STUDIO_MESURE_SPATIALE=1`**
 * (`npm run mesure:recherches-spatiales --workspace=@fadi/web`) : corpus S1–S5 et S7 à 100 / 10 000 / 100 000
 * primitives, rapport `mesures.json` et `rapport.md` dans `OUT` (par défaut `atelier-captures/mesure-recherches-spatiales`
 * à la racine du dépôt, jamais versionné). Mesure seulement : aucune assertion de durée, aucun seuil.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENES_DOCUMENTS, TAILLES_ILLUSTRATIVES } from "@parcours/atelier-model/studio-corpus";
import { mesurerCorpus, rapportMarkdown, statistiques, type MesureCorpus } from "./mesure-spatiale";

const horloge = () => performance.now();

describe("Mesure des recherches spatiales : contrôle du script", () => {
  it("statistiques au rang le plus proche (valeurs effectivement mesurées)", () => {
    const s = statistiques([5, 1, 4, 2, 3]);
    expect([s.min, s.p50, s.p95, s.p99, s.max, s.moyenne]).toEqual([1, 3, 5, 5, 5, 3]);
    expect(statistiques([]).n).toBe(0);
  });
  it("mêmes sélections et mêmes candidats par l'index et par le parcours linéaire (S1, S2, S3, S4 à 100 et 1 000 primitives)", () => {
    for (const scene of ["S1", "S2", "S3", "S4"] as const) {
      for (const taille of [100, 1000]) {
        const m = mesurerCorpus(scene, taille, { requetes: 30, echauffement: 2, graine: 7, maintenant: horloge });
        expect(m.selection.divergences, `${scene} ${taille} sélection`).toBe(0);
        expect(m.accrochage.divergences, `${scene} ${taille} accrochage`).toBe(0);
        expect(m.selection.lineaire.n).toBe(30);
        expect(m.cheminActuel.seuil).toBeGreaterThan(0);
      }
    }
  });
  it("rapport sans seuil ni verdict", () => {
    const m = mesurerCorpus("S3", 100, { requetes: 5, echauffement: 0, graine: 1, maintenant: horloge });
    const md = rapportMarkdown([m], { date: "essai" });
    expect(md).toContain("aucun seuil, aucun verdict, aucun gain annoncé");
    expect(md).toContain("| S3 | 100 |");
  });
});

describe.skipIf(process.env.STUDIO_MESURE_SPATIALE !== "1")("Mesure complète (STUDIO_MESURE_SPATIALE=1)", () => {
  it("S1–S5, S7 × 100 / 10 000 / 100 000 primitives : rapport écrit dans OUT", () => {
    const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
    const out = resolve(racine, process.env.OUT ?? "atelier-captures/mesure-recherches-spatiales");
    mkdirSync(out, { recursive: true });
    const requetes = Number(process.env.REQUETES ?? "100");
    const tailles = (process.env.TAILLES ?? TAILLES_ILLUSTRATIVES.join(",")).split(",").map(Number);
    const mesures: MesureCorpus[] = [];
    for (const scene of SCENES_DOCUMENTS) {
      for (const taille of tailles) {
        const m = mesurerCorpus(scene, taille, { requetes, echauffement: 5, graine: 2026, maintenant: horloge });
        mesures.push(m);
        console.log(`${scene} ${taille} : sélection p50 linéaire ${m.selection.lineaire.p50.toFixed(3)} ms / index ${m.selection.indexe.p50.toFixed(3)} ms ; accrochage p50 ${m.accrochage.lineaire.p50.toFixed(3)} / ${m.accrochage.indexe.p50.toFixed(3)} ms ; divergences ${m.selection.divergences} / ${m.accrochage.divergences}`);
      }
    }
    const environnement = {
      date: new Date().toISOString(), node: process.version, plateforme: `${platform()} ${release()}`, processeur: cpus()[0]?.model ?? "non relevé", coeurs: cpus().length,
      memoire: `${Math.round(totalmem() / 2 ** 30)} Gio`, commit: process.env.GITHUB_SHA ?? process.env.COMMIT ?? "non relevé", requetes, echauffement: 5, graine: 2026,
      methode: "performance.now() autour de chaque requête, même suite de requêtes pour les deux chemins, échauffement non compté ; quantiles au rang le plus proche",
      avertissement: "Mesure seulement, sans seuil ni verdict (DEC-13) ; aucun gain annoncé ; tailles illustratives (X.1-10) ; un seul processus Node, sans navigateur ni GPU.",
    };
    writeFileSync(join(out, "mesures.json"), `${JSON.stringify({ environnement, mesures }, null, 2)}\n`);
    writeFileSync(join(out, "rapport.md"), `${rapportMarkdown(mesures, environnement)}\n`);
    console.log(`rapport : ${join(out, "rapport.md")}`);
    expect(mesures.length).toBe(SCENES_DOCUMENTS.length * tailles.length);
  }, 3_600_000);
});
