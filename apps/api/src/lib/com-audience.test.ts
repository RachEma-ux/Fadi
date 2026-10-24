import { describe, expect, it } from "vitest";
import {
  audiencePermise, debutHistorique, empreinteApercu, empreinteEnvoi, etatRemise, extrait, libelleAudience, peutEcrire, peutGerer, peutLire,
  refusChangementAudience, trierMentions, type Lecteur,
} from "./com-audience.js";
import { aujourdHui, demandeApres, demandeAutorisee, enRetard, refusClotureDemande } from "./demandes-regles.js";

const actif = { historyFrom: null, removedAt: null };
const l = (role: Lecteur["role"], participation: Lecteur["participation"] = null, userId = "u"): Lecteur => ({ userId, role, participation });

describe("COM — lisibilité recalculée depuis l'accès courant (COM-D3, COM-R5)", () => {
  it("refus par défaut sans accès au projet, quelle que soit l'audience ou la participation", () => {
    for (const a of ["participants", "equipe", "projet"] as const) expect(peutLire(a, l(null, actif))).toBe(false);
  });
  it("équipe : propriétaire et éditeurs ; ni lecteur ni support", () => {
    expect(peutLire("equipe", l("proprietaire"))).toBe(true);
    expect(peutLire("equipe", l("editeur"))).toBe(true);
    expect(peutLire("equipe", l("lecteur"))).toBe(false);
    expect(peutLire("equipe", l("support"))).toBe(false);
  });
  it("projet : tous les membres ; l'accès support lit sans écrire", () => {
    expect(peutLire("projet", l("lecteur"))).toBe(true);
    expect(peutLire("projet", l("support"))).toBe(true);
    expect(peutEcrire("projet", l("support"))).toBe(false);
    expect(peutEcrire("projet", l("lecteur"))).toBe(true);
  });
  it("participants : participation active seulement ; le propriétaire non participant ne lit pas", () => {
    expect(peutLire("participants", l("lecteur", actif))).toBe(true);
    expect(peutLire("participants", l("proprietaire"))).toBe(false);
    expect(peutLire("participants", l("editeur", { historyFrom: null, removedAt: new Date() }))).toBe(false);
    expect(peutLire("participants", l("support", actif))).toBe(false);
  });
  it("gestion : l'animateur qui lit encore, ou le propriétaire du projet", () => {
    expect(peutGerer("participants", l("lecteur", actif, "a"), "a")).toBe(true);
    expect(peutGerer("participants", l("lecteur", null, "a"), "a")).toBe(false);
    expect(peutGerer("participants", l("proprietaire", null, "p"), "a")).toBe(true);
    expect(peutGerer("equipe", l("editeur", null, "b"), "a")).toBe(false);
  });
  it("historique reçu à l'ajout (COM-D4)", () => {
    const d = new Date("2026-10-24T10:00:00Z");
    expect(debutHistorique("participants", l("editeur", { historyFrom: d, removedAt: null }))).toEqual(d);
    expect(debutHistorique("equipe", l("editeur", { historyFrom: d, removedAt: null }))).toBeNull();
  });
});

describe("COM — audience affichée et changée (COM-R1, COM-D5)", () => {
  it("libellé clair avant l'envoi", () => {
    expect(libelleAudience("equipe", { code: "P1" })).toBe("Visible par : équipe du projet P1 (propriétaire et éditeurs)");
    expect(libelleAudience("projet", { code: "P1" })).toContain("lecteurs compris");
    expect(libelleAudience("participants", { code: "P1" }, ["a@x", "b@x"])).toBe("Visible par : a@x, b@x");
  });
  it("direct et groupe restent « participants »", () => {
    expect(audiencePermise("direct", "equipe")).toBe(false);
    expect(audiencePermise("groupe", "participants")).toBe(true);
    expect(audiencePermise("contexte", "projet")).toBe(true);
    expect(refusChangementAudience("groupe", "participants", "projet", [])?.body.error).toBe("audience_fixe");
  });
  it("refus si un auteur perdait la lecture de son propre message", () => {
    const lecteurAuteur = l("lecteur", null, "lec");
    expect(refusChangementAudience("contexte", "projet", "equipe", [lecteurAuteur])?.body.error).toBe("audience_auteur_exclu");
    expect(refusChangementAudience("contexte", "equipe", "projet", [l("editeur", null, "e")])).toBeNull();
    expect(refusChangementAudience("contexte", "projet", "projet", [])?.body.error).toBe("audience_inchangee");
  });
  it("un auteur sorti du projet ne bloque pas le changement", () => {
    expect(refusChangementAudience("contexte", "projet", "equipe", [l(null, null, "parti")])).toBeNull();
  });
});

