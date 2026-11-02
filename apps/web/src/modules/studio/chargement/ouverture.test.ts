// Ouverture d'une variante : origine de PERF-01 (entrée sur la route, navigation seulement pour une page ouverte
// directement sur une variante) et limite de la planche (seul un échec de moteur est capturé ; « Réessayer » crée
// réellement un nouveau composant différé).
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { ErreurMoteur } from "./gestionnaire-ressources";
import { LimitePlanche, nouvellePlanche, plancheActuelle, reessayerPlanche } from "./DemarrageStudio";
import { perfStudio } from "./perf";
import { _reinitialiserOuverture, debutOuverture, finOuverture, origineOuverture, quitterVariante } from "./useRessources";

const VARIANTE = "https://fadi.test/studio/projets/p1/etudes/s1/variantes/v1";

describe("PERF-01 : départ à l'entrée sur la route de la variante", () => {
  beforeEach(() => _reinitialiserOuverture());

  it("navigation seulement pour la première variante d'une page ouverte directement sur elle", () => {
    expect(origineOuverture(VARIANTE, true)).toBe("navigation");
    expect(origineOuverture(`${VARIANTE}?revision=r2`, true)).toBe("navigation");
    // Page ouverte sur l'accueil ou un projet de Studio, puis navigation interne vers la variante.
    expect(origineOuverture("https://fadi.test/studio", true)).toBe("route");
    expect(origineOuverture("https://fadi.test/studio/projets/p1", true)).toBe("route");
    expect(origineOuverture("https://fadi.test/projets", true)).toBe("route");
    // Seconde variante de la page, ou environnement sans Navigation Timing.
    expect(origineOuverture(VARIANTE, false)).toBe("route");
    expect(origineOuverture(null, true)).toBe("route");
  });

  it("une mesure par entrée sur une variante ; la première seule part de la navigation", () => {
    const avant = perfStudio.mesures("PERF-01").length;
    debutOuverture(VARIANTE);
    finOuverture(3);
    finOuverture(3); // planche prête une seconde fois : aucune seconde mesure
    quitterVariante();
    debutOuverture(VARIANTE);
    finOuverture(0);
    const m = perfStudio.mesures("PERF-01").slice(avant);
    expect(m.map((x) => x.etiquettes.depuis)).toEqual(["navigation", "route"]);
    expect(m[0]!.etiquettes.objets).toBe(3);
  });

  it("sortie de la variante avant la planche prête : aucune mesure relevée", () => {
    const avant = perfStudio.mesures("PERF-01").length;
    debutOuverture("https://fadi.test/studio");
    quitterVariante();
    finOuverture(1);
    expect(perfStudio.mesures("PERF-01").length).toBe(avant);
  });
});

describe("Limite de la planche : échec de moteur seulement, réessai réel", () => {
  const limite = (onReessayer: () => void = () => undefined) => {
    const l = new LimitePlanche({ children: "planche", onReessayer });
    let etat: { erreur: unknown } = l.state;
    l.setState = ((s: { erreur: unknown }) => { etat = s; l.state = s; }) as typeof l.setState;
    return { l, etat: () => etat };
  };

  it("un échec de chargement du moteur est affiché localement", () => {
    const { l } = limite();
    l.state = LimitePlanche.getDerivedStateFromError(new ErreurMoteur("hors-ligne", "planche-2d", "x"));
    const rendu = l.render() as ReactElement<Record<string, unknown>>;
    expect(isValidElement(rendu)).toBe(true);
    expect(rendu.props["data-studio-planche-indisponible"]).toBe("hors-ligne");
  });

  it("toute autre erreur est relancée vers la limite de Studio", () => {
    const { l } = limite();
    const autre = new TypeError("rendu cassé");
    l.state = LimitePlanche.getDerivedStateFromError(autre);
    expect(() => l.render()).toThrow(autre);
  });

  it("« Réessayer » : nouveau composant différé, puis la planche est rendue à nouveau", async () => {
    const avant = plancheActuelle();
    let cree: unknown = null;
    const { l, etat } = limite(() => { cree = nouvellePlanche(); });
    l.state = { erreur: new ErreurMoteur("echec-chargement", "planche-2d", "x") };
    await l.reessayer();
    expect(cree).not.toBe(avant);
    expect(plancheActuelle()).toBe(cree);
    expect(etat().erreur).toBeNull();
    expect(l.render()).toBe("planche");
  });

  it("« Réessayer » : l'alerte reste tant que la planche n'est pas installée", async () => {
    let finir: () => void = () => undefined;
    const { l } = limite(() => new Promise<void>((r) => { finir = r; }));
    l.state = { erreur: new ErreurMoteur("echec-chargement", "planche-2d", "x") };
    const attente = l.reessayer();
    await Promise.resolve();
    expect(l.state.erreur).toBeInstanceOf(ErreurMoteur);
    finir();
    await attente;
    expect(l.state.erreur).toBeNull();
  });
});

describe("Réessai du moteur de la planche (NAV-008)", () => {
  it("chargement réussi : la planche est installée, la page n'est pas rechargée", async () => {
    const appels: string[] = [];
    await reessayerPlanche(async () => "module", () => appels.push("installer"), () => appels.push("recharger"));
    expect(appels).toEqual(["installer"]);
  });

  it("nouvel échec (import gardé en échec par le navigateur) : la page est rechargée, rien n'est installé", async () => {
    const appels: string[] = [];
    let resolue = false;
    void reessayerPlanche(() => Promise.reject(new Error("module")), () => appels.push("installer"), () => appels.push("recharger")).then(() => { resolue = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(appels).toEqual(["recharger"]);
    expect(resolue).toBe(false);
  });
});
