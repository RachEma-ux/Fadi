/** Données attachées par une extension (protocole 1.0, lot 5) : objet, composant, projet ; cloisonnement ; opération. */
import { describe, expect, it } from "vitest";
import { appliquerDeltaPlanche, differencePlanche, lireModelePlanche } from "./delta.js";
import { BORNES_DONNEES, changerDonneesExtension, lireCibleDonnees, lireDonneesExtension, lireValeurDonnee } from "./donnees-extensions.js";
import { contexte, modeleVide, type Id, type Modele } from "./geometrie-libre.js";
import { creerFonctionsPlanche } from "./scripts.js";
import { creerServicesExtension, type AccesPlanche } from "./services-extensions.js";

/** Un modèle avec une boîte groupée : rend le modèle et l'identifiant de l'objet. */
function avecObjet(): { modele: Modele; objet: Id } {
  const f = creerFonctionsPlanche(modeleVide());
  const elements = f.api.boite([0, 0, 0], 1, 1, 1) as Id[];
  const objet = f.api.grouper(elements, "Boîte") as Id;
  return { modele: f.modele(), objet };
}

function planche(depart: Modele) {
  const etat = { modele: depart, selection: [] as Id[], pas: [] as string[] };
  const acces: AccesPlanche = {
    modele: () => etat.modele,
    selection: () => etat.selection,
    dans: () => undefined,
    appliquer: (travail, nom) => {
      etat.modele = travail;
      etat.pas.push(nom);
      return true;
    },
    selectionner: (ids) => void (etat.selection = [...ids]),
  };
  return { etat, acces };
}
const ok = (r: { ok: boolean; resultat?: unknown }) => {
  expect(r).toMatchObject({ ok: true });
  return (r as { resultat: unknown }).resultat;
};
const service = (id: string, acces: AccesPlanche) => creerServicesExtension({ id, permissions: ["donnees", "modele.modifier", "modele.lire"] }, acces);

describe("données attachées — formes", () => {
  it("cible : projet, objet, composant ; le reste est refusé", () => {
    expect(lireCibleDonnees("projet")).toEqual({ genre: "projet" });
    expect(lireCibleDonnees("o12")).toEqual({ genre: "objet", id: "o12" });
    expect(lireCibleDonnees({ composant: "o12" })).toEqual({ genre: "composant", occurrence: "o12" });
    for (const v of [null, "", 3, {}, { composant: 3 }, { composant: "o1", autre: 1 }, ["o1"]]) expect(lireCibleDonnees(v), JSON.stringify(v)).toBeNull();
  });

  it("valeur : des données seulement, bornées en taille et en profondeur", () => {
    expect(lireValeurDonnee({ a: [1, "x", true, null] })).toEqual({ valeur: { a: [1, "x", true, null] } });
    expect(lireValeurDonnee(Number.NaN)).toBeUndefined();
    expect(lireValeurDonnee(undefined)).toBeUndefined();
    expect(lireValeurDonnee(() => 1)).toBeUndefined();
    expect(lireValeurDonnee(new Date())).toBeUndefined();
    expect(lireValeurDonnee("x".repeat(BORNES_DONNEES.valeur))).toBeUndefined();
    let profond: unknown = 1;
    for (let i = 0; i <= BORNES_DONNEES.profondeur; i++) profond = [profond];
    expect(lireValeurDonnee(profond)).toBeUndefined();
  });
});

describe("données attachées — modèle", () => {
  it("objet, composant et projet gardent chacun leurs clés ; le modèle d'entrée n'est pas touché", () => {
    const { modele, objet } = avecObjet();
    let m = modele;
    for (const cible of [{ genre: "objet", id: objet }, { genre: "composant", occurrence: objet }, { genre: "projet" }] as const) {
      const r = changerDonneesExtension(m, "essai", cible, { cle: "ref", valeur: { valeur: cible.genre } });
      expect(r.ok && r.valeur !== null).toBe(true);
      if (r.ok && r.valeur) m = r.valeur.modele;
    }
    expect(contexte(m, undefined).occurrences[objet]!.donnees).toEqual({ essai: { ref: "objet" } });
    expect(Object.values(m.definitions)[0]!.donnees).toEqual({ essai: { ref: "composant" } });
    expect(m.annotations?.reglages?.donneesExtensions).toEqual({ essai: { ref: "projet" } });
    expect(contexte(modele, undefined).occurrences[objet]!.donnees).toBeUndefined();
    expect(lireDonneesExtension(m, "autre", { genre: "objet", id: objet })).toEqual({ ok: true, valeur: {} });
  });

  it("retirer la dernière clé ne laisse rien ; une cible absente est nommée ; la borne des clés tient", () => {
    const { modele, objet } = avecObjet();
    const cible = { genre: "objet", id: objet } as const;
    const pose = changerDonneesExtension(modele, "essai", cible, { cle: "a", valeur: { valeur: 1 } });
    const m1 = pose.ok && pose.valeur ? pose.valeur.modele : modele;
    expect(changerDonneesExtension(m1, "essai", cible, { cle: "a", valeur: { valeur: 1 } })).toEqual({ ok: true, valeur: null });
    const ote = changerDonneesExtension(m1, "essai", cible, { cle: "a" });
    expect(ote.ok && ote.valeur ? contexte(ote.valeur.modele, undefined).occurrences[objet]!.donnees : "x").toBeUndefined();
    expect(changerDonneesExtension(modele, "essai", { genre: "objet", id: "o999" }, { cle: "a", valeur: { valeur: 1 } })).toMatchObject({ ok: false, motif: "introuvable" });
    let m = modele;
    for (let i = 0; i < BORNES_DONNEES.cles; i++) {
      const r = changerDonneesExtension(m, "essai", { genre: "projet" }, { cle: `k${i}`, valeur: { valeur: i } });
      if (r.ok && r.valeur) m = r.valeur.modele;
    }
    expect(changerDonneesExtension(m, "essai", { genre: "projet" }, { cle: "deTrop", valeur: { valeur: 1 } })).toMatchObject({ ok: false, motif: "trop" });
  });

  it("les données suivent l'objet copié, passent par le delta et par la relecture du modèle", () => {
    const { modele, objet } = avecObjet();
    const pose = changerDonneesExtension(modele, "essai", { genre: "objet", id: objet }, { cle: "ref", valeur: { valeur: { n: 3 } } });
    const m1 = pose.ok && pose.valeur ? pose.valeur.modele : modele;
    const f = creerFonctionsPlanche(m1);
    const copies = f.api.copier([objet], [2, 0, 0]) as Id[];
    expect(contexte(f.modele(), undefined).occurrences[copies[0]!]!.donnees).toEqual({ essai: { ref: { n: 3 } } });
    const pr = changerDonneesExtension(m1, "essai", { genre: "projet" }, { cle: "k", valeur: { valeur: [1, 2] } });
    const m2 = pr.ok && pr.valeur ? pr.valeur.modele : m1;
    const rejoue = appliquerDeltaPlanche(modele, differencePlanche(modele, m2)!);
    expect(contexte(rejoue, undefined).occurrences[objet]!.donnees).toEqual({ essai: { ref: { n: 3 } } });
    expect(rejoue.annotations?.reglages?.donneesExtensions).toEqual({ essai: { k: [1, 2] } });
    expect(JSON.stringify(lireModelePlanche(JSON.parse(JSON.stringify(m2))))).toBe(JSON.stringify(m2));
  });
});

