/**
 * Mesure des recherches spatiales (C.1-01) : contrôle léger du script (toujours joué : petites tailles, résultats
 * identiques entre index et parcours linéaire) et **mesure complète derrière `STUDIO_MESURE_SPATIALE=1`**
 * (`npm run mesure:recherches-spatiales --workspace=@fadi/web`) : corpus S1–S5 et S7 à 100 / 10 000 / 100 000
 * primitives, rapport `mesures.json` et `rapport.md` dans `STUDIO_MESURE_OUT` (par défaut
 * `atelier-captures/mesure-recherches-spatiales`). Le dossier de sortie est **toujours** sous `<racine>/atelier-captures/`
 * (jamais versionné) : tout autre chemin est refusé. Mesure seulement : aucune assertion de durée, aucun seuil.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { alea, genererCorpus, SCENES_DOCUMENTS, TAILLES_ILLUSTRATIVES } from "@parcours/atelier-model/studio-corpus";
import { MODES_ACCROCHAGE, boiteEntite, indexAccrochage, indexLineaire, rangRepere, resoudre, type ReglagesAccrochage, type Repere } from "./accrochage";
import { contoursMurs } from "./architecture/architecture-ui";
import { estVisible } from "./calques";
import { documentDeMesure, mesurerCorpus, rapportMarkdown, statistiques, type MesureCorpus } from "./mesure-spatiale";

const horloge = () => performance.now();
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

/** Dossier de sortie de la mesure : résolu depuis la racine du dépôt, refusé hors de `<racine>/atelier-captures/`. */
function dossierSortieMesure(racine: string, demande: string | undefined): string {
  const captures = resolve(racine, "atelier-captures");
  const out = resolve(racine, demande ?? "atelier-captures/mesure-recherches-spatiales");
  const rel = relative(captures, out);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`STUDIO_MESURE_OUT doit désigner un sous-dossier de ${captures}${sep} (reçu : ${demande ?? "(défaut)"}) : la mesure n'écrit jamais ailleurs.`);
  }
  return out;
}

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
  it("TEST-022 — S1–S3 : même repère résolu (point, genre, objet, priorité) par l'index et le parcours linéaire", () => {
    // Même règle que l'éditeur (`outils/gestes.ts`) : objets visibles et contours des murs visibles ; tous les modes.
    const reglages: ReglagesAccrochage = { objets: true, modes: new Set(MODES_ACCROCHAGE), orthogonal: false, polaire: false, pasPolaire: 45 };
    const resume = (x: Repere | null) => x && { point: x.point, genre: x.genre, objets: x.objets, ancre: x.ancre, priorite: rangRepere(x.genre) };
    for (const scene of ["S1", "S2", "S3"] as const) {
      const doc = documentDeMesure(genererCorpus(scene, 1000).documents);
      const formes = [...doc.objects.filter((x) => estVisible(doc, x.layerId)), ...contoursMurs(doc, (l) => estVisible(doc, l))];
      const lin = indexLineaire(formes), idx = indexAccrochage(formes, 0);
      const boites = lin.formes({ min: { x: -Infinity, y: -Infinity }, max: { x: Infinity, y: Infinity } }).flatMap((f) => f.entites.map(boiteEntite));
      expect(boites.length, `${scene} entités`).toBeGreaterThan(0);
      // 100 requêtes reproductibles : pointeur près d'une entité tirée (coin de sa boîte, décalé), un sur deux avec un dernier point.
      const r = alea(22);
      let trouves = 0;
      for (let i = 0; i < 100; i++) {
        const b = boites[Math.floor(r.reel() * boites.length)]!;
        const coin = r.reel() < 0.5 ? b.min : b.max;
        const curseur = { x: coin.x + (r.reel() - 0.5) * 0.4, y: coin.y + (r.reel() - 0.5) * 0.4 };
        const base = i % 2 === 0 ? null : { x: curseur.x + (r.reel() - 0.5) * 6, y: curseur.y + (r.reel() - 0.5) * 6 };
        const q = { curseur, tolerance: 0.1 + r.reel() * 0.2, base };
        const attendu = resoudre(lin, q, reglages);
        expect(resume(resoudre(idx, q, reglages)), `${scene} requête ${i}`).toEqual(resume(attendu));
        if (attendu) trouves++;
      }
      // Les requêtes accrochent effectivement (le contrôle ne compare pas que des absences de repère).
      expect(trouves, `${scene} repères trouvés`).toBeGreaterThan(20);
    }
  });
  it("sortie forcée sous <racine>/atelier-captures/ : STUDIO_MESURE_OUT hors de ce dossier refusé", () => {
    const r = resolve("/depot");
    expect(dossierSortieMesure(r, undefined)).toBe(resolve(r, "atelier-captures/mesure-recherches-spatiales"));
    expect(dossierSortieMesure(r, "atelier-captures/essai")).toBe(resolve(r, "atelier-captures/essai"));
    expect(dossierSortieMesure(r, resolve(r, "atelier-captures/a/b"))).toBe(resolve(r, "atelier-captures/a/b"));
    for (const refuse of ["atelier-captures", "atelier-captures/../docs", "docs/atelier/captures", "/tmp/mesure", "../hors-depot", "atelier-captures-bis/x"]) {
      expect(() => dossierSortieMesure(r, refuse), refuse).toThrow(/STUDIO_MESURE_OUT/);
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
  it("S1–S5, S7 × 100 / 10 000 / 100 000 primitives : rapport écrit dans STUDIO_MESURE_OUT (sous atelier-captures/)", () => {
    const out = dossierSortieMesure(RACINE, process.env.STUDIO_MESURE_OUT);
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
