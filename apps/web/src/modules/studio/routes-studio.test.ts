import { describe, expect, it } from "vitest";
import { cheminComparaisonStudio, cheminEtudeStudio, cheminProjetStudio, cheminVarianteStudio, estRouteStudio, lireRouteStudio, valeurCoteStudio } from "./routes-studio";

const lire = (chemin: string) => {
  const [p, q = ""] = chemin.split("?");
  return lireRouteStudio(p!, q ? `?${q}` : "");
};

describe("adresses de Studio", () => {
  it("accueil : /studio, avec ou sans barre finale", () => {
    expect(lireRouteStudio("/studio")).toEqual({ vue: "accueil" });
    expect(lireRouteStudio("/studio/")).toEqual({ vue: "accueil" });
  });

  it("projet : identifiant opaque, aller-retour exact", () => {
    const id = "3f2b6c1e-9a4d-4c55-8e0f-0a1b2c3d4e5f";
    expect(lireRouteStudio(cheminProjetStudio(id))).toEqual({ vue: "projet", projectId: id, archives: false });
    expect(lireRouteStudio(`/studio/projets/${id}/`)).toEqual({ vue: "projet", projectId: id, archives: false });
  });

  it("étude : projet et étude opaques, aller-retour exact", () => {
    expect(lireRouteStudio(cheminEtudeStudio("p_1", "studio_study_2"))).toEqual({ vue: "etude", projectId: "p_1", studyId: "studio_study_2", archives: false });
    expect(lireRouteStudio("/studio/projets/p_1/etudes").vue).toBe("inconnue");
    expect(lireRouteStudio("/studio/projets/p_1/etudes/s_2/x").vue).toBe("inconnue");
    expect(lireRouteStudio("/studio/projets/p_1/autre/s_2").vue).toBe("inconnue");
  });

  it("variante : version courante sans paramètre, révision historique par ?revision=, aller-retour exact", () => {
    const base = { vue: "variante", projectId: "p_1", studyId: "s_2", variantId: "v_3", commentaires: false };
    expect(lire(cheminVarianteStudio("p_1", "s_2", "v_3"))).toEqual({ ...base, revisionId: null });
    expect(cheminVarianteStudio("p_1", "s_2", "v_3")).not.toContain("?");
    expect(lire(cheminVarianteStudio("p_1", "s_2", "v_3", "studio_revision_4"))).toEqual({ ...base, revisionId: "studio_revision_4" });
  });

  it("variante : commentaires=ouverts ouvre le panneau des commentaires, seul ou avec une révision, aller-retour exact", () => {
    const base = { vue: "variante", projectId: "p_1", studyId: "s_2", variantId: "v_3" };
    expect(cheminVarianteStudio("p_1", "s_2", "v_3", null, { commentaires: true })).toBe("/studio/projets/p_1/etudes/s_2/variantes/v_3?commentaires=ouverts");
    expect(lire(cheminVarianteStudio("p_1", "s_2", "v_3", null, { commentaires: true }))).toEqual({ ...base, revisionId: null, commentaires: true });
    expect(lire(cheminVarianteStudio("p_1", "s_2", "v_3", "r_4", { commentaires: true }))).toEqual({ ...base, revisionId: "r_4", commentaires: true });
    expect(cheminVarianteStudio("p_1", "s_2", "v_3", null, { commentaires: false })).not.toContain("?");
  });

  it("variante : paramètre répété, vide, non admis ou étranger → adresse non reconnue", () => {
    const chemin = "/studio/projets/p_1/etudes/s_2/variantes/v_3";
    for (const q of ["?revision=a&revision=b", "?revision=", "?revision=..%2Fx", "?domaine=dessin", "?planche=2d", "?vue=x", "?revision=a&x=1", "?commentaires=", "?commentaires=1", "?commentaires=ouverts&commentaires=ouverts", "?commentaires=fermes"]) {
      expect(lireRouteStudio(chemin, q).vue).toBe("inconnue");
    }
    expect(lireRouteStudio("/studio/projets/p_1/etudes/s_2/variantes").vue).toBe("inconnue");
    expect(lireRouteStudio(`${chemin}/x`).vue).toBe("inconnue");
  });

  it("comparaison : sans paramètre, tête ou révision de chaque côté, aller-retour exact", () => {
    const base = { vue: "comparer", projectId: "p_1", studyId: "s_2" };
    expect(lireRouteStudio(cheminComparaisonStudio("p_1", "s_2"))).toEqual({ ...base, de: null, a: null });
    expect(cheminComparaisonStudio("p_1", "s_2")).toBe("/studio/projets/p_1/etudes/s_2/comparer");
    const de = { variantId: "v_1", revisionId: "studio_revision_4" }, a = { variantId: "v_2", revisionId: null };
    expect(lire(cheminComparaisonStudio("p_1", "s_2", de, a))).toEqual({ ...base, de, a });
    expect(lire(cheminComparaisonStudio("p_1", "s_2", null, a))).toEqual({ ...base, de: null, a });
    expect(lireRouteStudio("/studio/projets/p_1/etudes/s_2/comparer", "?de=v_1:r_2&a=v_3")).toEqual({ ...base, de: { variantId: "v_1", revisionId: "r_2" }, a: { variantId: "v_3", revisionId: null } });
    expect(valeurCoteStudio(de)).toBe("v_1:studio_revision_4");
  });

  it("comparaison : paramètre répété, vide, mal formé ou étranger → adresse non reconnue", () => {
    const chemin = "/studio/projets/p_1/etudes/s_2/comparer";
    for (const q of ["?de=a&de=b", "?de=", "?a=v:", "?a=:r", "?de=v:r:x", "?de=..%2Fx", "?revision=r", "?de=v&x=1", "?a=v%20w"]) {
      expect(lireRouteStudio(chemin, q).vue).toBe("inconnue");
    }
    expect(lireRouteStudio(`${chemin}/x`).vue).toBe("inconnue");
    expect(lireRouteStudio("/studio/projets/p_1/etudes/s_2/comparaison").vue).toBe("inconnue");
  });

  it("archives=1 sur un projet ou une étude affiche les archives, aller-retour exact", () => {
    expect(cheminProjetStudio("p_1", { archives: true })).toBe("/studio/projets/p_1?archives=1");
    expect(lire(cheminProjetStudio("p_1", { archives: true }))).toEqual({ vue: "projet", projectId: "p_1", archives: true });
    expect(cheminEtudeStudio("p_1", "s_2", { archives: true })).toBe("/studio/projets/p_1/etudes/s_2?archives=1");
    expect(lire(cheminEtudeStudio("p_1", "s_2", { archives: true }))).toEqual({ vue: "etude", projectId: "p_1", studyId: "s_2", archives: true });
    expect(cheminProjetStudio("p_1", { archives: false })).not.toContain("?");
    expect(cheminEtudeStudio("p_1", "s_2", { archives: false })).not.toContain("?");
    // Les chemins dérivés de l'étude ne portent jamais le paramètre des archives.
    expect(cheminVarianteStudio("p_1", "s_2", "v_3")).toBe("/studio/projets/p_1/etudes/s_2/variantes/v_3");
  });

  it("archives : valeur autre que 1, répétée, vide, ou ailleurs que sur un projet ou une étude → adresse non reconnue", () => {
    for (const chemin of ["/studio/projets/p_1", "/studio/projets/p_1/etudes/s_2"]) {
      for (const q of ["?archives=", "?archives=0", "?archives=oui", "?archives=1&archives=1", "?archives=1&x=1", "?archive=1"]) {
        expect(lireRouteStudio(chemin, q).vue).toBe("inconnue");
      }
    }
    expect(lireRouteStudio("/studio", "?archives=1").vue).toBe("inconnue");
    expect(lireRouteStudio("/studio/projets/p_1/etudes/s_2/variantes/v_3", "?archives=1").vue).toBe("inconnue");
    expect(lireRouteStudio("/studio/projets/p_1/etudes/s_2/comparer", "?archives=1").vue).toBe("inconnue");
  });

  it("paramètre sur l'accueil, un projet ou une étude → adresse non reconnue", () => {
    expect(lireRouteStudio("/studio", "?revision=a").vue).toBe("inconnue");
    expect(lireRouteStudio("/studio/projets/p_1", "?x=1").vue).toBe("inconnue");
    expect(lireRouteStudio("/studio/projets/p_1/etudes/s_2", "?revision=a").vue).toBe("inconnue");
  });

  it("adresse inconnue ou identifiant non admis : écran explicite, adresse conservée", () => {
    for (const chemin of ["/studio/inconnu", "/studio/projets", "/studio/projets/a/b", "/studio/projets/..%2Fapi", "/studio/projets/%E0%A4%A", "/studio/projets/x%20y"]) {
      expect(lireRouteStudio(chemin)).toEqual({ vue: "inconnue", chemin });
    }
  });

  it("seules les adresses /studio relèvent de Studio ; /studio-x et /projets n'en sont pas", () => {
    expect(estRouteStudio("/studio")).toBe(true);
    expect(estRouteStudio("/studio/projets/p1")).toBe(true);
    expect(estRouteStudio("/studio-x")).toBe(false);
    expect(estRouteStudio("/projets/p1")).toBe(false);
    expect(lireRouteStudio("/studio-x").vue).toBe("inconnue");
  });
});
