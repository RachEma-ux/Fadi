/** Hôte d'une extension (protocole 1.0, lot 1) : espace isolé durable, limites de temps, arrêt et redémarrage. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { creerExecutantExtension, validerPaquetExtension, type ExecutantExtension, type PaquetExtension } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const lu = validerPaquetExtension(JSON.parse(readFileSync(fileURLToPath(new URL("../../../../e2e/donnees/essai-socle.fadi-addon.json", import.meta.url)), "utf8")));
if (!lu.ok) throw new Error(`extension d'essai refusée : ${lu.detail}`);
const ESSAI: PaquetExtension = lu.paquet;

/**
 * Worker de remplacement : le vrai exécutant, dans le même fil, avec des messages différés comme entre deux fils.
 * `muet` nomme les appels qui ne répondent jamais (une boucle sans fin ne peut pas tourner dans le fil des tests).
 */
function faux(o: { muet?: readonly string[]; journal: string[] } = { journal: [] }) {
  const crees: { termine: boolean }[] = [];
  const creer = (): WorkerExtension => {
    const etat = { termine: false };
    crees.push(etat);
    let x: ExecutantExtension | null = null;
    const w: WorkerExtension = {
      onmessage: null,
      onerror: null,
      terminate: () => void (etat.termine = true),
      postMessage: (m) => {
        const brut = JSON.parse(JSON.stringify(m)) as { demarrer?: { fiche: { id: string; version: string }; code: string }; nom?: string };
        setTimeout(() => {
          if (etat.termine) return;
          const rendre = (r: unknown) => setTimeout(() => !etat.termine && w.onmessage?.({ data: JSON.parse(JSON.stringify(r)) }), 0);
          if (brut.demarrer) {
            x = creerExecutantExtension(brut.demarrer, rendre);
            const erreur = x.demarrer();
            rendre({ demarre: erreur === null, erreur });
            return;
          }
          if (brut.nom && o.muet?.includes(brut.nom)) return;
          x?.recevoir(brut);
        }, 0);
      },
    };
    return w;
  };
  return { creer, crees };
}

