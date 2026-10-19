import { describe, expect, it, vi } from "vitest";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { ErreurMoteur, GestionnaireRessources, type OptionsGestionnaire } from "./gestionnaire-ressources";

function banc(o: Partial<OptionsGestionnaire> = {}) {
  let t = 0;
  const chargerPlanche = vi.fn(async () => { t += 10; return { VariantWorkspace: "planche" }; });
  const chargerRendu = vi.fn(async () => { t += 50; return { Vue3DStudio: "rendu" }; });
  const libererCalcul = vi.fn();
  const activations: unknown[] = [];
  const g = new GestionnaireRessources({
    dejaCharges: ["coquille-studio"],
    chargeurs: { "planche-2d": { charger: chargerPlanche }, "rendu-3d": { charger: chargerRendu }, calcul: { liberer: libererCalcul } },
    maintenant: () => t,
    surActivation: (m) => activations.push(m),
    ...o,
  });
  return { g, chargerPlanche, chargerRendu, libererCalcul, activations };
}

describe("Cycle d'activation des outils et des moteurs (B.3-01 à B.3-05, B.3-08, D.3-04)", () => {
  it("démarrage : seule la coquille est là ; aucun moteur lourd chargé (B.3-02)", () => {
    const { g, chargerPlanche, chargerRendu } = banc();
    expect(g.lire("coquille-studio")).toMatchObject({ initialise: true, telecharge: true, actif: false });
    for (const id of ["planche-2d", "rendu-3d", "calcul"] as const) expect(g.lire(id)).toMatchObject({ phase: "non-charge", initialise: false, telecharge: null, horsConnexion: null });
    expect(chargerPlanche).not.toHaveBeenCalled();
    expect(chargerRendu).not.toHaveBeenCalled();
  });

  it("outil 2D : la planche est chargée une fois, rien de la 3D ; activation spécialisée puis simple (PERF-02)", async () => {
    const { g, chargerPlanche, chargerRendu, activations } = banc();
    const a = await g.activerOutil("studio.dessin.ligne", "dessin");
    expect(a).toMatchObject({ nature: "specialise", moteurs: ["coquille-studio", "planche-2d"], dureeMs: 10 });
    const b = await g.activerOutil("studio.dessin.cercle", "dessin");
    expect(b).toMatchObject({ nature: "simple", dureeMs: 0 });
    expect(chargerPlanche).toHaveBeenCalledTimes(1);
    expect(chargerRendu).not.toHaveBeenCalled();
    expect(g.lire("planche-2d")).toMatchObject({ initialise: true, actif: true, usages: ["outil:studio.dessin.cercle"] });
    expect(activations).toHaveLength(2);
  });

  it("premier usage d'un outil 3D : rendu chargé avec ses dépendances, une seule fois même demandé deux fois en même temps (B.3-04, B.3-05)", async () => {
    const { g, chargerRendu, chargerPlanche } = banc();
    const [x, y] = await Promise.all([g.charger("rendu-3d"), g.charger("rendu-3d")]);
    expect(x).toBe(y);
    expect(chargerRendu).toHaveBeenCalledTimes(1);
    expect(chargerPlanche).toHaveBeenCalledTimes(1);
    const r = await g.activerOutil("studio.solide.boite", STUDIO_TOOLS.find((t) => t.toolId === "studio.solide.boite")!.groupe);
    expect(r.nature).toBe("simple");
    expect(r.moteurs).toEqual(["coquille-studio", "planche-2d", "calcul", "rendu-3d"]);
    expect(g.lire("rendu-3d").initialisations).toBe(1);
  });

  it("les quatre états restent distincts : téléchargé (cache) ≠ initialisé ≠ actif ≠ hors connexion (B.3-08)", async () => {
    const { g } = banc();
    g.poserHorsConnexion({ "rendu-3d": true, calcul: false, "planche-2d": null });
    expect(g.lire("rendu-3d")).toMatchObject({ telecharge: true, initialise: false, actif: false, horsConnexion: true });
    expect(g.lire("calcul")).toMatchObject({ telecharge: false, initialise: false, horsConnexion: false });
    expect(g.lire("planche-2d")).toMatchObject({ telecharge: null, horsConnexion: null });
    await g.charger("rendu-3d");
    expect(g.lire("rendu-3d")).toMatchObject({ telecharge: true, initialise: true, actif: false });
    const fin = g.utiliser("rendu-3d", "vue-3d");
    expect(g.lire("rendu-3d").actif).toBe(true);
    fin(); fin();
    expect(g.lire("rendu-3d")).toMatchObject({ actif: false, initialise: true });
  });

  it("changer d'outil désactive le précédent sans réinitialiser ses moteurs ; fermer la planche les rend inactifs", async () => {
    const { g, chargerRendu } = banc();
    await g.activerOutil("studio.solide.boite", "volume-libre");
    expect(g.lire("rendu-3d").actif).toBe(true);
    await g.activerOutil("studio.dessin.ligne", "dessin");
    expect(g.lire("rendu-3d")).toMatchObject({ actif: false, initialise: true });
    await g.activerOutil("studio.solide.boite", "volume-libre");
    expect(chargerRendu).toHaveBeenCalledTimes(1);
    g.desactiverOutil();
    expect(g.instantaneEtats().every((e) => !e.actif)).toBe(true);
    expect(g.outilCourant).toBeNull();
  });

  it("vingt outils usuels activés tour à tour : chaque moteur initialisé au plus une fois (D.3-04, AC-002)", async () => {
    const { g, chargerPlanche, chargerRendu } = banc();
    const vingt = STUDIO_TOOLS.filter((t) => ["dessin", "modification", "calques", "architecture"].includes(t.groupe)).slice(0, 20);
    expect(vingt).toHaveLength(20);
    for (const t of vingt) await g.activerOutil(t.toolId, t.groupe);
    expect(chargerPlanche).toHaveBeenCalledTimes(1);
    expect(chargerRendu).not.toHaveBeenCalled();
    expect(g.lire("rendu-3d").phase).toBe("non-charge");
    expect(g.instantaneEtats().map((e) => e.initialisations)).toEqual([1, 1, 0, 0]);
  });

  it("moteur passif (Workers) : initialisé par signalement, libéré seulement inactif, réinitialisé à la demande suivante (D.3-02)", async () => {
    const { g, libererCalcul } = banc();
    await g.charger("calcul");
    expect(g.lire("calcul").initialise).toBe(false);
    g.signalerInitialise("calcul");
    g.signalerInitialise("calcul");
    expect(g.lire("calcul")).toMatchObject({ initialise: true, initialisations: 1 });
    const fin = g.utiliser("calcul", "tache:1");
    expect(g.liberer("calcul")).toBe(false);
    expect(libererCalcul).not.toHaveBeenCalled();
    fin();
    expect(g.liberer("calcul")).toBe(true);
    expect(libererCalcul).toHaveBeenCalledTimes(1);
    expect(g.lire("calcul")).toMatchObject({ phase: "libere", initialise: false, telecharge: true, liberations: 1 });
    await g.charger("calcul");
    expect(g.lire("calcul").phase).toBe("libere");
    g.signalerInitialise("calcul");
    expect(g.lire("calcul").initialisations).toBe(2);
  });

  it("un moteur sans libération connue n'est jamais libéré (rendu 3D : la vue libère ses ressources GPU elle-même)", async () => {
    const { g } = banc();
    await g.charger("rendu-3d");
    expect(g.peutLiberer("rendu-3d")).toBe(false);
    expect(g.liberer("rendu-3d")).toBe(false);
  });

  it("échec de chargement : erreur locale au moteur (hors ligne si le réseau manque), nouvel essai possible", async () => {
    let enLigne = false;
    let echoue = true;
    const g = new GestionnaireRessources({
      chargeurs: { "planche-2d": { charger: async () => { if (echoue) throw new Error("réseau"); return {}; } } },
      dejaCharges: ["coquille-studio"], enLigne: () => enLigne,
    });
    await expect(g.charger("planche-2d")).rejects.toBeInstanceOf(ErreurMoteur);
    expect(g.lire("planche-2d")).toMatchObject({ phase: "echec", erreur: "hors-ligne" });
    enLigne = true; echoue = false;
    await g.charger("planche-2d");
    expect(g.lire("planche-2d")).toMatchObject({ phase: "initialise", erreur: null, initialisations: 1 });
    await expect(g.activerOutil("x", "barre-inconnue")).rejects.toMatchObject({ code: "inconnu" });
  });

  it("activation dépassée par un changement d'outil pendant le chargement : rien n'est marqué actif pour elle", async () => {
    let liberer: (() => void) | undefined;
    const g = new GestionnaireRessources({
      chargeurs: { "planche-2d": { charger: () => new Promise((r) => { liberer = () => r({}); }) } }, dejaCharges: ["coquille-studio"],
    });
    const premiere = g.activerOutil("studio.dessin.ligne", "dessin");
    const seconde = g.activerOutil("studio.dessin.cercle", "dessin");
    await vi.waitFor(() => expect(liberer).toBeDefined());
    liberer!();
    await Promise.all([premiere, seconde]);
    expect(g.lire("planche-2d").usages).toEqual(["outil:studio.dessin.cercle"]);
  });

  it("journal et abonnés : chaque transition est notée, l'instantané change de référence", async () => {
    const { g } = banc();
    const avant = g.instantaneEtats();
    const vu = vi.fn();
    g.abonner(vu);
    await g.activerOutil("studio.dessin.ligne", "dessin");
    expect(g.instantaneEtats()).not.toBe(avant);
    expect(vu).toHaveBeenCalled();
    expect(g.journal.map((e) => e.type)).toEqual(expect.arrayContaining(["chargement", "initialise", "outil-actif"]));
  });
});
