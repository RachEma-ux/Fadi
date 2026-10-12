import { describe, expect, it } from "vitest";
import { dossierReconnectHref, safeDossierReturnTo } from "./dossier-return";

describe("retour au dossier après renouvellement de session", () => {
  it("conserve seulement une route explicite de dossier", () => {
    expect(safeDossierReturnTo("/projets/303-bcf2_1.0")).toBe("/projets/303-bcf2_1.0");
    expect(safeDossierReturnTo("/projets/5c7aef3f-f069-47e5-8fd4-6f1ca21e7ef1")).toBe("/projets/5c7aef3f-f069-47e5-8fd4-6f1ca21e7ef1");
  });
  it.each([
    "https://example.test/projets/303", "//example.test/projets/303", "\\\\example.test\\projets\\303",
    "/\\example.test/projets/303", "/projets/303\\other", "javascript:alert(1)",
    "/projets/%2f%2fexample.test", "/projets/%5cexample.test", "/projets/%252fexample.test",
    "/projets/../connexion", "/projets/..", "/projets/.", "/projets/%2e%2e", "/projets/303/other",
    "/projets/303?returnTo=https://example.test", "/projets/303#other", "/projets/", "/accueil",
    "/projets/303\n", " /projets/303", "/projets/303\u0000", "/projets/" + "a".repeat(129),
  ])("rejette une destination non autorisée : %s", (value) => {
    expect(safeDossierReturnTo(value)).toBeNull();
  });
  it("préserve le comportement par défaut sans destination valide", () => {
    expect(safeDossierReturnTo(null) ?? "/accueil").toBe("/accueil");
    expect(safeDossierReturnTo(undefined) ?? "/accueil").toBe("/accueil");
    expect(safeDossierReturnTo(303)).toBeNull();
  });
  it("encode la même route dans le lien de reconnexion sans changer le dossier", () => {
    const href = dossierReconnectHref("303-bcf2_1.0");
    expect(href).toBe("/connexion?renouveler=1&returnTo=%2Fprojets%2F303-bcf2_1.0");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("renouveler")).toBe("1");
    expect(safeDossierReturnTo(params.get("returnTo"))).toBe("/projets/303-bcf2_1.0");
    expect(dossierReconnectHref("../connexion")).toBe("/connexion?renouveler=1");
  });
});
