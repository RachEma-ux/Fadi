import { describe, expect, it } from "vitest";
import type { DefinitionOutil } from "./contrats";
import { APERCU_VIDE, creerContexte, creerEtatInterface, creerPilote, creerRegistre, creerRegistreDessinateurs, creerSelection, normaliser } from "./index";

const outil = (id: string, libelle: string, extra: Partial<DefinitionOutil> = {}): DefinitionOutil => ({
  id,
  libelle,
  famille: "creer",
  niveau: "essentiel",
  synonymes: [],
  fiches: [],
  aide: { action: libelle, conditions: "un niveau actif", exemple: "" },
  vues: ["plan"],
  ecrit: true,
  activation: () => ({ ok: true }),
  commencer: () => ({ traiter: () => ({ action: "continuer" }), apercu: () => ({ formes: [], champs: [], consigne: "", erreurs: [] }), abandonner: () => {} }),
  ...extra,
});

describe("socle du nouvel Atelier", () => {
  it("sélection : remplacer, ajouter, basculer, retirer ; principal = dernier ; notification seulement si changement", () => {
    const s = creerSelection();
    let n = 0;
    const fin = s.abonner(() => n++);
    s.choisir(["a", "b"]);
    expect(s.lire()).toEqual({ ids: ["a", "b"], principal: "b" });
    s.choisir(["a"], "ajouter");
    expect(s.lire()).toEqual({ ids: ["b", "a"], principal: "a" });
    s.choisir(["a", "c"], "basculer");
    expect(s.lire().ids).toEqual(["b", "c"]);
    s.choisir(["b"], "retirer");
    expect(s.lire()).toEqual({ ids: ["c"], principal: "c" });
    const avant = n;
    s.choisir(["c"]);
    expect(n).toBe(avant);
    s.vider();
    expect(s.lire()).toEqual({ ids: [], principal: null });
    fin();
    s.choisir(["x"]);
    expect(n).toBe(avant + 1);
  });

  it("registre : identifiant et raccourci uniques ; recherche par libellé, synonyme, sans accents, filtrée par niveau", () => {
    const r = creerRegistre();
    r.enregistrer(outil("creer.mur", "Mur", { raccourci: "M", synonymes: ["wall", "cloison"] }));
    r.enregistrer(outil("modifier.decaler", "Décaler", { famille: "modifier", synonymes: ["offset"], niveau: "contextuel" }));
    r.enregistrer(outil("modifier.ajuster", "Ajuster", { famille: "modifier", synonymes: ["trim"], niveau: "complet" }));
    expect(() => r.enregistrer(outil("creer.mur", "Autre"))).toThrow(/déjà enregistré/);
    expect(() => r.enregistrer(outil("creer.autre", "Autre", { raccourci: "m" }))).toThrow(/déjà pris/);
    expect(r.rechercher("decal", "complet").map((o) => o.id)).toEqual(["modifier.decaler"]);
    expect(r.rechercher("OFFSET", "complet").map((o) => o.id)).toEqual(["modifier.decaler"]);
    expect(r.rechercher("trim", "contextuel")).toEqual([]);
    expect(r.rechercher("", "essentiel").map((o) => o.id)).toEqual(["creer.mur"]);
    expect(normaliser("  Éclaté ")).toBe("eclate");
  });
});

