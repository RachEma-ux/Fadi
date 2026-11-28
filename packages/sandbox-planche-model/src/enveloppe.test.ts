/** Contrôle du volume contre l'enveloppe (cas 4, étape 7c : D6-F20b-004) : réglages, contrôle trois états, persistance. */
import { describe, expect, it } from "vitest";
import { appliquerDeltaPlanche, differencePlanche, estDeltaPlanche, lireModelePlanche } from "./delta.js";
import { ajouterRectangle, deplacer, grouper, masquerEntites, modeleVide, pousserTirer, type Id, type Modele } from "./geometrie-libre.js";
import { REGLES_HAUTEUR_MAX, ajouterRegleHauteur, basculerControle, controlerEnveloppe, definirEnveloppe, enveloppeDe, estReglagesEnveloppe, modifierRegleHauteur, supprimerRegleHauteur } from "./enveloppe.js";
import { v3 } from "./vecteur.js";

/** Ajoute une boîte (x, y, l, p, h) groupée ; renvoie l'occurrence. */
function boite(m: Modele, x: number, y: number, l: number, p: number, h: number): { m: Modele; occ: Id } {
  const avant = new Set([...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)]);
  const sol = ajouterRectangle(m, v3(x, y, 0), v3(l, 0, 0), v3(0, p, 0)).modele;
  const f = Object.keys(sol.racine.faces).find((k) => !avant.has(k)) as Id;
  const b = pousserTirer(sol, f, sol.racine.faces[f]!.normale.z > 0 ? h : -h).modele;
  const nouveaux = [...Object.keys(b.racine.faces), ...Object.keys(b.racine.aretes)].filter((k) => !avant.has(k));
  const g = grouper(b, nouveaux);
  return { m: g.modele, occ: g.occurrence };
}

function scene(): { m: Modele; env: Id; projet: Id } {
  const a = boite(modeleVide(), 0, 0, 10, 10, 10);
  const b = boite(a.m, 2, 2, 4, 3, 6);
  return { m: b.m, env: a.occ, projet: b.occ };
}

describe("Enveloppe : réglages", () => {
  it("désigne, bascule, ajoute / modifie / supprime une règle ; rien n'est fourni par Fadi", () => {
    const { m, env } = scene();
    expect(enveloppeDe(m)).toEqual({ objet: null, controle: false, regles: [] });
    expect(definirEnveloppe(m, "inconnu")).toEqual({ ok: false, erreur: "objet" });
    const d = definirEnveloppe(m, env);
    if (!d.ok) throw new Error("d");
    const c = basculerControle(d.modele);
    if (!c.ok) throw new Error("c");
    expect(enveloppeDe(c.modele)).toMatchObject({ objet: env, controle: true });
    expect(ajouterRegleHauteur(c.modele, "  ")).toEqual({ ok: false, erreur: "libelle" });
    const r = ajouterRegleHauteur(c.modele, "Hauteur au faîte");
    if (!r.ok || !r.id) throw new Error("r");
    expect(enveloppeDe(r.modele).regles[0]).toEqual({ id: "r1", libelle: "Hauteur au faîte", seuil: null, source: "" });
    expect(modifierRegleHauteur(r.modele, "r1", { seuil: -1 })).toEqual({ ok: false, erreur: "seuil" });
    expect(modifierRegleHauteur(r.modele, "r9", { seuil: 5 })).toEqual({ ok: false, erreur: "absent" });
    const s = modifierRegleHauteur(r.modele, "r1", { seuil: 5, source: " Règlement communal, art. 12 (saisi) " });
    if (!s.ok) throw new Error("s");
    expect(enveloppeDe(s.modele).regles[0]).toMatchObject({ seuil: 5, source: "Règlement communal, art. 12 (saisi)" });
    const x = supprimerRegleHauteur(s.modele, "r1");
    expect(x.ok && enveloppeDe(x.modele).regles).toEqual([]);
    // Tout retiré : la clé disparaît du modèle.
    if (!x.ok) throw new Error("x");
    const sansControle = basculerControle(x.modele);
    if (!sansControle.ok) throw new Error("b");
    const vide = definirEnveloppe(sansControle.modele, null);
    expect(vide.ok && vide.modele.annotations?.enveloppe).toBeUndefined();
  });

  it("valide les réglages reçus", () => {
    expect(estReglagesEnveloppe({ objet: null, controle: false, regles: [] })).toBe(true);
    expect(estReglagesEnveloppe({ objet: "o1", controle: true, regles: [{ id: "r1", libelle: "H", seuil: 3, source: "s" }] })).toBe(true);
    expect(estReglagesEnveloppe({ objet: null, controle: false, regles: [{ id: "x", libelle: "H", seuil: 3, source: "" }] })).toBe(false);
    expect(estReglagesEnveloppe({ objet: null, controle: false, regles: [{ id: "r1", libelle: "H", seuil: 0, source: "" }] })).toBe(false);
    expect(estReglagesEnveloppe({ objet: null, controle: "oui", regles: [] })).toBe(false);
    const r = { id: "r1", libelle: "H", seuil: null, source: "" };
    expect(estReglagesEnveloppe({ objet: null, controle: false, regles: [r, r] })).toBe(false);
  });
});

