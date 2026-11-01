/**
 * REC-D-02 — absence de corruption après un plantage du Worker : le vrai code du Worker de Studio tourne derrière une
 * frontière de copie structurée (comme dans le navigateur) ; il plante au premier essai après avoir commencé à altérer
 * sa copie de la charge. Le document soumis et le brouillon de la variante (tête, lots en attente, enveloppe) restent
 * identiques octet pour octet ; la reprise reçoit une charge intacte, son résultat est identique à l'appel direct et
 * n'est remis qu'une fois ; le brouillon reste enregistrable.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioMesh3d, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { HoteWorker, type DemandeWorker, type ReponseWorker } from "../workers/hote-worker";
import { brancher, type PorteeWorker } from "../workers/protocole";
import { TRAITEMENTS_STUDIO } from "../workers/traitements";
import { Ordonnanceur } from "./ordonnanceur";
import { executeurHotes } from "./pool-studio";
import { appliquerBrouillon, commandesEnAttente, creerBrouillon, documentBrouillon, enveloppeBrouillon } from "../planche2d/brouillon";

/** Worker exécuté dans le processus ; `planter` : il altère sa copie de la charge puis meurt avant de répondre. */
class BancWorker {
  static instances: BancWorker[] = [];
  static planter = 0;
  termine = false;
  readonly recus: unknown[] = [];
  private ecouteurs = new Map<string, ((e: unknown) => void)[]>();
  private readonly portee: PorteeWorker;
  constructor() {
    BancWorker.instances.push(this);
    this.portee = {
      onmessage: null,
      postMessage: (m: ReponseWorker, transfert?: Transferable[]) => {
        const copie = structuredClone(m, { transfer: transfert ?? [] });
        setTimeout(() => { if (!this.termine) this.emettre("message", copie); });
      },
    };
    brancher(this.portee, TRAITEMENTS_STUDIO);
  }
  addEventListener(type: string, f: (e: unknown) => void) { this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]); }
  private emettre(type: string, data?: unknown) { for (const f of this.ecouteurs.get(type) ?? []) f({ data }); }
  postMessage(m: DemandeWorker, transfert: Transferable[] = []) {
    const copie = structuredClone(m, { transfer: transfert });
    this.recus.push(structuredClone(copie.charge));
    if (BancWorker.planter > 0) {
      BancWorker.planter -= 1;
      // Le Worker commence à écrire dans sa copie puis plante (erreur fatale, aucune réponse).
      const doc = (copie.charge as { document: StudioDocument }).document;
      doc.objects.splice(0, doc.objects.length);
      (doc as { id: string }).id = "corrompu";
      setTimeout(() => this.emettre("error"));
      return;
    }
    setTimeout(() => { if (!this.termine) void this.portee.onmessage?.({ data: copie } as MessageEvent<DemandeWorker>); });
  }
  terminate() { this.termine = true; }
}

const tete = (): StudioDocument => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
] as StudioCommand[]);
const lot: StudioCommand[] = [{ toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 2 }, end: { x: 3, y: 2 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } } } as StudioCommand];

describe("plantage du Worker pendant une tâche : aucune corruption (REC-D-02)", () => {
  it("document et brouillon intacts, charge de reprise intacte, résultat identique à l'appel direct et remis une seule fois", async () => {
    BancWorker.instances = [];
    BancWorker.planter = 1;
    const hote = new HoteWorker({ creer: () => new BancWorker() as unknown as Worker, delaiMs: 5000, workerDisponible: () => true });
    const ord = new Ordonnanceur({ executer: executeurHotes([hote]), delaiMs: 5000, concurrence: 1 });

    const brouillon = appliquerBrouillon(creerBrouillon(tete()), lot);
    const document = documentBrouillon(brouillon);
    const avantDocument = JSON.stringify(document);
    const avantBrouillon = JSON.stringify({ present: brouillon.history.present, pas: brouillon.pas, refaire: brouillon.refaire, enAttente: commandesEnAttente(brouillon) });
    const avantEnveloppe = JSON.stringify(enveloppeBrouillon(brouillon, "rev-1", "req-1"));

    const remis: unknown[] = [];
    const p = ord.soumettre({ cle: "maillage", classe: "fond", nature: "maillage.3d", charge: { document }, empreinte: { revision: "rev-1", parametres: "p" }, surResultat: (v) => remis.push(v) });
    const issue = await p.issue;

    expect(BancWorker.instances).toHaveLength(2);
    expect(BancWorker.instances[0]!.termine).toBe(true);
    expect(p.tache.tentatives).toBe(2);
    // La reprise a reçu exactement la charge d'origine, pas la copie altérée par le Worker planté.
    expect(JSON.stringify(BancWorker.instances[1]!.recus[0])).toBe(JSON.stringify({ document: JSON.parse(avantDocument) }));
    expect(issue.etat).toBe("done");
    const valeur = (issue as { valeur: unknown }).valeur;
    expect(JSON.parse(JSON.stringify(valeur))).toEqual(JSON.parse(JSON.stringify(studioMesh3d(JSON.parse(avantDocument)))));
    expect(remis).toHaveLength(1);

    // Côté interface : document, brouillon et enveloppe d'enregistrement inchangés.
    expect(JSON.stringify(document)).toBe(avantDocument);
    expect(JSON.stringify({ present: brouillon.history.present, pas: brouillon.pas, refaire: brouillon.refaire, enAttente: commandesEnAttente(brouillon) })).toBe(avantBrouillon);
    expect(JSON.stringify(enveloppeBrouillon(brouillon, "rev-1", "req-1"))).toBe(avantEnveloppe);
  });
});