describe("COM — mentions sans accès (COM-R3, COM-D7)", () => {
  const lecteurs = new Map<string, Lecteur>([
    ["e", l("editeur", null, "e")], ["lec", l("lecteur", null, "lec")], ["sup", l("support", null, "sup")], ["parti", l(null, null, "parti")],
  ]);
  it("hors projet refusé, sans accès non notifié, lisible notifié", () => {
    const t = trierMentions(["e", "lec", "inconnu", "sup", "parti", "e"], lecteurs, "equipe");
    expect(t.notifiables).toEqual(["e"]);
    expect(t.sansAcces).toEqual(["lec"]);
    expect(t.horsProjet.sort()).toEqual(["inconnu", "parti", "sup"]);
  });
});

describe("COM — empreintes, extraits, remise", () => {
  it("l'empreinte d'aperçu change avec les destinataires ou le contenu, pas avec leur ordre", () => {
    expect(empreinteApercu(["a", "b"], ["x"])).toBe(empreinteApercu(["b", "a"], ["x"]));
    expect(empreinteApercu(["a"], ["x"])).not.toBe(empreinteApercu(["a", "c"], ["x"]));
    expect(empreinteApercu(["a"], ["x"])).not.toBe(empreinteApercu(["a"], ["y"]));
    expect(empreinteEnvoi({ b: 1 })).toBe(empreinteEnvoi({ b: 1 }));
  });
  it("extrait borné, espaces normalisés", () => {
    expect(extrait("  a\n b  ")).toBe("a b");
    expect(extrait("x".repeat(130))).toHaveLength(121);
  });
  it("états distincts : accepté, ouvert, accusé (COM-R6)", () => {
    expect(etatRemise({ openedAt: null, acknowledgedAt: null })).toBe("accepte");
    expect(etatRemise({ openedAt: new Date(), acknowledgedAt: null })).toBe("ouvert");
    expect(etatRemise({ openedAt: new Date(), acknowledgedAt: new Date() })).toBe("accuse");
  });
});

describe("Demandes de précision (COM-D10)", () => {
  const a = (userId: string, role: "proprietaire" | "editeur" | "lecteur" | "support" = "editeur") => ({ userId, role, requesterId: "dem", responderId: "rep" });
  it("cycle", () => {
    expect(demandeApres("ouverte", "repondre")).toBe("repondue");
    expect(demandeApres("repondue", "repondre")).toBeNull();
    expect(demandeApres("repondue", "cloturer")).toBe("close");
    expect(demandeApres("close", "rouvrir")).toBe("ouverte");
    expect(demandeApres("close", "reattribuer")).toBeNull();
    expect(demandeApres("ouverte", "rouvrir")).toBeNull();
  });
  it("droits : le répondant répond, le demandeur ou le propriétaire clôt / rouvre / réattribue", () => {
    expect(demandeAutorisee("repondre", a("rep"))).toBe(true);
    expect(demandeAutorisee("repondre", a("dem"))).toBe(false);
    expect(demandeAutorisee("repondre", a("p", "proprietaire"))).toBe(false);
    expect(demandeAutorisee("cloturer", a("dem", "lecteur"))).toBe(true);
    expect(demandeAutorisee("cloturer", a("p", "proprietaire"))).toBe(true);
    expect(demandeAutorisee("reattribuer", a("rep"))).toBe(false);
    expect(demandeAutorisee("cloturer", a("dem", "support"))).toBe(false);
  });
  it("clôture sans réponse : motif exigé", () => {
    expect(refusClotureDemande("ouverte", undefined)).not.toBeNull();
    expect(refusClotureDemande("ouverte", "  ")).not.toBeNull();
    expect(refusClotureDemande("ouverte", "sans objet")).toBeNull();
    expect(refusClotureDemande("repondue", undefined)).toBeNull();
  });
  it("retard : ouverte et échéance passée ; jamais fermée par le temps", () => {
    expect(enRetard({ statut: "ouverte", echeance: "2026-10-01" }, "2026-10-24")).toBe(true);
    expect(enRetard({ statut: "ouverte", echeance: "2026-10-24" }, "2026-10-24")).toBe(false);
    expect(enRetard({ statut: "repondue", echeance: "2026-10-01" }, "2026-10-24")).toBe(false);
    expect(aujourdHui(new Date("2026-10-24T23:30:00Z"), "Europe/Paris")).toBe("2026-10-25");
  });
});
