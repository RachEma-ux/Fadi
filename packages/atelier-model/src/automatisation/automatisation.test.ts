import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, ErreurCommande, type Commande } from "../commandes/index.js";
import { importerModeleNatif, type JeuNatif } from "../import/natif.js";
import { modeleVide, objetsDeClasse, type ModeleAtelier } from "../modele.js";
import { m, pt } from "../unites.js";
import { boucleControlee, cleCache, generateurRegles, ITERATIONS_MAX, normaliserIntention, type Generateur } from "./assistant.js";
import { developperScript, ErreurScript, evaluer, SCRIPTS_INTEGRES, validerScript } from "./scripts.js";

const P118 = importerModeleNatif(JSON.parse(readFileSync(new URL("../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif).modele;
const lot = (commands: Commande[]) => ({ requestId: "s", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "s", commands });
const base = (): ModeleAtelier => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }])).etat;
const script = (id: string) => SCRIPTS_INTEGRES.find((s) => s.id === id)!;

describe("expressions des scripts", () => {
  it("arithmétique sûre : priorités, parenthèses, moins unaire ; variables inconnues et division par zéro refusées", () => {
    expect(evaluer("ox + i * px", { ox: 1, i: 2, px: 5 })).toBe(11);
    expect(evaluer("-(2 + 3) * 2 / 4", {})).toBe(-2.5);
    expect(evaluer("0.1 + 0.2", {})).toBe(0.3);
    expect(() => evaluer("x + 1", {})).toThrow(/variable inconnue/);
    expect(() => evaluer("1 / (2 - 2)", {})).toThrow(/division par zéro/);
    expect(() => evaluer("process.exit()", {})).toThrow(ErreurScript);
    expect(() => evaluer("2 ** 3", {})).toThrow(/terme attendu/);
  });
});

describe("scripts (T19 : mêmes commandes, mêmes refus)", () => {
  it("trame de poteaux : nx × ny commandes poteau.creer ordinaires, positions calculées, hauteur exigée", () => {
    const e = base();
    const c = developperScript(script("trame-poteaux"), e, { niveauId: "rdc", nx: 3, ny: 2, px: 6, py: 4, hauteur: 3 });
    expect(c).toHaveLength(6);
    expect(c.every((x) => x.type === "poteau.creer")).toBe(true);
    expect(c[5]!.params).toMatchObject({ niveauId: "rdc", point: { x: 12, y: 4, frame: "local", unit: "m" }, largeur: { value: 0.3, unit: "m" }, hauteur: { value: 3, unit: "m" }, nom: "Poteau 2-1" });
    const r = appliquerLot(e, lot(c));
    expect(objetsDeClasse(r.etat, "poteau")).toHaveLength(6);
    expect(() => developperScript(script("trame-poteaux"), e, { niveauId: "rdc" })).toThrow(/Hauteur.*requis/);
    expect(() => developperScript(script("trame-poteaux"), e, { niveauId: "inconnu", hauteur: 3 })).toThrow(/niveau inconnu/);
    expect(() => developperScript(script("trame-poteaux"), e, { niveauId: "rdc", nx: 0, hauteur: 3 })).toThrow(/1 au moins/);
    expect(() => developperScript(script("trame-poteaux"), e, { niveauId: "rdc", nx: 30, ny: 30, hauteur: 3 })).toThrow(/500 au plus/);
  });

  it("un refus du modèle reste le refus du modèle : section nulle refusée par le réducteur comme pour un geste", () => {
    const e = base();
    const s = { ...script("trame-poteaux"), parametres: script("trame-poteaux").parametres.map((p) => (p.nom === "section" ? { ...p, type: "nombre" as const } : p)) };
    const c = developperScript(s, e, { niveauId: "rdc", nx: 1, ny: 1, section: 0, hauteur: 3 });
    expect(() => appliquerLot(e, lot(c))).toThrow(ErreurCommande);
  });

  it("boucle sur les niveaux : un plan par niveau ; validation de forme d'un script utilisateur", () => {
    const c = developperScript(script("plans-par-niveau"), P118, { echelle: 200 });
    expect(c).toHaveLength(Object.keys(P118.niveaux).length);
    expect(c[0]!.params).toMatchObject({ type: "plan", echelle: 200, titre: expect.stringMatching(/^Plan · /) });
    expect(() => validerScript({ id: "X", nom: "x", commandes: [] })).toThrow(/identifiant/);
    expect(() => validerScript({ id: "ok", nom: "x", commandes: [{ type: "interne.restaurer", params: {} }] })).toThrow(/réservée/);
    expect(validerScript({ id: "mon-script", nom: "Mon script", parametres: [{ nom: "n", type: "entier" }], commandes: [{ type: "texte.creer", params: { niveauId: "rdc", position: { x: "=n", y: 0, frame: "local", unit: "m" }, texte: "T{n}" } }] })).toMatchObject({ id: "mon-script", version: 1 });
  });
});

