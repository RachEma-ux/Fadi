import { describe, expect, it } from "vitest";
import { cleIndicateur, indicateurPourCle, memeCle, unionIndicateurs } from "./indicateur-actif.js";

const ind = (id: string, famille: string | null, modalite: string | null = null, milieu: "ensemble" | "urbain" | "rural" | null = null, sexe: "ensemble" | "masculin" | "feminin" | null = null, titre = famille ?? id) =>
  ({ id, titre, theme: famille ? "Emploi" : null, famille, modalite, milieu, sexe });

describe("indicateur actif (D-GD-31) : reconnu par sa clé d'une couche à l'autre", () => {
  it("la clé ne dépend pas de l'identifiant ; milieu et sexe absents valent « ensemble » ; sans famille, le titre fait famille", () => {
    const regions = ind("gdind_r1", "Taux de chômage (%)", null, null, null);
    const communes = ind("gdind_c9", "Taux de chômage (%)", null, "ensemble", "ensemble");
    expect(memeCle(cleIndicateur(regions), cleIndicateur(communes))).toBe(true);
    expect(cleIndicateur(ind("x", null, null, null, null, "Effectif synthétique"))).toEqual({ theme: null, famille: "Effectif synthétique", modalite: null, milieu: "ensemble", sexe: "ensemble" });
    expect(memeCle(cleIndicateur(regions), cleIndicateur(ind("z", "Taux de chômage (%)", null, "urbain")))).toBe(false);
  });
  it("retrouve dans une couche l'indicateur d'une clé, ou null (la couche garde sa coloration)", () => {
    const cle = cleIndicateur(ind("a", "Taux de chômage (%)", null, "rural", "feminin"));
    const liste = [ind("b1", "Taux de chômage (%)"), ind("b2", "Taux de chômage (%)", null, "rural", "feminin"), ind("b3", "Âge moyen")];
    expect(indicateurPourCle(liste, cle)?.id).toBe("b2");
    expect(indicateurPourCle([ind("c1", "Âge moyen")], cle)).toBeNull();
  });
  it("réunion de plusieurs couches : une entrée par clé, la première rencontrée représente", () => {
    const u = unionIndicateurs([{ indicateurs: [ind("r1", "Taux de chômage (%)"), ind("r2", "Âge moyen")] }, { indicateurs: [ind("c1", "Taux de chômage (%)"), ind("c2", "Taux de chômage (%)", null, "urbain")] }]);
    expect(u.map((i) => i.id)).toEqual(["r1", "r2", "c2"]);
  });
});
