/**
 * D.1-04 — instrumentation X émise par l'ordonnanceur de la session (`ordonnanceurStudio`) : chaque changement d'état
 * d'une tâche est noté dans le journal borné (`globalThis.__fadiTaches`) et dans le journal de corrélation
 * (`journalStudio`, identifiants non sensibles), la composition d'une feuille relève une mesure PERF-08 (aboutie ou en
 * échec), et l'exécution tient le moteur `calcul` du gestionnaire des ressources pendant la tâche seulement.
 *
 * Sans Worker (environnement de test) : le groupe exécute directement les mêmes traitements sur le fil principal.
 */
import { describe, expect, it } from "vitest";
import type { StudioDocument } from "@parcours/atelier-model";
import { ordonnanceurStudio, journalTaches } from "./pool-studio";
import { journalStudio, controlerJournal } from "./journal-correlation";
import { perfStudio } from "../chargement/perf";
import { ressourcesStudio } from "../chargement/ressources-studio";
import type { EvenementTache } from "./ordonnanceur";

const doc: StudioDocument = { id: "d1", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [{ id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }] } as StudioDocument;
const titre = { project: "Projet d'essai", title: "Feuille", author: "Fadi", date: "2026-10-25" };
const usagesTache = () => ressourcesStudio.instantaneEtats().find((e) => e.id === "calcul")!.usages.filter((u) => u.startsWith("tache:"));

describe("ordonnanceur de session : instrumentation X (D.1-04)", () => {
  it("journal __fadiTaches et journal de corrélation : file → exécution → aboutie, même jobId, commande d'origine reprise", async () => {
    const ord = ordonnanceurStudio();
    expect((globalThis as { __fadiTaches?: { journal: EvenementTache[] } }).__fadiTaches?.journal).toBe(journalTaches);
    const p = ord.soumettre({ cle: "feuille", classe: "interactive", nature: "feuille.composer", charge: { document: doc, options: { format: "A3", orientation: "paysage", scale: "ajuster", titleBlock: titre } },
      empreinte: { revision: "r-instr-1", parametres: "A3" }, commandId: "req-instr-1" });
    // Pendant la tâche, le moteur `calcul` est tenu par elle.
    await Promise.resolve();
    const issue = await p.issue;
    expect(issue.etat).toBe("done");
    const evts = journalTaches.filter((e) => e.revision === "r-instr-1");
    expect(evts.map((e) => e.etat)).toEqual(["queued", "running", "done"]);
    expect(new Set(evts.map((e) => e.jobId)).size).toBe(1);
    const jobId = evts[0]!.jobId;
    const lignes = journalStudio.entrees().filter((e) => e.type === "tache" && e.jobId === jobId);
    expect(lignes.map((e) => e.evenement)).toEqual(["queued", "running", "done"]);
    expect(lignes.every((e) => e.type === "tache" && e.commandId === "req-instr-1")).toBe(true);
    const fin = lignes[2]!;
    expect(fin.type === "tache" && typeof fin.dureeMs === "number").toBe(true);
    // Aucune charge ni géométrie dans le journal : le contrôle avant publication passe.
    expect(controlerJournal(journalStudio.entrees())).toEqual([]);
    // Le moteur est rendu après la tâche.
    expect(usagesTache()).toEqual([]);
  });

  it("PERF-08 : la composition de feuille relève une mesure aboutie, puis une mesure en échec (code de la tâche)", async () => {
    const ord = ordonnanceurStudio();
    const avant = perfStudio.mesures("PERF-08").length;
    const ok = await ord.soumettre({ cle: "feuille-2", classe: "fond", nature: "feuille.composer", charge: { document: doc, options: { format: "A4", orientation: "portrait", scale: 100, titleBlock: titre } },
      empreinte: { revision: "r-instr-2", parametres: "A4" } }).issue;
    expect(ok.etat).toBe("done");
    const ko = await ord.soumettre({ cle: "feuille-3", classe: "fond", nature: "feuille.composer", charge: null, empreinte: { revision: "r-instr-3", parametres: "x" } }).issue;
    expect(ko.etat).toBe("failed");
    const m = perfStudio.mesures("PERF-08").slice(avant);
    expect(m).toHaveLength(2);
    expect(m.map((x) => x.etiquettes.issue)).toEqual(["aboutie", "calcul"]);
    expect(m.every((x) => x.etiquettes.nature === "feuille.composer" && x.unite === "ms" && x.valeur >= 0)).toBe(true);
    // Une autre nature ne relève pas de PERF-08.
    await ord.soumettre({ cle: "q", classe: "fond", nature: "quantites.calculer", charge: { document: doc }, empreinte: { revision: "r-instr-4", parametres: "q" } }).issue;
    expect(perfStudio.mesures("PERF-08").slice(avant)).toHaveLength(2);
    expect(journalTaches.filter((e) => e.revision === "r-instr-3").map((e) => e.etat)).toEqual(["queued", "running", "failed"]);
  });
});
