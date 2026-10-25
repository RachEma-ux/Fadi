import { afterEach, describe, expect, it, vi } from "vitest";
import { ErreurTache } from "../taches/ordonnanceur";
import { MESSAGES_NOYAU_EXACT, NoyauExactStudio } from "./client-exact";
import { FauxWorker, type CompteurFaux } from "./faux-worker";

/**
 * Client du noyau exact de Studio (lot F2) sur un faux Worker : chargement à la demande, instance unique réutilisée
 * (TR-EX-062), panne du Worker (TEST-015 : toutes les attentes résolues, aucune relance silencieuse, relance explicite),
 * délai et annulation.
 */
const RESULTAT = { brep: "QUJD", volume: 12 };
function banc(repondre: ConstructorParameters<typeof FauxWorker>[0] = (d) => (d.nature === "charger" ? { pret: true } : RESULTAT)) {
  const compteur: CompteurFaux = { crees: 0, arretes: 0, vivants: [] };
  const noyau = new NoyauExactStudio({ creerWorker: () => new FauxWorker(repondre, compteur), wasm: () => undefined });
  return { noyau, compteur };
}
afterEach(() => { vi.useRealTimers(); });

describe("noyau exact de Studio : chargement à la demande et instance unique (TR-EX-062)", () => {
  it("aucun Worker avant la première demande ; charger crée un seul Worker, prêt, suivi transmis (instances, octets transférés)", async () => {
    const { noyau, compteur } = banc();
    expect(compteur.crees).toBe(0);
    expect(noyau.metriques()).toMatchObject({ etat: "absent", workersCrees: 0, workersVivants: 0 });
    await noyau.charger();
    expect(noyau.metriques()).toMatchObject({ etat: "pret", workersCrees: 1, workersVivants: 1, chargements: 1, suivi: { instances: 1, wasm: { transfere: 5_000_000 } } });
    expect(await noyau.executer({ type: "booleen" })).toEqual(RESULTAT);
  });

  it("50 ouvertures / fermetures de l'outil et 50 calculs : un seul Worker, une seule instance, aucun chargement de plus", async () => {
    const { noyau, compteur } = banc();
    for (let i = 0; i < 50; i++) { await noyau.charger(); await noyau.executer({ type: "booleen", i }); }
    expect(compteur.crees).toBe(1);
    expect(compteur.vivants).toHaveLength(1);
    expect(noyau.metriques()).toMatchObject({ workersCrees: 1, workersVivants: 1, chargements: 1, pannes: 0, enAttente: 0, suivi: { instances: 1 } });
    expect(compteur.vivants[0]!.recus.filter((d) => d.nature === "charger")).toHaveLength(1);
  });

  it("deux chargements simultanés partagent le même chargement (jamais deux noyaux)", async () => {
    const { noyau, compteur } = banc();
    await Promise.all([noyau.charger(), noyau.charger(), noyau.executer({}), noyau.executer({})]);
    expect(compteur.crees).toBe(1);
    expect(compteur.vivants[0]!.recus.filter((d) => d.nature === "charger")).toHaveLength(1);
  });

  it("libération (moteur inactif) : le Worker est arrêté, recréé à la demande suivante sans panne comptée", async () => {
    const { noyau, compteur } = banc();
    await noyau.charger();
    noyau.arreter();
    expect(noyau.metriques()).toMatchObject({ etat: "absent", workersVivants: 0, pannes: 0 });
    await noyau.charger();
    expect(compteur.crees).toBe(2);
    expect(noyau.metriques()).toMatchObject({ etat: "pret", workersVivants: 1, chargements: 2 });
  });
});

