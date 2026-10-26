/**
 * TR-AC-006 / AC-006 — « Échec forcé d'OCCT/WASM pendant une opération : aucune mutation partielle, retour d'erreur
 * intelligible, tâches en attente résolues explicitement, possibilité de relance sans doublons et sans perte de la
 * révision courante. » REC-D-01 / REC-D-02 : preuve jointe sur le vrai déroulé du booléen exact de Studio
 * (`booleen-session.ts`, ordonnanceur des tâches exactes à un emplacement sans reprise, client `NoyauExactStudio`) ;
 * l'échec est forcé sur le Worker du noyau (faux Worker : interruption comme un plantage du WebAssembly). Le résultat
 * exact du faux Worker est SYNTHÉTIQUE (forme du contrat seulement). Le pendant navigateur réel est joué par la recette
 * `studio-exact` (TEST-015).
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioEmpreinteContenu, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { Ordonnanceur } from "../taches/ordonnanceur";
import { NoyauExactStudio } from "./client-exact";
import { FauxWorker, type CompteurFaux } from "./faux-worker";
import { demandeBooleen, engagement, etatApresIssue, tacheBooleen } from "./booleen-session";

const boite = (id: string, x: number): StudioCommand => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 2, height: 2 } });
const tetra = () => ({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
const exact = () => ({ brep: "U1lOVEhFVElRVUU=", maillage: tetra(), volume: 12, aire: 1, faces: 6, solides: 1, moteur: "occt-wasm", versionMoteur: "5.6.1", empreinte: "0123456789abcdef" });

describe("TR-AC-006 — échec forcé d'OCCT pendant une opération exacte", () => {
  it("plantage pendant le calcul avec une seconde tâche en attente : les deux attentes résolues, erreur intelligible, aucune mutation ; relance : un seul solide exact, révision courante conservée", async () => {
    const compteur: CompteurFaux = { crees: 0, arretes: 0, vivants: [] };
    const mode = { silence: true };
    const noyau = new NoyauExactStudio({ creerWorker: () => new FauxWorker((d) => (d.nature === "charger" ? { pret: true } : mode.silence ? "silence" : exact()), compteur) });
    const ord = new Ordonnanceur({ concurrence: 1, reprisesMax: 0, delaiMs: 60_000, executer: ({ charge, signal, delaiMs }) => noyau.executer((charge as { entrees: unknown }).entrees, { signal, delaiMs }) });
    const doc: StudioDocument = applyStudioCommands(newStudioDocument("s"), [boite("A", 0), boite("B", 1), boite("C", 5)]);
    const revisionCourante = "r12";
    const texte = JSON.stringify(doc), empreinte = studioEmpreinteContenu(doc);
    const capture = (a: string, b: string, id: string) => { const r = demandeBooleen(doc, revisionCourante, { operation: "union", a, b }, id); if (!r.ok) throw new Error(r.message); return r.demande; };
    const d1 = capture("A", "B", "E1");
    // Deux tâches : la première calcule (le Worker reste muet), la seconde attend son tour (clé distincte).
    const p1 = ord.soumettre(tacheBooleen(d1));
    const p2 = ord.soumettre({ ...tacheBooleen(capture("B", "C", "E2")), cle: "studio.exact.booleen.2" });
    await new Promise((r) => setTimeout(r, 0));
    expect(ord.enCours).toBe(1);
    expect(ord.enFile).toBe(1);
    compteur.vivants[0]!.planter();
    const [i1, i2] = await Promise.all([p1.issue, p2.issue]);
    // Attentes résolues explicitement : la tâche en cours échoue (plantage), celle en attente est refusée (noyau à relancer).
    expect(i1).toMatchObject({ etat: "failed", code: "plantage" });
    expect(i2).toMatchObject({ etat: "failed", code: "indisponible", message: "Noyau exact en échec : relancez-le avant un nouveau calcul." });
    const e1 = etatApresIssue(d1, i1, revisionCourante);
    expect(e1).toMatchObject({ etape: "echec", relancer: true, message: "Le noyau exact s’est interrompu : le calcul est abandonné, le document n’a pas été modifié. Relancez le noyau exact." });
    expect(noyau.metriques()).toMatchObject({ etat: "echec", enAttente: 0, workersVivants: 0 });
    // Aucune mutation partielle : document identique octet pour octet, rien d'engageable.
    expect(JSON.stringify(doc)).toBe(texte);
    expect(studioEmpreinteContenu(doc)).toBe(empreinte);
    expect(engagement(e1, { doc, revision: revisionCourante, modifiable: true }).ok).toBe(false);

    // Relance explicite, puis nouvelle soumission de la même opération : un seul calcul, un seul engagement.
    mode.silence = false;
    await noyau.relancer();
    const t = tacheBooleen(d1);
    const a = ord.soumettre(t), b = ord.soumettre(t);
    expect(b).toBe(a); // même clé et même empreinte : aucune tâche en double
    const pret = etatApresIssue(d1, await a.issue, revisionCourante);
    expect(pret.etape).toBe("pret");
    const r = engagement(pret, { doc, revision: revisionCourante, modifiable: true });
    if (!r.ok) throw new Error(r.message);
    expect(r.commandes).toHaveLength(1);
    const apres = applyStudioCommands(doc, r.commandes);
    expect(apres.exacts?.map((x) => x.id)).toEqual(["E1"]);
    // Le résultat a été calculé sur la révision courante capturée : rien n'est perdu ni rejoué en double.
    expect(pret).toMatchObject({ demande: { revision: revisionCourante } });
    expect(() => applyStudioCommands(apres, r.commandes)).toThrow();
    expect(noyau.metriques()).toMatchObject({ etat: "pret", pannes: 1, relances: 1, workersVivants: 1 });
    expect(compteur.vivants).toHaveLength(1);
  });
});
