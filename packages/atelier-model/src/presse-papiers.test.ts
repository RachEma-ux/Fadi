import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "./modele.js";
import { commandesColler, copierSelection, lirePressePapiers } from "./presse-papiers.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });

const source = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "RDC", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "R+1", elevation: 3, hauteur: 3 } },
    { type: "calque.creer", params: { id: "cq", nom: "Cloisons" } },
    { type: "type.definir", params: { id: "t-cloison", classe: "mur", nom: "Cloison 10", params: { epaisseur: m(0.1) } } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.1), niveauHautId: "n1", calqueId: "cq", definitionId: "t-cloison" } },
    { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.5, largeur: m(0.9), hauteur: m(2.1) } },
    { type: "objet.creer", params: { id: "c", classe: "esquisse", niveauId: "n0", params: { forme: "cercle", points: [], ferme: true, centre: pt(8, 8), rayon: m(1), angleDebut: null, angleFin: null, motif: null } } },
    { type: "esquisse.hachure", params: { id: "h", niveauId: "n0", points: [pt(0, 5), pt(2, 5), pt(2, 6), pt(0, 6)], sourceId: null } },
  ])).etat;

const coller = (cible: ModeleAtelier, cmds: Commande[]) => appliquerLot(cible, lot(cmds, `coller-${Math.random()}`)).etat;

describe("presse-papiers (D-147, DA-02-02)", () => {
  it("copier un mur emporte ses ouvertures, son type et le nom de son calque ; une ouverture seule n'est pas copiée", () => {
    const e = source();
    const pp = copierSelection(e, ["w", "c"], "projet-a");
    expect(pp.objets.map((o) => o.id)).toEqual(["w", "p", "c"]);
    expect(pp.definitions.map((d) => d.id)).toEqual(["t-cloison"]);
    expect(pp.calques).toEqual({ cq: "Cloisons" });
    expect(pp.hauteursEffectives).toEqual({ w: 3 });
    expect(copierSelection(e, ["p"]).remarques[0]).toMatch(/sans son mur/);
    expect(lirePressePapiers(JSON.stringify(pp))?.objets).toHaveLength(3);
    expect(lirePressePapiers("{\"x\":1}")).toBeNull();
  });

  it("coller dans le même projet : nouveaux identifiants, hôte remappé, décalage ; annulable comme un lot ordinaire", () => {
    const e = source();
    const r = commandesColler(e, copierSelection(e, ["w"]), "n1", { dx: 0, dy: 10 });
    expect(r.ids).toEqual(["w-c1", "p-c1"]);
    const f = coller(e, r.commandes);
    const w = f.objets["w-c1"] as Occurrence<"mur">;
    expect([w.niveauId, w.params.a.y, w.params.niveauHautId, w.params.hauteur?.value, w.definitionId, w.calqueId]).toEqual(["n1", 10, null, 3, "t-cloison", "cq"]);
    expect((f.objets["p-c1"] as Occurrence<"porte">).params.murHoteId).toBe("w-c1");
    expect(r.remarques.some((x) => /hauteur effective \(3 m\)/.test(x))).toBe(true);
  });

  it("coller dans un autre projet : définitions copiées, calque retrouvé par son nom ou retiré (dit)", () => {
    const e = source();
    const pp = JSON.parse(JSON.stringify(copierSelection(e, ["w", "h"], "projet-a")));
    const autre = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "x0", nom: "RDC", elevation: 0, hauteur: 3 } },
      { type: "calque.creer", params: { id: "autre-cq", nom: "Cloisons" } },
      { type: "type.definir", params: { id: "t-cloison", classe: "mur", nom: "Cloison 10", params: { epaisseur: m(0.2) } } },
    ])).etat;
    const r = commandesColler(autre, pp, "x0");
    const f = coller(autre, r.commandes);
    const w = f.objets["w"] as Occurrence<"mur">;
    // Même identifiant de type mais paramètres différents : copié sous un identifiant libre.
    expect(w.definitionId).toBe("t-cloison-c1");
    expect(f.definitions["t-cloison-c1"]!.nom).toBe("Cloison 10 (collé)");
    expect(w.calqueId).toBe("autre-cq");
    expect(f.objets["h"]?.classe).toBe("esquisse");
    const sans = appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "y", nom: "R", elevation: 0, hauteur: 3 } }])).etat;
    const r2 = commandesColler(sans, pp, "y");
    expect(coller(sans, r2.commandes).objets["w"]!.calqueId).toBeNull();
    expect(r2.remarques.some((x) => /calque « Cloisons » absent/.test(x))).toBe(true);
  });
});