describe("Enveloppe : contrôle", () => {
  it("non évaluée sans enveloppe, ou si l'enveloppe n'est pas fermée", () => {
    const { m, projet } = scene();
    expect(controlerEnveloppe(m).lignes[0]).toMatchObject({ id: "contenu", etat: "non-evaluee", motif: "sans-enveloppe" });
    const plan = ajouterRectangle(m, v3(20, 0, 0), v3(5, 0, 0), v3(0, 5, 0)).modele;
    const avant = new Set([...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)]);
    const g = grouper(plan, [...Object.keys(plan.racine.faces), ...Object.keys(plan.racine.aretes)].filter((k) => !avant.has(k)));
    const d = definirEnveloppe(g.modele, g.occurrence);
    if (!d.ok) throw new Error("d");
    expect(controlerEnveloppe(d.modele).lignes[0]).toMatchObject({ etat: "non-evaluee", motif: "enveloppe-ouverte", valeur: null });
    void projet;
  });

  it("vérifiée dedans, écart au point le plus défavorable dehors ; faces hors enveloppe ; enveloppe masquée", () => {
    const { m, env, projet } = scene();
    const d = definirEnveloppe(m, env);
    if (!d.ok) throw new Error("d");
    const dedans = controlerEnveloppe(d.modele);
    expect(dedans.lignes[0]).toMatchObject({ etat: "verifiee", valeur: 0, marge: -0 });
    expect(dedans.hors).toEqual([]);
    expect(dedans.sommets).toBe(8);
    // Le projet dépasse de 1,5 m en x et de 2 m en z (point le plus défavorable : coin (11.5, *, 12), distance à la surface = 2,5 m).
    const dep = deplacer(d.modele, [projet], v3(5.5, 0, 6)).modele;
    const dehors = controlerEnveloppe(dep);
    const l = dehors.lignes[0]!;
    expect(l.etat).toBe("ecart");
    expect(l.valeur).toBeCloseTo(Math.hypot(1.5, 2), 6);
    expect(l.point).toMatchObject({ x: 11.5, z: 12 });
    expect(dehors.hors.length % 9).toBe(0);
    expect(dehors.hors.length).toBeGreaterThan(0);
    // Masquer l'enveloppe ne change pas le résultat.
    const masque = masquerEntites(dep, [env]).modele;
    expect(controlerEnveloppe(masque).lignes[0]!.valeur).toBeCloseTo(l.valeur!, 9);
  });

  it("hauteurs : seuil saisi avec sa source, marge signée ; seuil absent = non évaluée", () => {
    const { m, env } = scene();
    let x = definirEnveloppe(m, env);
    if (!x.ok) throw new Error("x");
    const a = ajouterRegleHauteur(x.modele, "Hauteur à la corniche");
    if (!a.ok) throw new Error("a");
    const b = ajouterRegleHauteur(a.modele, "Hauteur au faîte");
    if (!b.ok) throw new Error("b");
    x = modifierRegleHauteur(b.modele, "r1", { seuil: 5.5, source: "Saisie de test" });
    if (!x.ok) throw new Error("x2");
    const r = controlerEnveloppe(x.modele);
    // Le point le plus haut du projet est l'enveloppe exclue : z = 6 (boîte de 6 m).
    expect(r.lignes[1]).toMatchObject({ id: "r1", genre: "hauteur", valeur: 6, seuil: 5.5, etat: "ecart", source: "Saisie de test" });
    expect(r.lignes[1]!.marge).toBeCloseTo(-0.5, 9);
    expect(r.lignes[2]).toMatchObject({ id: "r2", etat: "non-evaluee", motif: "sans-seuil", valeur: 6, marge: null });
    const ok = modifierRegleHauteur(x.modele, "r1", { seuil: 7 });
    expect(ok.ok && controlerEnveloppe(ok.modele).lignes[1]).toMatchObject({ etat: "verifiee", marge: 1 });
  });
});

describe("Enveloppe : persistance", () => {
  it("relu par lireModelePlanche, transmis et retiré par delta", () => {
    const { m, env } = scene();
    const d = definirEnveloppe(m, env);
    if (!d.ok) throw new Error("d");
    const a = ajouterRegleHauteur(d.modele, "H");
    if (!a.ok) throw new Error("a");
    const relu = lireModelePlanche(JSON.parse(JSON.stringify(a.modele)));
    expect(relu && enveloppeDe(relu)).toEqual(enveloppeDe(a.modele));
    const brut = JSON.parse(JSON.stringify(a.modele));
    brut.annotations.enveloppe.regles[0].seuil = "12 m";
    expect(lireModelePlanche(brut)).toBeNull();
    const delta = differencePlanche(m, a.modele)!;
    expect(estDeltaPlanche(JSON.parse(JSON.stringify(delta)))).toBe(true);
    expect(enveloppeDe(appliquerDeltaPlanche(m, delta))).toEqual(enveloppeDe(a.modele));
    const retour = differencePlanche(a.modele, m)!;
    expect(retour.annotations?.enveloppe).toBeNull();
    expect(appliquerDeltaPlanche(a.modele, retour).annotations?.enveloppe).toBeUndefined();
    expect(estDeltaPlanche({ annotations: { enveloppe: { objet: 3 } } })).toBe(false);
  });

  it("32 règles au plus : la 33e est refusée et le modèle reste lisible", () => {
    let m = modeleVide();
    for (let i = 0; i < REGLES_HAUTEUR_MAX; i++) {
      const r = ajouterRegleHauteur(m, `Règle ${i + 1}`);
      if (!r.ok) throw new Error(String(i));
      m = r.modele;
    }
    expect(ajouterRegleHauteur(m, "Une de trop")).toEqual({ ok: false, erreur: "limite" });
    expect(lireModelePlanche(JSON.parse(JSON.stringify(m)))).not.toBeNull();
  });
});
