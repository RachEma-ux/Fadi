import { executerScript, modeleVide } from "@parcours/sandbox-planche-model";
import { describe, expect, it } from "vitest";
import { lancerScript, lireReponseScript, type WorkerScript } from "./scripts-execution";
import type { DemandeScript } from "./scripts-planche.worker";

/** Faux Worker : `repondre` décide de la réponse (ou n'en donne pas). */
function faux(repondre: (d: DemandeScript, w: WorkerScript) => void): { w: WorkerScript; termine: () => boolean } {
  let termine = false;
  const w: WorkerScript = { onmessage: null, onerror: null, postMessage: (d) => void queueMicrotask(() => repondre(d, w)), terminate: () => void (termine = true) };
  return { w, termine: () => termine };
}
/** Ce que fait le vrai Worker, sans son isolement. */
const commeLeWorker = (d: DemandeScript, w: WorkerScript) => {
  const r = executerScript(d.code, d.modele, { selection: d.selection });
  w.onmessage?.({ data: JSON.parse(JSON.stringify({ journal: r.journal, crees: r.crees, erreur: r.erreur, modele: r.modele === d.modele ? null : r.modele })) });
};
const demande = (code: string): DemandeScript => ({ code, modele: modeleVide(), selection: [] });

describe("Scripts — exécution dans le Worker (client)", () => {
  it("rend le modèle relu et le journal, puis arrête le Worker", async () => {
    const f = faux(commeLeWorker);
    const i = await lancerScript(demande("planche.grouper(planche.boite([0, 0, 0], 1, 1, 1), 'A');\nplanche.afficher('fait');"), { creer: () => f.w }).issue;
    expect(i).toMatchObject({ genre: "fini", erreur: null, journal: ["fait"] });
    expect(i.genre === "fini" && i.modele && Object.keys(i.modele.racine.occurrences)).toHaveLength(1);
    expect(f.termine()).toBe(true);
  });

  it("une erreur du script ne rend aucun modèle ; un script en lecture seule non plus", async () => {
    const e = await lancerScript(demande("planche.boite([0, 0, 0], 1, 1, 1);\nabsent();"), { creer: () => faux(commeLeWorker).w }).issue;
    expect(e).toMatchObject({ genre: "fini", modele: null, erreur: { cle: "execution", ligne: 2 } });
    const l = await lancerScript(demande("planche.afficher(planche.faces().length);"), { creer: () => faux(commeLeWorker).w }).issue;
    expect(l).toMatchObject({ genre: "fini", modele: null, erreur: null, journal: ["0"] });
  });

  it("arrête d'office un script qui ne répond pas (boucle sans fin)", async () => {
    const f = faux(() => {});
    expect(await lancerScript(demande("for (;;) {}"), { creer: () => f.w, delai: 20 }).issue).toEqual({ genre: "delai" });
    expect(f.termine()).toBe(true);
  });

  it("s'arrête à la demande, et une réponse tardive est ignorée", async () => {
    const f = faux(() => {});
    const x = lancerScript(demande(""), { creer: () => f.w });
    x.arreter();
    f.w.onmessage?.({ data: { journal: [], crees: [], erreur: null, modele: null } });
    expect(await x.issue).toEqual({ genre: "arrete" });
    expect(f.termine()).toBe(true);
  });

  it("panne : Worker impossible à créer, erreur du Worker, réponse illisible ou modèle invalide", async () => {
    expect(await lancerScript(demande(""), { creer: () => { throw new Error("refusé"); } }).issue).toEqual({ genre: "panne" });
    expect(await lancerScript(demande(""), { creer: () => faux((_d, w) => w.onerror?.(new Error("x"))).w }).issue).toEqual({ genre: "panne" });
    expect(await lancerScript(demande(""), { creer: () => faux((_d, w) => w.onmessage?.({ data: "n'importe quoi" })).w }).issue).toEqual({ genre: "panne" });
    const invalide = { journal: [], crees: [], erreur: null, modele: { racine: {}, definitions: {}, prochainId: 1 } };
    expect(await lancerScript(demande(""), { creer: () => faux((_d, w) => w.onmessage?.({ data: invalide })).w }).issue).toEqual({ genre: "panne" });
  });

  it("relit strictement la réponse", () => {
    expect(lireReponseScript({ journal: ["a"], crees: [], erreur: null, modele: null })).toMatchObject({ genre: "fini", modele: null });
    expect(lireReponseScript({ journal: [1], crees: [], erreur: null, modele: null })).toBeNull();
    expect(lireReponseScript({ journal: [], crees: [], erreur: { cle: "execution", message: "x", args: {}, ligne: "3" }, modele: null })).toBeNull();
    // Un modèle joint à une erreur n'est jamais repris.
    expect(lireReponseScript({ journal: [], crees: [], erreur: { cle: "execution", message: "x", args: {}, ligne: 3 }, modele: modeleVide() })).toMatchObject({ modele: null });
  });
});