describe("assistant à boucle contrôlée (D4)", () => {
  it("feuilles et quantités sur le P.118 : un plan et une feuille par niveau, hypothèses écrites, essai à blanc valide, rien d'appliqué", () => {
    const p = boucleControlee(P118, "Prépare les feuilles et les quantités", generateurRegles, { niveauId: null });
    expect(p.statut).toBe("proposee");
    const n = Object.keys(P118.niveaux).length;
    expect(p.commandes.filter((c) => c.type === "vue.creer")).toHaveLength(n);
    expect(p.commandes.filter((c) => c.type === "feuille.creer").length).toBeGreaterThan(0);
    expect(p.hypotheses[0]).toMatchObject({ texte: "Échelle des plans 1:100" });
    expect(p.iterations).toEqual([{ numero: 1, commandes: p.commandes.length, resultat: "valide", erreur: null }]);
    expect(p.effets!.crees.length).toBe(p.commandes.length);
    expect(Object.values(P118.definitions).some((d) => d.id.startsWith("assistant-"))).toBe(false);
  });

  it("pièces détectées depuis des murs fermés ; trame de poteaux comprise depuis l'intention ; intention inconnue = incomprise", () => {
    const e = appliquerLot(base(), lot([
      { type: "mur.tracer", params: { id: "a", niveauId: "rdc", a: pt(0, 0), b: pt(5, 0), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "b", niveauId: "rdc", a: pt(5, 0), b: pt(5, 4), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "c", niveauId: "rdc", a: pt(5, 4), b: pt(0, 4), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "d", niveauId: "rdc", a: pt(0, 4), b: pt(0, 0), epaisseur: m(0.2), hauteur: m(3) } },
    ])).etat;
    const pieces = boucleControlee(e, "Détecter les pièces", generateurRegles, { niveauId: "rdc" });
    expect(pieces).toMatchObject({ statut: "proposee", regle: "pieces-detectees" });
    expect(pieces.commandes).toHaveLength(1);
    expect(pieces.hypotheses[0]!.texte).toMatch(/à nommer/);
    const trame = boucleControlee(e, "Trame de poteaux 3 × 2 tous les 6 m", generateurRegles, { niveauId: "rdc" });
    expect(trame.commandes).toHaveLength(6);
    expect(trame.hypotheses.map((h) => h.texte)).toEqual(["Hauteur 3 m", "Section 0,30 × 0,30 m, origine (0 ; 0) du repère local"]);
    expect(boucleControlee(e, "fais un café", generateurRegles, { niveauId: null }).statut).toBe("incomprise");
  });

  it("auto-correction bornée à trois itérations ; la correction est écrite au journal des hypothèses", () => {
    const e = base();
    let appels = 0;
    const tetu: Generateur = {
      id: "test",
      proposer: () => ({ regle: "t", explication: "t", hypotheses: [], commandes: [{ type: "niveau.supprimer", params: { id: "inconnu" } }] }),
      corriger: (g) => {
        appels++;
        return g; // ne corrige jamais
      },
    };
    const p = boucleControlee(e, "x", tetu, { niveauId: null });
    expect(p.statut).toBe("echouee");
    expect(p.iterations).toHaveLength(ITERATIONS_MAX);
    expect(appels).toBe(ITERATIONS_MAX - 1);
    // Le générateur de règles retire la commande refusée et le note.
    const g = generateurRegles.corriger({ regle: "r", explication: "", hypotheses: [], commandes: [{ type: "niveau.creer", params: { id: "rdc", nom: "x", elevation: 0 } }, { type: "texte.creer", params: { niveauId: "rdc", position: pt(0, 0), texte: "ok" } }] }, new ErreurCommande("precondition", "commands[0].id", "niveau déjà existant"), e)!;
    expect(g.commandes).toHaveLength(1);
    expect(g.hypotheses[0]!.motif).toMatch(/refusée par le modèle/);
  });

  it("cache : la séquence validée est réessayée telle quelle (même clé : intention normalisée + version des règles)", () => {
    expect(normaliserIntention("  Trame de POTEAUX 3×2 ! ")).toBe("trame de poteaux 3x2");
    expect(cleCache("Feuilles et quantités", { niveauId: null })).toBe(cleCache("feuilles  et QUANTITES", { niveauId: null }));
    const e = base();
    const cache = { commandes: [{ type: "texte.creer", params: { niveauId: "rdc", position: pt(1, 1), texte: "A" } }], hypotheses: [], regle: "r", explication: "e" };
    expect(boucleControlee(e, "x", generateurRegles, { niveauId: null }, cache)).toMatchObject({ statut: "proposee", depuisCache: true });
    // Séquence en cache devenue invalide : régénérée par les règles (ici intention inconnue).
    expect(boucleControlee(modeleVide(), "x", generateurRegles, { niveauId: null }, cache)).toMatchObject({ statut: "incomprise", depuisCache: false });
  });
});
