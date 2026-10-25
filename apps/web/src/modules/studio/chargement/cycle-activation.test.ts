/**
 * Cycle d'activation des outils et ressources rares de Studio :
 * - TR-IF-005 / IF-005 — découvert → vérification de contexte / droits → résolution des dépendances → chargement du code →
 *   initialisation → prêt → actif → suspendu / désactivé ; erreurs incompatible, permission refusée, hors ligne, échec
 *   de chargement, échec du noyau ; la transition ne perd pas un geste inachevé sans retour visible.
 * - TR-EX-040 / EX-040 — outil exact : première puis seconde activation, un autre outil ne crée pas un second noyau ;
 *   échec du module rare récupérable ; ressources conservées ou libérées selon une politique documentée.
 * - D.3-02 — libération de l'instance WebAssembly par politique (inactivité), annulée par un nouvel usage.
 * Gestionnaire réel ; noyau exact réel côté client (`NoyauExactStudio`) sur un faux Worker (aucun OCCT exécuté).
 */
import { describe, expect, it, vi } from "vitest";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { NoyauExactStudio } from "../exact/client-exact";
import { FauxWorker, type CompteurFaux } from "../exact/faux-worker";
import { ErreurMoteur, GestionnaireRessources, type GesteInacheve } from "./gestionnaire-ressources";
import { POLITIQUES_LIBERATION } from "./ressources-studio";

const outil = (id: string) => STUDIO_TOOLS.find((t) => t.toolId === id)!;
const BOOLEEN = outil("studio.solide.booleen"), BOITE = outil("studio.solide.boite"), LIGNE = outil("studio.dessin.ligne");

function banc(o: { chargementNoyauEchoue?: { oui: boolean }; enLigne?: () => boolean; codeEchoue?: { oui: boolean } } = {}) {
  const compteur: CompteurFaux = { crees: 0, arretes: 0, vivants: [] };
  const noyau = new NoyauExactStudio({
    creerWorker: () => new FauxWorker((d) => (d.nature === "charger" ? (o.chargementNoyauEchoue?.oui ? { erreur: "binaire introuvable" } : { pret: true }) : { volume: 1 }), compteur),
  });
  const planifies: { f: () => void; ms: number; annule: boolean }[] = [];
  const g = new GestionnaireRessources({
    dejaCharges: ["coquille-studio", "planche-2d", "rendu-3d"],
    chargeurs: {
      "noyau-exact": {
        charger: async () => { if (o.codeEchoue?.oui) throw new Error("module introuvable"); return { noyau }; },
        initialiser: () => noyau.charger(),
        liberer: () => noyau.arreter(),
      },
      calcul: { liberer: () => {} },
    },
    maintenant: () => 0,
    enLigne: o.enLigne,
    politiques: POLITIQUES_LIBERATION,
    planifier: (f, ms) => { const p = { f, ms, annule: false }; planifies.push(p); return () => { p.annule = true; }; },
  });
  return { g, noyau, compteur, planifies };
}

describe("TR-IF-005 — cycle d'activation d'un outil", () => {
  it("cas positif : découvert → vérification → résolution → chargement → initialisation → prêt → actif, puis suspendu, repris et désactivé", async () => {
    const { g } = banc();
    await g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe, { verifier: () => null });
    expect(g.etatActivation()).toMatchObject({ outil: BOOLEEN.toolId, phase: "actif", erreur: null });
    expect(g.etatActivation().trace).toEqual(["decouvert", "verification", "resolution", "chargement", "initialisation", "pret", "actif"]);
    expect(g.lire("noyau-exact")).toMatchObject({ actif: true, initialise: true });
    g.suspendreOutil();
    expect(g.etatActivation().phase).toBe("suspendu");
    expect(g.lire("noyau-exact").actif).toBe(false);
    await g.reprendreOutil(BOOLEEN.groupe);
    expect(g.etatActivation()).toMatchObject({ phase: "actif" });
    // Reprise : moteurs déjà prêts, aucune phase de chargement.
    expect(g.etatActivation().trace).toEqual(["decouvert", "verification", "resolution", "pret", "actif"]);
    g.desactiverOutil();
    expect(g.etatActivation().phase).toBe("desactive");
    expect(g.outilCourant).toBeNull();
  });

  it("cas négatifs : incompatible et permission refusée arrêtent à la vérification — rien n'est chargé, l'outil précédent reste actif, le geste est rendu", async () => {
    const { g, compteur } = banc();
    await g.activerOutil(LIGNE.toolId, LIGNE.groupe);
    const geste: GesteInacheve = { outil: LIGNE.toolId, libelleFR: "Ligne commencée en (1 ; 2)", donnees: { depart: { x: 1, y: 2 } } };
    for (const code of ["incompatible", "permission-refusee"] as const) {
      const e = await g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe, { verifier: () => code, geste }).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ErreurMoteur);
      expect(e).toMatchObject({ code, geste });
      expect(g.etatActivation()).toMatchObject({ phase: "erreur", erreur: code, gesteConserve: geste });
      expect(g.etatActivation().trace).toEqual(["decouvert", "verification", "erreur"]);
    }
    expect(compteur.crees).toBe(0);
    expect(g.lire("noyau-exact").phase).toBe("non-charge");
    expect(g.outilCourant).toBe(LIGNE.toolId);
    expect(g.lire("planche-2d").usages).toContain(`outil:${LIGNE.toolId}`);
  });

  it("erreurs distinctes : échec du noyau (initialisation), échec de chargement du code, hors ligne — jamais d'attente infinie, geste conservé et visible", async () => {
    const noyauKo = { oui: true };
    const a = banc({ chargementNoyauEchoue: noyauKo });
    const geste: GesteInacheve = { outil: BOITE.toolId, libelleFR: "Boîte en cours de saisie", donnees: null };
    await expect(a.g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe, { geste })).rejects.toMatchObject({ code: "echec-noyau", geste });
    expect(a.g.etatActivation()).toMatchObject({ phase: "erreur", erreur: "echec-noyau", gesteConserve: geste });
    expect(a.g.journal.some((e) => e.type === "geste-conserve" && e.detail === "Boîte en cours de saisie")).toBe(true);
    const codeKo = { oui: true };
    const b = banc({ codeEchoue: codeKo });
    await expect(b.g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe)).rejects.toMatchObject({ code: "echec-chargement" });
    const c = banc({ codeEchoue: { oui: true }, enLigne: () => false });
    await expect(c.g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe)).rejects.toMatchObject({ code: "hors-ligne" });
    expect(c.g.etatActivation().erreur).toBe("hors-ligne");
  });
});