describe("pilote, état de vue, dessinateurs, contexte", () => {
  const etatVide = { projetId: "p", revision: 3, empreinte: "e", versionOntologie: 1, objets: {}, relations: [], catalogue: { version: 1, definitions: [] }, proprietesProjet: [], supprimes: [] } as unknown as import("@parcours/atelier-model").EtatModele;

  const fauxBus = (joignabilite: "en-ligne" | "hors-ligne" = "en-ligne", file: number = 0) => {
    const appels: string[] = [];
    return {
      appels,
      bus: {
        etatLocal: () => etatVide,
        etatConfirme: () => etatVide,
        entrees: () => Array.from({ length: file }) as never[],
        joignabilite: () => joignabilite,
        rafraichir: async () => (appels.push("rafraichir"), true),
        executer: async (label: string) => (appels.push(`executer:${label}`), { ok: true as const, requestId: "r", etat: etatVide }),
      },
      client: {
        annuler: async (_p: string, d: { baseRevision: number }) => (appels.push(`annuler@${d.baseRevision}`), { statut: "accepte" as const, reponse: {} as never }),
        retablir: async () => ({ statut: "injoignable" as const, message: "réseau" }),
      },
    };
  };

  it("pilote : activer, valider avec ou sans fin de session, sélection, outil inconnu ou lecture seule refusé", async () => {
    const { bus, client, appels } = fauxBus();
    const vue = creerEtatInterface();
    const ctx = creerContexte({ projetId: "p", bus, client, selection: creerSelection(), vue, ecriture: { permise: true }, genererId: () => "x" });
    const r = creerRegistre();
    let n = 0;
    r.enregistrer(outil("creer.mur", "Mur", {
      commencer: () => ({
        traiter: (e) => (e.type === "touche" ? { action: "terminer" } : n++ === 0 ? { action: "valider", label: "Mur 1", commandes: [], terminer: false } : { action: "valider", label: "Mur 2", commandes: [], terminer: true }),
        apercu: () => ({ formes: [], champs: [], consigne: "point suivant", erreurs: [] }),
        abandonner: () => {},
      }),
    }));
    r.enregistrer(outil("selection.clic", "Sélection", { ecrit: false, commencer: () => ({ traiter: () => ({ action: "selectionner", ids: ["m1"], mode: "remplacer" }), apercu: () => APERCU_VIDE, abandonner: () => {} }) }));
    const p = creerPilote(r, ctx, vue);
    expect(p.activer("inconnu")).toEqual({ ok: false, motif: "outil « inconnu » inconnu" });
    expect(p.activer("creer.mur")).toEqual({ ok: true });
    expect(vue.lire().outilActif).toBe("creer.mur");
    expect(p.apercu().consigne).toBe("point suivant");
    const point = { x: 0, y: 0, frame: "local", repereLocal: "projet" } as unknown as import("@parcours/atelier-model").PointLocal;
    const evt = { type: "appui" as const, point, accrochage: { type: "aucun" as const, libelle: "" }, modificateurs: { maj: false, ctrl: false, alt: false }, objetSousPointeur: null };
    await p.traiter(evt);
    expect(p.outilActif()?.id).toBe("creer.mur");
    await p.traiter(evt);
    expect(p.outilActif()).toBeNull();
    expect(vue.lire().outilActif).toBeNull();
    expect(appels).toEqual(["executer:Mur 1", "executer:Mur 2"]);
    p.activer("selection.clic");
    await p.traiter(evt);
    expect(ctx.selection.lire().ids).toEqual(["m1"]);

    const lecture = creerContexte({ projetId: "p", bus, client, selection: creerSelection(), vue, ecriture: { permise: false, motif: "exemple protégé" } });
    expect(creerPilote(r, lecture, vue).activer("creer.mur")).toEqual({ ok: false, motif: "exemple protégé" });
    expect(creerPilote(r, lecture, vue).activer("selection.clic")).toEqual({ ok: true });
  });

  it("contexte : niveau actif lu à l'appel ; annuler par le serveur puis relecture ; refus hors ligne, file non vide, serveur injoignable", async () => {
    const { bus, client, appels } = fauxBus();
    const vue = creerEtatInterface();
    const ctx = creerContexte({ projetId: "p", bus, client, selection: creerSelection(), vue, ecriture: { permise: true }, genererId: () => "id" });
    expect(ctx.niveauActif()).toBeNull();
    vue.modifier({ niveauActifId: "n1" });
    expect(ctx.niveauActif()).toBe("n1");
    expect(ctx.nouvelId("mur")).toBe("mur-id");
    expect((await ctx.annuler()).ok).toBe(true);
    expect(appels).toEqual(["annuler@3", "rafraichir"]);
    const r = await ctx.retablir();
    expect(r.ok === false && r.erreurs[0]?.cause).toBe("injoignable");
    const hors = fauxBus("hors-ligne");
    const r2 = await creerContexte({ projetId: "p", bus: hors.bus, client: hors.client, selection: creerSelection(), vue, ecriture: { permise: true } }).annuler();
    expect(r2.ok === false && r2.erreurs[0]?.cause).toBe("hors ligne");
    const file = fauxBus("en-ligne", 1);
    const r3 = await creerContexte({ projetId: "p", bus: file.bus, client: file.client, selection: creerSelection(), vue, ecriture: { permise: true } }).annuler();
    expect(r3.ok === false && r3.erreurs[0]?.cause).toMatch(/attendent leur envoi/);
    expect(file.appels).toEqual([]);
  });

  it("dessinateurs : classe unique, dessin d'un niveau trié par couche, calques masqués exclus", () => {
    const d = creerRegistreDessinateurs();
    const dessin = (couche: "fond" | "objet") => (o: { id: string }) => ({ objetId: o.id, couche, formes: [], segments: [], points: [], contour: null });
    d.enregistrer({ classes: ["mur"], dessiner: dessin("objet") });
    d.enregistrer({ classes: ["dalle"], dessiner: dessin("fond") });
    expect(() => d.enregistrer({ classes: ["mur"], dessiner: dessin("objet") })).toThrow(/déjà prise/);
    const etat = { ...etatVide, objets: { m: { id: "m", classe: "mur", niveauId: "n1" }, s: { id: "s", classe: "dalle", niveauId: "n1" }, c: { id: "c", classe: "mur", niveauId: "n1", calqueId: "k" }, z: { id: "z", classe: "mur", niveauId: "n2" }, t: { id: "t", classe: "texte", niveauId: "n1" } } } as unknown as import("@parcours/atelier-model").EtatModele;
    expect(d.dessinerNiveau(etat, "n1", ["k"]).map((x) => x.objetId)).toEqual(["s", "m"]);
  });
});
