/**
 * Cas 4 du catalogue, étape 3 : locaux (D9-F10-016). Surface, périmètre, niveau, hauteur et volume calculés depuis la
 * géométrie et recalculés quand elle bouge ; contour ouvert signalé, jamais une surface fausse.
 */
import { describe, expect, it } from "vitest";
import { appliquerDeltaPlanche, differencePlanche, empreintePlanche, estDeltaPlanche, lireModelePlanche } from "./delta.js";
import { type Modele, ajouterRectangle, deplacer, effacerEntites, modeleVide } from "./geometrie-libre.js";
import { creerLocal, estLocal, lireSaisieLocal, localDeLaFace, mesurerLocal, modifierLocal, numeroSuivant, supprimerLocal, tableauLocaux } from "./locaux.js";
import { ajouterNiveau } from "./niveaux.js";
import { v3 } from "./vecteur.js";

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const nouvelles = (avant: Modele, apres: Modele) => Object.keys(apres.racine.faces).filter((f) => !avant.racine.faces[f]);
/** Sol 5 × 4 à z, et sa face. */
function sol(m: Modele, z: number, x = 0, l = 5, p = 4): { modele: Modele; face: string } {
  const r = ajouterRectangle(m, v3(x, 0, z), v3(l, 0, 0), v3(0, p, 0)).modele;
  return { modele: r, face: nouvelles(m, r)[0]! };
}

describe("locaux", () => {
  it("crée un local sur une face de sol : surface, périmètre, niveau, centre", () => {
    let m = ok(ajouterNiveau(modeleVide(), { nom: "RDC", altitude: 0, hauteur: 2.5 })).modele;
    const s = sol(m, 0);
    m = ok(creerLocal(s.modele, s.face, { numero: "101", nom: "Séjour", usage: "Séjour" })).modele;
    const [l] = tableauLocaux(m).lignes;
    expect(l!.etat).toBe("ferme");
    expect(l!.surface).toBeCloseTo(20, 9);
    expect(l!.perimetre).toBeCloseTo(18, 9);
    expect(l!.niveau?.nom).toBe("RDC");
    expect(l!.centre).toEqual({ x: 2.5, y: 2, z: 0 });
    expect(l!.hauteur).toBeNull();
    expect(l!.volume).toBeNull();
    expect(localDeLaFace(m, s.face)?.nom).toBe("Séjour");
  });

  it("refus nommés : face inconnue ou déjà prise, numéro pris, hauteur non positive", () => {
    const s = sol(modeleVide(), 0);
    const m = ok(creerLocal(s.modele, s.face, { numero: "1", nom: "A" })).modele;
    expect(creerLocal(m, "f999", { numero: "2", nom: "B" })).toEqual({ ok: false, erreur: "face" });
    expect(creerLocal(m, s.face, { numero: "2", nom: "B" })).toEqual({ ok: false, erreur: "face-prise" });
    const s2 = sol(m, 0, 10);
    expect(creerLocal(s2.modele, s2.face, { numero: " 1 ", nom: "B" })).toEqual({ ok: false, erreur: "numero-pris" });
    expect(creerLocal(s2.modele, s2.face, { numero: "2", nom: "B", hauteur: 0 })).toEqual({ ok: false, erreur: "hauteur" });
    expect(numeroSuivant(m)).toBe("2");
  });

  it("hauteur sous plafond mesurée jusqu'à la face au-dessus, ou déclarée ; volume", () => {
    const s = sol(modeleVide(), 0);
    const plafond = sol(s.modele, 2.5, -1, 7, 6);
    let m = ok(creerLocal(plafond.modele, s.face, { numero: "1", nom: "Séjour" })).modele;
    let l = tableauLocaux(m).lignes[0]!;
    expect(l.hauteur).toBeCloseTo(2.5, 9);
    expect(l.origineHauteur).toBe("mesuree");
    expect(l.volume).toBeCloseTo(50, 9);
    m = ok(modifierLocal(m, l.local.id, { numero: "1", nom: "Séjour", hauteur: 2.4 })).modele;
    l = tableauLocaux(m).lignes[0]!;
    expect(l.origineHauteur).toBe("declaree");
    expect(l.volume).toBeCloseTo(48, 9);
  });

  it("recalcul exact quand une paroi bouge de 0,20 m ; contour ouvert si la face disparaît", () => {
    const s = sol(modeleVide(), 0);
    let m = ok(creerLocal(s.modele, s.face, { numero: "1", nom: "Séjour" })).modele;
    const f = m.racine.faces[s.face]!;
    const droite = new Set(f.exterieur.filter((v) => Math.abs(m.racine.sommets[v]!.position.x - 5) < 1e-9));
    const arete = Object.values(m.racine.aretes).find((a) => droite.has(a.a) && droite.has(a.b))!;
    m = deplacer(m, [arete.id], v3(0.2, 0, 0)).modele;
    expect(tableauLocaux(m).lignes[0]!.surface).toBeCloseTo(20.8, 9);
    m = effacerEntites(m, [s.face]).modele;
    const l = tableauLocaux(m);
    expect(l.lignes[0]!.etat).toBe("contour-ouvert");
    expect(l.lignes[0]!.surface).toBeNull();
    expect(l.total).toBe(0);
    expect(l.evalues).toBe(0);
  });

  it("saisie lue sans correction silencieuse ; suppression ; persistance validée", () => {
    expect(lireSaisieLocal({ numero: " 101 ", nom: "Séjour", usage: "", hauteur: "2,50" })).toEqual({ valeurs: { numero: "101", nom: "Séjour", hauteur: 2.5 } });
    expect(lireSaisieLocal({ numero: "", nom: "A", usage: "", hauteur: "" })).toEqual({ erreur: "numero" });
    expect(lireSaisieLocal({ numero: "1", nom: "A", usage: "", hauteur: "-1" })).toEqual({ erreur: "hauteur" });
    const s = sol(modeleVide(), 0);
    const r = ok(creerLocal(s.modele, s.face, { numero: "1", nom: "A" }));
    const d = differencePlanche(s.modele, r.modele);
    expect(d && estDeltaPlanche(JSON.parse(JSON.stringify(d)))).toBe(true);
    expect(empreintePlanche(appliquerDeltaPlanche(s.modele, d!))).toBe(empreintePlanche(r.modele));
    expect(lireModelePlanche(JSON.parse(JSON.stringify(r.modele)))).not.toBeNull();
    const faux = JSON.parse(JSON.stringify(r.modele));
    faux.annotations.locaux[r.id].nom = "";
    expect(lireModelePlanche(faux)).toBeNull();
    expect(estLocal("l1", { id: "l1", numero: "1", nom: "A", face: "f1", hauteur: -2 })).toBe(false);
    const sup = ok(supprimerLocal(r.modele, r.id)).modele;
    expect(sup.annotations?.locaux).toBeUndefined();
    expect(mesurerLocal(r.modele, r.modele.annotations!.locaux![r.id]!).etat).toBe("ferme");
  });
});