describe("données attachées — services d'une extension", () => {
  it("écrire ouvre une opération automatique : un seul pas d'annulation à la fin de l'appel", () => {
    const { modele, objet } = avecObjet();
    const { etat, acces } = planche(modele);
    const s = service("essai", acces);
    s.debutAppel("Étiqueter");
    ok(s.servir("donnees.ecrire", { cible: objet, cle: "ref", valeur: "A-12" }));
    ok(s.servir("donnees.ecrire", { cible: "projet", cle: "compteur", valeur: 1 }));
    // Pendant l'opération, l'extension relit ce qu'elle vient d'écrire ; la Planche, elle, n'a encore rien reçu.
    expect(ok(s.servir("donnees.lire", { cible: objet, cle: "ref" }))).toBe("A-12");
    expect(etat.pas).toEqual([]);
    expect(s.finAppel(true)).toBe(true);
    expect(etat.pas).toEqual(["Étiqueter"]);
    expect(ok(s.servir("donnees.lire", { cible: objet }))).toEqual({ ref: "A-12" });
    expect(ok(s.servir("donnees.lire", { cible: "projet", cle: "absent" }))).toBeNull();
  });

  it("une extension ne voit ni ne touche les données d'une autre", () => {
    const { modele, objet } = avecObjet();
    const { acces } = planche(modele);
    const a = service("alpha", acces);
    const b = service("beta", acces);
    a.debutAppel("a");
    ok(a.servir("donnees.ecrire", { cible: objet, cle: "ref", valeur: "secret" }));
    a.finAppel(true);
    expect(ok(b.servir("donnees.lire", { cible: objet }))).toEqual({});
    b.debutAppel("b");
    ok(b.servir("donnees.effacer", { cible: objet }));
    ok(b.servir("donnees.ecrire", { cible: objet, cle: "ref", valeur: "autre" }));
    b.finAppel(true);
    expect(ok(a.servir("donnees.lire", { cible: objet, cle: "ref" }))).toBe("secret");
    a.debutAppel("a2");
    ok(a.servir("donnees.effacer", { cible: objet, cle: "ref" }));
    a.finAppel(true);
    expect(ok(a.servir("donnees.lire", { cible: objet }))).toEqual({});
    expect(ok(b.servir("donnees.lire", { cible: objet, cle: "ref" }))).toBe("autre");
  });

  it("formes refusées avec une erreur nommée ; un appel échoué n'écrit rien ; la permission est exigée", () => {
    const { modele, objet } = avecObjet();
    const { etat, acces } = planche(modele);
    const s = service("essai", acces);
    expect(s.servir("donnees.ecrire", { cible: objet, cle: "1mauvaise", valeur: 1 })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("donnees.ecrire", { cible: objet, cle: "ref" })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("donnees.ecrire", { cible: "o999", cle: "ref", valeur: 1 })).toMatchObject({ ok: false, erreur: "objet_introuvable" });
    expect(s.servir("donnees.lire", { cible: 3 })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    s.debutAppel("x");
    ok(s.servir("donnees.ecrire", { cible: objet, cle: "ref", valeur: 1 }));
    s.finAppel(false);
    expect(etat.modele).toBe(modele);
    const sans = creerServicesExtension({ id: "essai", permissions: ["modele.modifier"] }, acces);
    expect(sans.servir("donnees.ecrire", { cible: objet, cle: "ref", valeur: 1 })).toEqual({ ok: false, erreur: "permission_refusee", detail: "donnees" });
  });
});
