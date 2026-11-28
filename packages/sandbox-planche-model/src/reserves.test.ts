/** Réserves de chantier (cas 4, étape 7b : D11-F18-037) : pose, fiche, levée datée, filtres, persistance validée, outil. */
import { describe, expect, it } from "vitest";
import { lireModelePlanche } from "./delta.js";
import { ajouterRectangle, grouper, modeleVide, pousserTirer, type Id, type Modele } from "./geometrie-libre.js";
import { machineReserve } from "./outils/reserve.js";
import { creerReserve, enRetard, estReserve, filtrerReserves, leverReserve, lotsDesReserves, modifierReserve, numeroReserveSuivant, reservesDe, supprimerReserve } from "./reserves.js";
import { v3 } from "./vecteur.js";

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

function boite(): { m: Modele; occ: Id } {
  const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
  const f = Object.keys(sol.racine.faces)[0] as Id;
  const b = pousserTirer(sol, f, sol.racine.faces[f]!.normale.z > 0 ? 2 : -2).modele;
  const g = grouper(b, [...Object.keys(b.racine.faces), ...Object.keys(b.racine.aretes)]);
  return { m: g.modele, occ: g.occurrence };
}

describe("Réserves de chantier", () => {
  it("pose, fiche, levée datée puis réouverture, suppression ; numéros jamais redonnés", () => {
    const { m: m0, occ } = boite();
    expect(numeroReserveSuivant(m0)).toBe(1);
    expect(creerReserve(m0, { point: v3(0, 0, 0), objet: null, aujourdhui: "27.11.2026" })).toEqual({ ok: false, erreur: "date" });
    const a = creerReserve(m0, { point: v3(1, 0, 1), objet: occ, aujourdhui: "2026-11-27" });
    if (!a.ok) throw new Error("a");
    const r = a.modele.annotations!.reserves![a.id]!;
    expect([r.numero, r.statut, r.levee, r.echeance, r.lot, r.creee, r.objet]).toEqual([1, "ouverte", null, "", "", "2026-11-27", occ]);
    const b = creerReserve(a.modele, { point: v3(2, 0, 0), objet: null, aujourdhui: "2026-11-27", lot: "Façades", entreprise: "Crépis SA", echeance: "2026-12-05" });
    if (!b.ok) throw new Error("b");
    expect(modifierReserve(b.modele, a.id, { echeance: "12.12.2026" })).toEqual({ ok: false, erreur: "date" });
    expect(modifierReserve(b.modele, a.id, { photo: "javascript:alert(1)" })).toEqual({ ok: false, erreur: "photo" });
    const f = modifierReserve(b.modele, a.id, { lot: " Menuiseries ext. ", entreprise: "Bois & Co", description: "Joint absent en allège.", echeance: "2026-12-12", photo: PHOTO });
    if (!f.ok) throw new Error("f");
    expect(f.modele.annotations!.reserves![a.id]!.lot).toBe("Menuiseries ext.");
    const l = leverReserve(f.modele, b.id, "2026-11-28");
    if (!l.ok) throw new Error("l");
    expect(l.modele.annotations!.reserves![b.id]).toMatchObject({ statut: "levee", levee: "2026-11-28" });
    const o = leverReserve(l.modele, b.id, "2026-11-29");
    expect(o.ok && o.modele.annotations!.reserves![b.id]).toMatchObject({ statut: "ouverte", levee: null });
    // Filtres et lots.
    const liste = reservesDe(l.modele);
    expect(lotsDesReserves(l.modele)).toEqual(["Façades", "Menuiseries ext."]);
    expect(filtrerReserves(liste, { lot: "Façades", statut: null }).map((x) => x.numero)).toEqual([2]);
    expect(filtrerReserves(liste, { lot: null, statut: "ouverte" }).map((x) => x.numero)).toEqual([1]);
    expect(enRetard(liste[0]!, "2026-12-13")).toBe(true);
    expect(enRetard(liste[0]!, "2026-12-12")).toBe(false);
    // Persistance validée.
    const relu = lireModelePlanche(JSON.parse(JSON.stringify(l.modele)));
    expect(relu?.annotations?.reserves?.[a.id]?.photo).toBe(PHOTO);
    const faux = JSON.parse(JSON.stringify(l.modele));
    faux.annotations.reserves[b.id].levee = null;
    expect(lireModelePlanche(faux)).toBeNull();
    expect(estReserve("q1", { ...r, id: "q1", statut: "close" })).toBe(false);
    // Suppression : le numéro 2 n'est pas redonné tant que le 1 reste… le suivant est 3.
    const s = supprimerReserve(l.modele, a.id);
    if (!s.ok) throw new Error("s");
    expect(numeroReserveSuivant(s.modele)).toBe(3);
  });

  it("outil Réserve : un clic épingle sur l'objet touché, en un pas ; lecture seule et date absente refusées", () => {
    const { m, occ } = boite();
    const ctx = { modele: m, selection: [], separateurDecimal: "," as const, aujourdhui: "2026-11-27" };
    const rayon = { origine: v3(2, -10, 1), direction: v3(0, 1, 0) };
    const e0 = machineReserve.initial();
    const t = machineReserve.traiter(e0, { genre: "clic", rayon, tolerance: 0.05, double: false } as never, ctx);
    expect(t.operation).toBe("Réserve");
    const r = Object.values(t.modele!.annotations!.reserves!)[0]!;
    expect(r.objet).toBe(occ);
    expect(r.point.y).toBeCloseTo(0, 6);
    expect(t.etat.posee).toBe(r.id);
    expect(machineReserve.traiter(e0, { genre: "clic", rayon, tolerance: 0.05, double: false } as never, { ...ctx, lecture: true }).modele).toBeUndefined();
    const { aujourdhui: _a, ...sansDate } = ctx;
    expect(machineReserve.traiter(e0, { genre: "clic", rayon, tolerance: 0.05, double: false } as never, sansDate).etat.erreur).toMatch(/Date du jour/);
  });
});
