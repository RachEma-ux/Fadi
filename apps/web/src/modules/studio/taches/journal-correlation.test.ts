/**
 * EX-095 — observabilité (REF-02 w:p 911) : latence, mémoire, erreurs et tâches corrélées par identifiants non
 * sensibles de commande et de tâche ; un journal qui contiendrait un secret ou de la géométrie échoue au contrôle et
 * n'est pas publié. Vrai ordonnanceur, faux exécuteur, horloge et mémoire injectées.
 */
import { describe, expect, it } from "vitest";
import type { StudioCommand } from "@parcours/atelier-model";
import { controlerJournal, ErreurJournal, exporterJournal, JournalCorrelation } from "./journal-correlation";
import { Ordonnanceur } from "./ordonnanceur";

const lot = (requestId: string, commands: StudioCommand[]) => ({ contractVersion: "studio-commands/1", requestId, baseRevisionId: "studio_revision_r1", commands });
const ligne = (id: string): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 12.5, y: -3.25 }, end: { x: 98.125, y: 41.5 } } } as StudioCommand);

function banc() {
  let t = 1000;
  const journal = new JournalCorrelation({ horloge: () => t, memoire: () => 52_428_800 });
  const resolutions: ((v: unknown) => void)[] = [];
  const ord = new Ordonnanceur({ executer: () => new Promise((r) => { resolutions.push(r); }), delaiMs: 60_000, gardeMs: 0, surEvenement: (e) => journal.noterTache(e) });
  return { journal, ord, resolutions, avancer: (ms: number) => { t += ms; } };
}
const attendre = () => new Promise((r) => setTimeout(r, 0));

describe("EX-095 — journal de corrélation commande ↔ tâche", () => {
  it("EX-095 [+] latence, mémoire et erreurs corrélées par commandId (lot) et jobId (tâche), sans contenu", async () => {
    const { journal, ord, resolutions, avancer } = banc();
    // Commande confirmée : sa révision rattache les tâches qui la lisent.
    const issue = journal.noterCommande(lot("cmd-7f3a", [ligne("a"), ligne("b")]));
    avancer(40);
    issue("confirmee", { revision: "studio_revision_r2" });
    const p = ord.soumettre({ cle: "studio.maillage-3d", classe: "fond", nature: "maillage", charge: { document: "…" }, empreinte: { revision: "studio_revision_r2", parametres: "h" } });
    avancer(120);
    resolutions[0]!({ ok: true });
    await attendre();
    expect((await p.issue).etat).toBe("done");
    // Commande déclarée par la demande elle-même.
    const q = ord.soumettre({ cle: "feuille.composer", classe: "interactive", nature: "feuille", charge: {}, empreinte: { revision: "studio_revision_r9", parametres: "x" }, commandId: "cmd-explicite" });
    resolutions[1]!({});
    await attendre();
    await q.issue;
    // Refus : statut et code seuls.
    journal.noterCommande(lot("cmd-refus", [ligne("c")]))("refusee", { statut: 409, code: "revision_conflict" });

    const c = journal.correler();
    expect(c).toEqual([
      { commandId: "cmd-7f3a", revision: "studio_revision_r2", jobIds: ["job-1"], refus: 0 },
      { commandId: "cmd-explicite", revision: null, jobIds: ["job-2"], refus: 0 },
      { commandId: "cmd-refus", revision: null, jobIds: [], refus: 1 },
    ]);
    const entrees = journal.entrees();
    expect(entrees.find((e) => e.type === "commande" && e.evenement === "confirmee")).toMatchObject({ commandId: "cmd-7f3a", dureeMs: 40, outils: ["studio.dessin.ligne"], nombre: 2 });
    expect(entrees.find((e) => e.type === "tache" && e.evenement === "done" && e.jobId === "job-1")).toMatchObject({ commandId: "cmd-7f3a", dureeMs: 120, memoireOctets: 52_428_800 });
    expect(entrees.find((e) => e.type === "commande" && e.evenement === "refusee")).toMatchObject({ statut: 409, code: "revision_conflict" });
  });

  it("EX-095 [−] le journal produit ne contient ni secret ni géométrie : contrôle vide, export admis", async () => {
    const { journal, ord, resolutions } = banc();
    journal.noterCommande(lot("cmd-1", [ligne("a"), ligne("b")]))("confirmee", { revision: "studio_revision_r2" });
    const p = ord.soumettre({ cle: "studio.maillage-3d", classe: "fond", nature: "maillage", charge: { points: [[12.5, -3.25]] }, empreinte: { revision: "studio_revision_r2", parametres: "h" } });
    resolutions[0]!({ sommets: [1, 2, 3] });
    await attendre();
    await p.issue;
    const texte = JSON.stringify(journal.entrees());
    for (const indice of ["12.5", "-3.25", "98.125", "41.5", "start", "params", "points", "sommets", "charge"]) expect(texte, indice).not.toContain(indice);
    expect(controlerJournal(journal.entrees())).toEqual([]);
    expect(JSON.parse(exporterJournal(journal.entrees())).entrees).toHaveLength(journal.entrees().length);
  });

  it("EX-095 [−] un secret ou une géométrie dans le journal fait échouer le contrôle et empêche l'export", () => {
    const base = { type: "commande", t: 1, commandId: "cmd-1", evenement: "refusee", outils: ["studio.dessin.ligne"], nombre: 1 };
    const cas: [Record<string, unknown>, string][] = [
      [{ ...base, code: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl" }, "secret"],
      [{ ...base, code: "password=hunter2" }, "secret"],
      [{ ...base, code: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl" }, "secret"],
      [{ ...base, token: "abc" }, "secret"],
      [{ ...base, code: "ecrit par alice@exemple.test" }, "courriel"],
      [{ ...base, params: { start: { x: 1, y: 2 } } }, "geometrie"],
      [{ ...base, outils: [12.5, 3] }, "geometrie"],
      [{ ...base, revision: "{\"x\":12.5,\"y\":3}" }, "geometrie"],
      [{ ...base, code: "(12.5, 3.25)" }, "geometrie"],
      [{ type: "tache", t: 1, jobId: "job 1 / alice", commandId: null, cle: "k", classe: "fond", evenement: "done", revision: "r", tentative: 1 }, "identifiant-sensible"],
      [{ ...base, detail: "x" }, "champ-non-declare"],
    ];
    for (const [entree, motif] of cas) {
      const v = controlerJournal([entree]);
      expect(v.map((x) => x.motif), JSON.stringify(entree)).toContain(motif);
      expect(() => exporterJournal([entree])).toThrow(ErreurJournal);
    }
    // Le motif de l'échec est nommé, jamais la valeur fautive.
    try { exporterJournal([cas[1]![0]]); } catch (e) { expect(String((e as Error).message)).not.toContain("hunter2"); }
  });
});