describe("hôte d'une extension — l'extension d'essai du socle", () => {
  it("démarre au premier appel seulement, reste en vie et garde son état d'un appel à l'autre", async () => {
    const journal: string[] = [];
    const f = faux();
    const h = creerHoteExtension(ESSAI, { creer: f.creer, surJournal: (l) => journal.push(l) });
    expect(h.enMarche()).toBe(false);
    expect(f.crees).toHaveLength(0);
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "fini", resultat: { appels: 1, selection: 0 } });
    expect(await h.appeler("evenement", "selection.change", ["a", "b", "c"])).toEqual({ genre: "fini", resultat: null });
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "fini", resultat: { appels: 2, selection: 3 } });
    expect(f.crees).toHaveLength(1);
    expect(h.enMarche()).toBe(true);
    expect(journal).toEqual(["prête", "appel 1", "appel 2"]);
  });

  it("les appels passent un par un, dans l'ordre demandé", async () => {
    const f = faux();
    const h = creerHoteExtension(ESSAI, { creer: f.creer });
    const issues = await Promise.all([h.appeler("demande", "commande.compter"), h.appeler("demande", "commande.compter"), h.appeler("demande", "commande.compter")]);
    expect(issues.map((i) => (i.genre === "fini" ? (i.resultat as { appels: number }).appels : i.genre))).toEqual([1, 2, 3]);
    expect(f.crees).toHaveLength(1);
  });

  it("délai dépassé : l'espace isolé est arrêté, l'appel rend « delai », et l'extension redémarre à neuf au prochain appel", async () => {
    const f = faux({ muet: ["commande.boucler"], journal: [] });
    const h = creerHoteExtension(ESSAI, { creer: f.creer, delaiCommandeMs: 40, delaiEvenementMs: 20 });
    expect(await h.appeler("demande", "commande.compter")).toMatchObject({ genre: "fini", resultat: { appels: 1 } });
    expect(await h.appeler("demande", "commande.boucler")).toEqual({ genre: "delai" });
    expect(f.crees[0]!.termine).toBe(true);
    expect(h.enMarche()).toBe(false);
    expect(await h.appeler("demande", "commande.compter")).toMatchObject({ genre: "fini", resultat: { appels: 1 } });
    expect(f.crees).toHaveLength(2);
  });

  it("un événement a sa propre limite, plus courte que celle d'une commande", async () => {
    const f = faux({ muet: ["selection.change"], journal: [] });
    const h = creerHoteExtension(ESSAI, { creer: f.creer, delaiCommandeMs: 5000, delaiEvenementMs: 20 });
    const debut = Date.now();
    expect(await h.appeler("evenement", "selection.change", [])).toEqual({ genre: "delai" });
    expect(Date.now() - debut).toBeLessThan(1000);
  });

  it("demande sans traitement : erreur nommée du protocole, l'extension reste en marche", async () => {
    const f = faux();
    const h = creerHoteExtension(ESSAI, { creer: f.creer });
    expect(await h.appeler("demande", "commande.absente")).toEqual({ genre: "erreur", nom: "demande_inconnue", detail: "commande.absente" });
    expect(h.enMarche()).toBe(true);
  });

  it("arrêt à la demande pendant un appel : l'appel rend « arrete »", async () => {
    const f = faux({ muet: ["commande.boucler"], journal: [] });
    const h = creerHoteExtension(ESSAI, { creer: f.creer });
    await h.appeler("demande", "commande.compter");
    const enCours = h.appeler("demande", "commande.boucler");
    await new Promise((r) => setTimeout(r, 5));
    h.arreter();
    expect(await enCours).toEqual({ genre: "arrete" });
    expect(f.crees[0]!.termine).toBe(true);
  });

  it("arrêt à la demande : les appels qui attendaient rendent « arrete » sans relancer l'extension ; un appel fait ensuite la relance", async () => {
    const f = faux({ muet: ["commande.boucler"], journal: [] });
    const h = creerHoteExtension(ESSAI, { creer: f.creer });
    const premier = h.appeler("demande", "commande.boucler");
    const second = h.appeler("demande", "commande.compter");
    await new Promise((r) => setTimeout(r, 5));
    h.arreter();
    expect(await premier).toEqual({ genre: "arrete" });
    expect(await second).toEqual({ genre: "arrete" });
    expect(h.enMarche()).toBe(false);
    expect(f.crees).toHaveLength(1);
    expect(await h.appeler("demande", "commande.compter")).toMatchObject({ genre: "fini" });
    expect(f.crees).toHaveLength(2);
  });

  it("démarrage manqué : le motif est rendu et l'espace isolé est arrêté", async () => {
    const f = faux();
    const h = creerHoteExtension({ ...ESSAI, code: 'const m = import("ailleurs");' }, { creer: f.creer });
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "demarrage", erreur: { genre: "import" } });
    expect(h.enMarche()).toBe(false);
    expect(f.crees[0]!.termine).toBe(true);
  });

  it("espace isolé impossible à créer, ou réponse illisible : « panne », jamais d'exception", async () => {
    const h = creerHoteExtension(ESSAI, {
      creer: () => {
        throw new Error("pas de Worker");
      },
    });
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "panne" });
  });

  it("une demande de l'extension hors de la table du protocole est refusée par son nom", async () => {
    const recus: unknown[] = [];
    const creer = (): WorkerExtension => {
      const w: WorkerExtension = {
        onmessage: null,
        onerror: null,
        terminate: () => {},
        postMessage: (m) => {
          const brut = JSON.parse(JSON.stringify(m)) as { demarrer?: unknown; sorte?: string; id?: number };
          setTimeout(() => {
            if (brut.demarrer) return w.onmessage?.({ data: { demarre: true, erreur: null } });
            if (brut.sorte === "reponse") return void recus.push(brut);
            // L'extension tente d'appeler le serveur avant de répondre : la Planche refuse, puis reçoit la réponse.
            w.onmessage?.({ data: { protocole: "1.0", sorte: "demande", id: 7, nom: "serveur.appeler", donnees: null } });
            w.onmessage?.({ data: { protocole: "1.0", sorte: "reponse", id: brut.id, ok: true, resultat: "fait" } });
          }, 0);
        },
      };
      return w;
    };
    const h = creerHoteExtension(ESSAI, { creer });
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "fini", resultat: "fait" });
    await new Promise((r) => setTimeout(r, 5));
    expect(recus).toEqual([{ protocole: "1.0", sorte: "reponse", id: 7, ok: false, resultat: null, erreur: { nom: "demande_inconnue", detail: "serveur.appeler" } }]);
  });
});
