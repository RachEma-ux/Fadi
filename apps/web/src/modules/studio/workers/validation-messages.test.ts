/**
 * TR-EX-063 / EX-063 — « Les messages applicatifs restent validés même s'ils proviennent d'un worker interne. » Le vrai
 * code du Worker (`brancher` + `TRAITEMENTS_STUDIO`) rend une valeur acceptée ; un message bien formé mais forgé (outil
 * hors registre, indice de triangle hors des sommets, PDF non binaire, enveloppe à deux réponses) est refusé par l'hôte :
 * la demande est rejetée (`invalide` / `illisible`), rien n'est rendu, le document n'est pas touché ; un tampon déjà
 * transféré ne peut pas être réutilisé.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStudioCommands, newStudioDocument, studioMesh3d } from "@parcours/atelier-model";
import { ErreurHote, HoteWorker, type DemandeWorker } from "./hote-worker";
import { brancher, type PorteeWorker } from "./protocole";
import { TRAITEMENTS_STUDIO } from "./traitements";
import { lireEnveloppe, validerValeurStudio, VALIDATEURS_STUDIO } from "./validation-messages";
import { assurerPossede, ErreurTransfert, posterAvecTransfert } from "../taches/transferts";

/** Worker simulé : exécute le vrai protocole du Worker de Studio ; `forger` remplace la réponse émise. */
class BancWorker {
  private ecouteurs = new Map<string, ((e: unknown) => void)[]>();
  forger: ((m: unknown) => unknown) | null = null;
  termine = false;
  private readonly portee: PorteeWorker;
  constructor() {
    this.portee = {
      onmessage: null,
      postMessage: (m) => { const r = this.forger ? this.forger(m) : m; queueMicrotask(() => { if (!this.termine) for (const f of this.ecouteurs.get("message") ?? []) f({ data: r }); }); },
    };
    brancher(this.portee, TRAITEMENTS_STUDIO);
  }
  addEventListener(type: string, f: (e: unknown) => void) { this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]); }
  postMessage(m: DemandeWorker) { void this.portee.onmessage?.({ data: structuredClone(m) } as MessageEvent<DemandeWorker>); }
  terminate() { this.termine = true; }
}

function banc() {
  const workers: BancWorker[] = [];
  const hote = new HoteWorker({ creer: () => { const w = new BancWorker(); workers.push(w); return w as unknown as Worker; }, delaiMs: 5000, workerDisponible: () => true, valider: validerValeurStudio });
  return { hote, workers };
}
const doc = () => applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.dessin.rectangle", params: { id: "R", type: "rectangle", origin: { x: 0, y: 0 }, width: 2, height: 1 } }]);

afterEach(() => { vi.useRealTimers(); });

