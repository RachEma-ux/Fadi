/** Extensions installées côté serveur : lignes → paquets servis et fiches d'administration (pur, sans base). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fichesAdminPaquets, fichesComptePaquets, paquetsDeLignes, paquetsDuCompte, type LignePaquet } from "./addon-paquets.js";

const essai = (): Record<string, unknown> => JSON.parse(readFileSync(new URL("../../../web/e2e/donnees/essai-commandes.fadi-addon.json", import.meta.url), "utf8")) as Record<string, unknown>;
const at = new Date("2026-11-26T02:00:00Z");
const ligne = (addonId: string, paquet: Record<string, unknown>, reglage: Partial<Pick<LignePaquet, "state" | "defaultActive" | "origin">> = {}): LignePaquet => ({ addonId, version: "1.0.0", package: paquet, importedBy: "u1", importedAt: at, state: "experimentale", defaultActive: true, origin: "importee", ...reglage });
const renomme = (id: string, raccourcis: (i: number) => string): Record<string, unknown> => {
  const p = essai() as { fiche: { id: string; commandes: { raccourci: string }[] } };
  p.fiche.id = id;
  p.fiche.commandes.forEach((c, i) => void (c.raccourci = raccourcis(i)));
  return p as unknown as Record<string, unknown>;
};

describe("extensions installées — lignes de la base", () => {
  it("les paquets valides sont servis, dans l'ordre des identifiants", () => {
    const servis = paquetsDeLignes([ligne("essai-commandes", essai()), ligne("autre", renomme("autre", (i) => `Ctrl+Alt+${"KJYZXWT"[i]}`))]);
    expect(servis.map((p) => p.fiche.id)).toEqual(["autre", "essai-commandes"]);
    expect(servis[1]!.code).toContain("planche.sur(");
  });

  it("une ligne qui ne passe plus les règles d'import n'est pas servie, et l'administration le voit", () => {
    const lignes = [ligne("essai-commandes", essai()), ligne("casse", { format: "fadi-addon/1" }), ligne("zz-conflit", renomme("zz-conflit", (i) => `Alt+Maj+F${i + 2}`))];
    expect(paquetsDeLignes(lignes).map((p) => p.fiche.id)).toEqual(["essai-commandes"]);
    const fiches = fichesAdminPaquets(lignes);
    expect(fiches.map((f) => [f.id, f.servie])).toEqual([["casse", false], ["essai-commandes", true], ["zz-conflit", false]]);
    expect(fiches[1]).toMatchObject({ nom: { fr: "Essai des commandes", en: "Commands trial" }, version: "1.0.0", auteur: "Fadi", protocole: "1.0", commandes: 7, outils: 0, panneaux: 0, importedAt: at.toISOString(), importedBy: "u1" });
    expect(fiches[1]!.permissions).toEqual(["modele.lire", "modele.modifier", "selection", "messages", "donnees"]);
    expect(fiches[0]).toMatchObject({ nom: { fr: "casse", en: "casse" }, commandes: 0 });
    // Jamais de code ni de pages dans une fiche d'administration.
    expect(JSON.stringify(fiches)).not.toContain("planche.sur(");
  });

  it("une ligne dont l'identifiant ne correspond pas à sa fiche n'est pas servie", () => {
    expect(paquetsDeLignes([ligne("autre-nom", essai())])).toEqual([]);
  });

  it("écran d'administration : le réglage paraît dans la fiche ; un compte ne reçoit que ce qu'il a installé", () => {
    const lignes = [ligne("essai-commandes", essai(), { state: "disponible", defaultActive: false, origin: "creee" })];
    expect(fichesAdminPaquets(lignes)[0]).toMatchObject({ etat: "disponible", activeParDefaut: false, origine: "creee", servie: true });
    expect(paquetsDuCompte(lignes, {})).toEqual([]);
    expect(paquetsDuCompte(lignes, { "essai-commandes": true }).map((p) => p.fiche.id)).toEqual(["essai-commandes"]);
    expect(fichesComptePaquets(lignes, {})).toEqual([expect.objectContaining({ id: "essai-commandes", etat: "disponible", installee: false, commandes: 7 })]);
    expect(fichesComptePaquets(lignes, { "essai-commandes": true })[0]?.installee).toBe(true);
    // Installée d'origine : reçue sans geste, et le compte peut la désinstaller.
    const origine = [ligne("essai-commandes", essai())];
    expect(paquetsDuCompte(origine, {})).toHaveLength(1);
    expect(paquetsDuCompte(origine, { "essai-commandes": false })).toEqual([]);
    // Une ligne qui ne passe plus les règles n'est pas proposée aux comptes.
    expect(fichesComptePaquets([ligne("casse", { format: "autre" })], {})).toEqual([]);
  });
});
