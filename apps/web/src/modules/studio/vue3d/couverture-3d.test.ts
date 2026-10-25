/**
 * A.3-08 — contrôle d'interface : aucun type 3D avancé n'est proposé comme disponible. L'inventaire affiché est celui du
 * modèle ; un type non disponible n'a ni bouton ni champ, et aucun outil du catalogue (barres, gestionnaire, palette)
 * ne le propose.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STUDIO_COUVERTURE_3D, studioTypes3dNonDisponibles } from "@parcours/atelier-model";
import { CATALOGUE, normaliser } from "../planche2d/catalogue";
import { CouvertureTypes3d } from "./CouvertureTypes3d";
import en from "../../../lib/i18n/en.json";

describe("A.3-08 — interface : types 3D avancés jamais proposés comme disponibles", () => {
  const html = renderToStaticMarkup(createElement(CouvertureTypes3d));
  const items = [...html.matchAll(/<li data-studio-type-3d="([^"]+)" data-studio-type-3d-etat="([^"]+)">(.*?)<\/li>/g)].map((m) => ({ id: m[1]!, etat: m[2]!, contenu: m[3]! }));

  it("l'inventaire affiché est celui du modèle, dans son ordre, avec son état", () => {
    expect(items.map((i) => [i.id, i.etat])).toEqual(STUDIO_COUVERTURE_3D.map((t) => [t.id, t.etat]));
  });

  it("chaque type avancé est affiché « Non disponible » avec ce qui manque, sans bouton ni champ", () => {
    const avances = new Set(studioTypes3dNonDisponibles().map((t) => t.id));
    expect(avances.size).toBeGreaterThan(0);
    for (const i of items.filter((x) => avances.has(x.id))) {
      expect(i.etat).toBe("non-disponible");
      expect(i.contenu).toContain("<span>Non disponible</span>");
      expect(i.contenu).not.toContain("<span>Disponible</span>");
      expect(i.contenu).not.toMatch(/<(button|input|select|a)\b/);
    }
    expect(html).not.toMatch(/<(button|input|select|a)\b/);
  });

  it("aucun outil du catalogue (barres, gestionnaire, palette) ne propose un type avancé", () => {
    const libelles = CATALOGUE.map((e) => normaliser(e.libelleFR));
    for (const t of studioTypes3dNonDisponibles()) {
      expect(t.outils).toEqual([]);
      const nom = normaliser(t.libelle.split(" (")[0]!);
      expect(libelles.filter((l) => l.includes(nom)), t.id).toEqual([]);
    }
  });

  it("textes de l'inventaire traduits (dictionnaire anglais)", () => {
    const dico = en as Record<string, string>;
    for (const texte of ["Types 3D : inventaire de couverture", "Disponible", "Non disponible", ...STUDIO_COUVERTURE_3D.flatMap((t) => [t.libelle, ...(t.manque ? [t.manque] : [])])]) {
      expect(dico[texte], texte).toBeTruthy();
    }
  });
});