describe("TR-EX-063 — validation applicative des messages des Workers internes", () => {
  it("chaque traitement du Worker de Studio a son validateur, et une nature sans validateur est refusée", () => {
    expect(Object.keys(VALIDATEURS_STUDIO).sort()).toEqual(Object.keys(TRAITEMENTS_STUDIO).sort());
    expect(validerValeurStudio("inconnue", {})).toMatch(/sans validateur/);
  });

  it("cas positif : le vrai Worker rend le maillage 3D et le métré, acceptés par la validation et identiques au calcul direct", async () => {
    const { hote } = banc();
    const d = doc();
    expect(await hote.demander("maillage.3d", { document: d })).toEqual(studioMesh3d(d));
    expect(await hote.demander("quantites.calculer", { document: d })).toMatchObject({ unites: "m", repere: "local-2d" });
    expect(hote.refus).toEqual([]);
  });

  it("message bien formé mais forgé : maillage dont un triangle vise un sommet absent → demande rejetée « invalide », Worker arrêté, rien rendu", async () => {
    const { hote, workers } = banc();
    const d = applyStudioCommands(doc(), [{ toolId: "studio.objet.extruder", params: { ids: ["R"], base: 0, height: 3 } }]);
    const avant = JSON.stringify(d);
    expect((await hote.demander<{ solids: unknown[] }>("maillage.3d", { document: d })).solids).toHaveLength(1);
    workers[0]!.forger = (m) => {
      const r = structuredClone(m) as { id: number; valeur?: { solids: { triangles: number[][] }[] } };
      if (r.valeur?.solids[0]) r.valeur.solids[0].triangles[0] = [0, 1, 9999];
      return r;
    };
    const p = hote.demander("maillage.3d", { document: d });
    await expect(p).rejects.toMatchObject({ code: "invalide" });
    expect(workers[0]!.termine).toBe(true);
    expect(hote.refus.at(-1)).toMatch(/maillage\.3d : solide 0 : triangle hors des sommets/);
    expect(JSON.stringify(d)).toBe(avant);
    // Coordonnée non finie dans un contour : même refus.
    expect(validerValeurStudio("maillage.3d", { ...studioMesh3d(doc()), outlines: [{ points: [{ x: Number.NaN, y: 0, z: 0 }] }] })).toBe("contour 0 : point non fini");
  });

  it("lecture DXF forgée : une commande d'un outil hors registre (ou une commande sans paramètres) est refusée, jamais appliquée", async () => {
    expect(validerValeurStudio("dxf.lire", { resultat: { statut: "pret", commandes: [{ toolId: "studio.publier.tout", params: {} }], rapport: {} } })).toMatch(/outil hors registre/);
    expect(validerValeurStudio("ifc.lire", { resultat: { statut: "pret", commandes: [{ toolId: "studio.dessin.ligne", params: null }], rapport: {} } })).toMatch(/paramètres invalides/);
    expect(validerValeurStudio("dxf.lire", { resultat: { statut: "unite-inconnue", commandes: [{ toolId: "studio.dessin.ligne", params: {} }], rapport: {} } })).toBe("commandes sans unité");
    expect(validerValeurStudio("dxf.lire", { erreur: "Lecture du fichier impossible." })).toBeNull();
    expect(validerValeurStudio("feuille.composer", { feuille: {}, svg: "<svg/>", pdf: [1, 2, 3], erreur: "" })).toBe("PDF non binaire");
    expect(validerValeurStudio("feuille.composer", { feuille: {}, svg: "<svg/>", pdf: new Uint8Array([37, 80]), erreur: "" })).toBeNull();
  });

  it("enveloppe forgée (deux réponses, identifiant non entier, progression hors forme) : refusée comme illisible, Worker arrêté", async () => {
    expect(lireEnveloppe({ id: 1, valeur: 1, erreur: "x" })).toEqual({ ok: false, motif: "enveloppe ambiguë" });
    expect(lireEnveloppe({ id: 1.5, valeur: 1 })).toEqual({ ok: false, motif: "identifiant invalide" });
    expect(lireEnveloppe({ id: 2, progression: { etape: "x", fait: -1 } })).toEqual({ ok: false, motif: "progression invalide" });
    expect(lireEnveloppe({ id: 2, valeur: 3, autre: true })).toEqual({ ok: false, motif: "enveloppe ambiguë" });
    expect(lireEnveloppe({ id: 3, erreur: "x".repeat(5000) })).toEqual({ ok: false, motif: "erreur invalide" });
    const { hote, workers } = banc();
    const d = doc();
    const p = hote.demander("quantites.calculer", { document: d });
    workers[0]!.forger = (m) => ({ ...(m as object), erreur: "et aussi une erreur" });
    await expect(p).rejects.toBeInstanceOf(ErreurHote);
    await expect(p).rejects.toMatchObject({ code: "illisible" });
    expect(workers[0]!.termine).toBe(true);
    // La demande suivante repart sur un Worker neuf et valide sa réponse normalement.
    expect(await hote.demander("quantites.calculer", { document: d })).toMatchObject({ unites: "m" });
    expect(workers).toHaveLength(2);
  });

  it("tampon déjà transféré : sa réutilisation est refusée (propriété du tampon établie par le protocole)", () => {
    const tampon = new ArrayBuffer(8);
    posterAvecTransfert(() => {}, { id: 1 }, [tampon]);
    expect(() => assurerPossede(tampon)).toThrow(ErreurTransfert);
    expect(() => posterAvecTransfert(() => {}, { id: 2 }, [tampon])).toThrow(/déjà transféré/);
  });
});
