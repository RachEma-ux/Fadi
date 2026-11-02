/**
 * EX-061 — échec Worker (groupe E, point 2) : le Worker disparaît en plein calcul. Le modèle canonique de la session
 * (document Studio d'une révision) reste intact, aucune promesse ne reste en suspens, aucun résultat partiel n'est remis,
 * et la relance se fait sous contrôle sur un Worker recréé, sans doublon. Faux Worker qui CLONE chaque message reçu
 * (comme `postMessage`) et peut planter à tout moment ; l'ordonnanceur et l'hôte sont les vrais.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { HoteWorker, type DemandeWorker } from "../workers/hote-worker";
import { Ordonnanceur } from "./ordonnanceur";
import { executeurHotes } from "./pool-studio";

class FauxWorker {
  static instances: FauxWorker[] = [];
  readonly recus: DemandeWorker[] = [];
  termine = false;
  private ecouteurs = new Map<string, ((e: unknown) => void)[]>();
  constructor() { FauxWorker.instances.push(this); }
  addEventListener(type: string, f: (e: unknown) => void) { this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]); }
  /** Copie structurée, comme le vrai canal : le Worker ne tient jamais l'objet du fil principal. */
  postMessage(m: DemandeWorker) { this.recus.push(structuredClone(m)); }
  terminate() { this.termine = true; }
  emettre(type: string, data?: unknown) { for (const f of this.ecouteurs.get(type) ?? []) f({ data }); }
}
const dernier = () => FauxWorker.instances[FauxWorker.instances.length - 1]!;
const flush = () => new Promise((r) => setTimeout(r, 0));

function documentCanonique(): StudioDocument {
  const commandes: StudioCommand[] = [
    { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } } as StudioCommand,
    { toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 0, y: 1 }, end: { x: 4, y: 1 } } } as StudioCommand,
  ];
  return applyStudioCommands(newStudioDocument("doc-ex061"), commandes);
}

describe("EX-061 — le Worker disparaît en plein calcul", () => {
  it("EX-061 [−] deux disparitions en plein calcul : issue « failed / plantage » résolue (jamais en suspens), aucun résultat remis, document canonique identique", async () => {
    FauxWorker.instances = [];
    const hote = new HoteWorker({ creer: () => new FauxWorker() as unknown as Worker, delaiMs: 1000, workerDisponible: () => true });
    const ord = new Ordonnanceur({ executer: executeurHotes([hote]), delaiMs: 1000, concurrence: 1 });
    const doc = documentCanonique();
    const avant = JSON.stringify(doc);
    const remis: unknown[] = [];
    const p = ord.soumettre({ cle: "maillage", classe: "fond", nature: "maillage.3d", charge: { document: doc }, empreinte: { revision: "r1", parametres: "p" }, surResultat: (v) => remis.push(v) });
    const w1 = dernier();
    // Le Worker a reçu sa copie et « calcule » : il la modifie (mutation partielle), puis disparaît.
    (w1.recus[0]!.charge as { document: StudioDocument }).document.objects.splice(0, 1);
    w1.emettre("error");
    await flush();
    const w2 = dernier();
    expect(w2).not.toBe(w1);
    (w2.recus[0]!.charge as { document: StudioDocument }).document.objects.length = 0;
    w2.emettre("messageerror");
    const issue = await Promise.race([p.issue, new Promise((r) => setTimeout(() => r("en suspens"), 200))]);
    expect(issue).toMatchObject({ etat: "failed", code: "plantage" });
    expect(remis).toEqual([]);
    expect(hote.enCours).toBe(0);
    expect(JSON.stringify(doc)).toBe(avant);
    // Une réponse tardive d'un Worker disparu n'est jamais remise.
    w1.emettre("message", { id: w1.recus[0]!.id, valeur: "partiel" });
    w2.emettre("message", { id: w2.recus[0]!.id, valeur: "partiel" });
    expect(remis).toEqual([]);
  });

  it("EX-061 [+] relance sous contrôle (nouvelle soumission) : Worker recréé, un seul résultat remis, calculé sur le document intact", async () => {
    FauxWorker.instances = [];
    const hote = new HoteWorker({ creer: () => new FauxWorker() as unknown as Worker, delaiMs: 1000, workerDisponible: () => true });
    const ord = new Ordonnanceur({ executer: executeurHotes([hote]), delaiMs: 1000, concurrence: 1 });
    const doc = documentCanonique();
    const avant = JSON.stringify(doc);
    const p = ord.soumettre({ cle: "maillage", classe: "fond", nature: "maillage.3d", charge: { document: doc }, empreinte: { revision: "r1", parametres: "p" } });
    dernier().emettre("error");
    await flush();
    dernier().emettre("error");
    await expect(p.issue).resolves.toMatchObject({ etat: "failed", code: "plantage" });
    const remis: unknown[] = [];
    const relance = ord.soumettre({ cle: "maillage", classe: "fond", nature: "maillage.3d", charge: { document: doc }, empreinte: { revision: "r1", parametres: "p" }, surResultat: (v) => remis.push(v) });
    const w = dernier();
    expect(FauxWorker.instances).toHaveLength(3);
    const recu = w.recus.at(-1)!;
    expect(JSON.stringify((recu.charge as { document: StudioDocument }).document)).toBe(avant);
    w.emettre("message", { id: recu.id, valeur: { objets: 2 } });
    await expect(relance.issue).resolves.toEqual({ etat: "done", valeur: { objets: 2 } });
    expect(remis).toEqual([{ objets: 2 }]);
    expect(JSON.stringify(doc)).toBe(avant);
  });
});
