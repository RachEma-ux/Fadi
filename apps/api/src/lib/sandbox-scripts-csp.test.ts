import { describe, expect, it } from "vitest";
import { CSP_WORKER_SCRIPTS, politiqueContenuStatique } from "./sandbox-scripts-csp.js";

describe("Sandbox — politique de contenu du Worker des scripts", () => {
  it("ne vise que le fichier construit du Worker des scripts", () => {
    expect(politiqueContenuStatique("/srv/web/dist/assets/scripts-planche.worker-BxY12_a9.js")).toBe(CSP_WORKER_SCRIPTS);
    expect(politiqueContenuStatique("C:\\web\\dist\\assets\\scripts-planche.worker-BxY12_a9.js")).toBe(CSP_WORKER_SCRIPTS);
    expect(politiqueContenuStatique("/srv/web/dist/assets/index-BxY12_a9.js")).toBeNull();
    expect(politiqueContenuStatique("/srv/web/dist/assets/noyau-studio.worker-BxY12_a9.js")).toBeNull();
    expect(politiqueContenuStatique("/srv/web/dist/scripts-planche.worker-x.js")).toBeNull();
    expect(politiqueContenuStatique("/srv/web/dist/index.html")).toBeNull();
  });
  it("interdit toute connexion et tout code d'une autre origine", () => {
    expect(CSP_WORKER_SCRIPTS).toContain("connect-src 'none'");
    expect(CSP_WORKER_SCRIPTS).toContain("default-src 'none'");
    expect(CSP_WORKER_SCRIPTS).toMatch(/script-src 'self' 'unsafe-eval'(;|$)/);
    expect(CSP_WORKER_SCRIPTS).not.toMatch(/https?:|\*/);
  });
});