describe("TEST-015 — panne du Worker OCCT : erreur, attentes résolues, relance contrôlée", () => {
  it("le Worker s'interrompt pendant deux calculs : les deux attentes sont rejetées (plantage), le Worker est arrêté, le noyau passe en échec", async () => {
    let w: FauxWorker | null = null;
    const { noyau, compteur } = banc((d, f) => { w = f; return d.nature === "charger" ? { pret: true } : "silence"; });
    await noyau.charger();
    const a = noyau.executer({ n: 1 }), b = noyau.executer({ n: 2 });
    await Promise.resolve();
    expect(noyau.metriques().enAttente).toBe(2);
    w!.planter();
    for (const p of [a, b]) {
      const e = await p.catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ErreurTache);
      expect(e).toMatchObject({ code: "plantage", message: MESSAGES_NOYAU_EXACT.interrompu });
    }
    expect(noyau.metriques()).toMatchObject({ etat: "echec", enAttente: 0, workersVivants: 0, pannes: 1, erreur: MESSAGES_NOYAU_EXACT.interrompu });
    expect(compteur.arretes).toBe(1);
  });

  it("aucune relance silencieuse : la demande suivante est refusée (indisponible) ; relancer crée un nouveau Worker qui calcule", async () => {
    const { noyau, compteur } = banc();
    await noyau.charger();
    noyau.interrompre();
    await expect(noyau.executer({})).rejects.toMatchObject({ code: "indisponible", message: MESSAGES_NOYAU_EXACT.aRelancer });
    expect(compteur.crees).toBe(1);
    await noyau.relancer();
    expect(compteur.crees).toBe(2);
    expect(noyau.metriques()).toMatchObject({ etat: "pret", relances: 1, erreur: null, workersVivants: 1 });
    expect(await noyau.executer({})).toEqual(RESULTAT);
  });

  it("chargement en échec (binaire introuvable) : échec annoncé, Worker arrêté, relance explicite seulement", async () => {
    let echoue = true;
    const { noyau, compteur } = banc((d) => (d.nature === "charger" && echoue ? { erreur: "WebAssembly : téléchargement impossible" } : d.nature === "charger" ? { pret: true } : RESULTAT));
    await expect(noyau.charger()).rejects.toMatchObject({ code: "calcul" });
    expect(noyau.metriques()).toMatchObject({ etat: "echec", workersVivants: 0 });
    await expect(noyau.charger()).rejects.toMatchObject({ code: "indisponible" });
    echoue = false;
    await noyau.relancer();
    expect(noyau.metriques().etat).toBe("pret");
    expect(compteur.crees).toBe(2);
  });

  it("réponse illisible (messageerror) et délai dépassé : même issue, aucune attente laissée en suspens", async () => {
    vi.useFakeTimers();
    const { noyau } = banc((d) => (d.nature === "charger" ? { pret: true } : "silence"));
    const ch = noyau.charger();
    await vi.advanceTimersByTimeAsync(0);
    await ch;
    const p = noyau.executer({}, { delaiMs: 1000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toMatchObject({ code: "delai", message: MESSAGES_NOYAU_EXACT.delai });
    expect(noyau.metriques()).toMatchObject({ etat: "echec", enAttente: 0 });
  });

  it("une erreur de calcul (opération refusée par le noyau) n'est pas une panne : le Worker reste prêt", async () => {
    const { noyau } = banc((d) => (d.nature === "charger" ? { pret: true } : { erreur: "resultat : résultat vide : aucun solide" }));
    await expect(noyau.executer({})).rejects.toMatchObject({ code: "calcul", message: "resultat : résultat vide : aucun solide" });
    expect(noyau.metriques()).toMatchObject({ etat: "pret", pannes: 0, workersVivants: 1 });
  });

  it("annulation d'un calcul en cours : rejet « annulee », Worker arrêté (calcul synchrone), rechargé ensuite sans panne", async () => {
    const { noyau, compteur } = banc((d) => (d.nature === "charger" ? { pret: true } : "silence"));
    await noyau.charger();
    const c = new AbortController();
    const p = noyau.executer({}, { signal: c.signal }).catch((e: unknown) => e);
    await Promise.resolve(); await Promise.resolve();
    c.abort();
    expect(await p).toMatchObject({ code: "annulee" });
    expect(noyau.metriques()).toMatchObject({ etat: "absent", pannes: 0 });
    await noyau.charger();
    expect(compteur.crees).toBe(2);
  });
});
