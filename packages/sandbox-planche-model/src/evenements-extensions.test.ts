/** Événements adressés aux extensions (protocole 1.0, lot 7) : résumé d'un changement, destinataires, minuteries. */
import { describe, expect, it } from "vitest";
import { BORNES_MINUTERIE, REBONDS_MAX, destinatairesEvenement, lireDelaiMinuterie, resumerChangement } from "./evenements-extensions.js";
import { modeleVide, type Id } from "./geometrie-libre.js";
import type { PaquetExtension } from "./protocole-extensions.js";
import { creerFonctionsPlanche } from "./scripts.js";

const paquet = (id: string, abonnements: string[], permissions: string[] = ["evenements"]) => ({ fiche: { id, permissions, abonnements } }) as unknown as PaquetExtension;

describe("résumé d'un changement du modèle", () => {
  it("une arête ou une face déplacée est « modifiée », même si seuls ses sommets ont bougé", () => {
    const f = creerFonctionsPlanche(modeleVide());
    const arete = (f.api.ligne([0, 0, 0], [1, 0, 0]) as Id[])[0]!;
    const face = f.api.rectangle([5, 0, 0], [1, 0, 0], [0, 1, 0]) as Id;
    const m1 = f.modele();
    f.api.deplacer([arete], [0, 0, 1]);
    const m2 = f.modele();
    expect(resumerChangement(m1, m2, "utilisateur")).toMatchObject({ ajoutes: [], modifies: [arete], supprimes: [] });
    f.api.deplacer([face], [0, 0, 1]);
    const c = resumerChangement(m2, f.modele(), "utilisateur")!;
    expect(c.modifies).toContain(face);
    expect(c.modifies).not.toContain(arete);
  });

  it("ajouts, modifications et suppressions du contexte racine ; rien si rien ne change", () => {
    const m0 = modeleVide();
    expect(resumerChangement(m0, m0, "utilisateur")).toBeNull();
    const f = creerFonctionsPlanche(m0);
    const face = f.api.rectangle([0, 0, 0], [1, 0, 0], [0, 1, 0]) as Id;
    const m1 = f.modele();
    const c1 = resumerChangement(m0, m1, "utilisateur")!;
    expect(c1.ajoutes).toContain(face);
    expect(c1).toMatchObject({ modifies: [], supprimes: [], origine: "utilisateur", tronque: false });
    const objet = f.api.grouper([face], "Dalle") as Id;
    const m2 = f.modele();
    const c2 = resumerChangement(m1, m2, "extension")!;
    expect(c2.ajoutes).toContain(objet);
    expect(c2.supprimes).toContain(face);
    f.api.deplacer([objet], [1, 0, 0]);
    expect(resumerChangement(m2, f.modele(), "utilisateur")).toMatchObject({ ajoutes: [], modifies: [objet], supprimes: [] });
    expect(resumerChangement(m2, m1, "annulation")).toMatchObject({ origine: "annulation", supprimes: [objet] });
  });
});

describe("destinataires d'un événement", () => {
  const paquets = [paquet("a", ["modele.change"]), paquet("b", ["modele.change", "selection.change"]), paquet("c", ["selection.change"]), paquet("d", ["modele.change"], [])];
  it("les abonnées seulement, avec la permission", () => {
    expect(destinatairesEvenement(paquets, "modele.change").map((p) => p.fiche.id)).toEqual(["a", "b"]);
    expect(destinatairesEvenement(paquets, "selection.change").map((p) => p.fiche.id)).toEqual(["b", "c"]);
    expect(destinatairesEvenement(paquets, "projet.ouvert")).toEqual([]);
  });
  it("une extension n'est pas prévenue de ses propres changements ; la chaîne est coupée au troisième rebond", () => {
    expect(destinatairesEvenement(paquets, "modele.change", { extension: "a", rebond: 1 }).map((p) => p.fiche.id)).toEqual(["b"]);
    expect(destinatairesEvenement(paquets, "modele.change", { extension: "a", rebond: REBONDS_MAX - 1 }).map((p) => p.fiche.id)).toEqual(["b"]);
    expect(destinatairesEvenement(paquets, "modele.change", { extension: "a", rebond: REBONDS_MAX })).toEqual([]);
  });
});

describe("minuterie", () => {
  it("délai borné, en millisecondes", () => {
    expect(lireDelaiMinuterie({ delaiMs: 250.4 })).toBe(250);
    expect(lireDelaiMinuterie({ delaiMs: 0 })).toBe(0);
    for (const v of [null, {}, { delaiMs: -1 }, { delaiMs: BORNES_MINUTERIE.delaiMaxMs + 1 }, { delaiMs: "10" }, { delaiMs: Number.NaN }]) expect(lireDelaiMinuterie(v)).toBeNull();
  });
});