describe("TR-EX-040 — activation rare : outil exact", () => {
  it("première activation : charge module et noyau ; seconde activation et autres outils entre-temps : même noyau, aucune réinitialisation", async () => {
    const { g, noyau, compteur } = banc();
    const r1 = await g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe);
    expect(r1).toMatchObject({ nature: "specialise", moteurs: expect.arrayContaining(["noyau-exact"]) });
    expect(noyau.metriques()).toMatchObject({ etat: "pret", workersCrees: 1, chargements: 1 });
    // D'autres outils (Boîte, Ligne) n'atteignent jamais le noyau ; revenir au Booléen ne le réinitialise pas.
    await g.activerOutil(BOITE.toolId, BOITE.groupe);
    await g.activerOutil(LIGNE.toolId, LIGNE.groupe);
    const r2 = await g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe);
    expect(r2.nature).toBe("simple");
    // Deux activations simultanées du même outil exact : un seul noyau.
    await Promise.all([g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe), g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe)]);
    expect(compteur.crees).toBe(1);
    expect(noyau.metriques()).toMatchObject({ workersCrees: 1, workersVivants: 1, chargements: 1, suivi: { instances: 1 } });
    expect(g.lire("noyau-exact").initialisations).toBe(1);
  });

  it("cas négatif : échec du module rare — état récupérable ; la relance réussit avec un seul noyau vivant", async () => {
    const ko = { oui: true };
    const { g, noyau, compteur } = banc({ chargementNoyauEchoue: ko });
    await expect(g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe)).rejects.toMatchObject({ code: "echec-noyau" });
    expect(g.lire("noyau-exact")).toMatchObject({ phase: "echec", erreur: "echec-noyau" });
    expect(noyau.metriques().workersVivants).toBe(0);
    ko.oui = false;
    await noyau.relancer().catch(() => undefined);
    await g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe);
    expect(g.lire("noyau-exact")).toMatchObject({ phase: "initialise", erreur: null, actif: true });
    expect(noyau.metriques().workersVivants).toBe(1);
    expect(compteur.vivants).toHaveLength(1);
  });
});

describe("D.3-02 — libération de l'instance WebAssembly par politique", () => {
  it("noyau exact inactif : libération planifiée après la durée de la politique (5 min), Worker arrêté ; un nouvel usage avant l'échéance l'annule", async () => {
    const { g, noyau, planifies } = banc();
    await g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe);
    expect(planifies).toHaveLength(0);
    g.desactiverOutil();
    expect(planifies).toHaveLength(1);
    expect(planifies[0]!.ms).toBe(300_000);
    // Usage avant l'échéance (tâche exacte) : la libération est annulée ; à la fin de l'usage, elle est replanifiée.
    const fin = g.utiliser("noyau-exact", "tache:booleen");
    expect(planifies[0]!.annule).toBe(true);
    fin();
    expect(planifies).toHaveLength(2);
    planifies[1]!.f();
    expect(g.lire("noyau-exact")).toMatchObject({ phase: "libere", liberations: 1 });
    expect(noyau.metriques()).toMatchObject({ etat: "absent", workersVivants: 0, pannes: 0 });
    // Prochaine activation : rechargé (raison : libération), une seule instance vivante.
    await g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe);
    expect(g.lire("noyau-exact").initialisations).toBe(2);
    expect(noyau.metriques().workersVivants).toBe(1);
  });

  it("aucune politique pour les moteurs sans WebAssembly : planche et 3D jamais libérés automatiquement ; un moteur actif n'est jamais libéré", async () => {
    expect(Object.keys(POLITIQUES_LIBERATION)).toEqual(["noyau-exact"]);
    const { g, planifies } = banc();
    await g.activerOutil(BOITE.toolId, BOITE.groupe);
    g.desactiverOutil();
    expect(planifies).toHaveLength(0);
    await g.activerOutil(BOOLEEN.toolId, BOOLEEN.groupe);
    expect(g.liberer("noyau-exact")).toBe(false);
    vi.useRealTimers();
  });
});
