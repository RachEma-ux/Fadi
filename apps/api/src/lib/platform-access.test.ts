import { describe, expect, it } from "vitest";
import { adminEnabled, platformRefusal } from "./platform-access.js";

describe("accès plateforme (phase 3)", () => {
  const admin = { platformRole: "admin" as const, status: "active", mfaEnabled: true };
  it("administrateur actif avec double authentification : accès", () => { expect(platformRefusal(admin, "admin", true)).toBeNull(); });
  it.each([
    ["anonyme", undefined],
    ["utilisateur", { ...admin, platformRole: "user" as const }],
    ["administrateur suspendu", { ...admin, status: "suspended" }],
  ])("%s : 404 (non-divulgation)", (_, user) => { expect(platformRefusal(user, "admin", true)?.status).toBe(404); });
  it("administrateur sans double authentification : 403 mfa_required", () => {
    expect(platformRefusal({ ...admin, mfaEnabled: false }, "admin", true)).toMatchObject({ status: 403, body: { error: "mfa_required" } });
  });
  it("drapeau FADI_ADMIN_ENABLED absent : 404 même pour un administrateur", () => {
    expect(platformRefusal(admin, "admin", false)?.status).toBe(404);
    expect(adminEnabled({})).toBe(false);
    expect(adminEnabled({ FADI_ADMIN_ENABLED: "true" })).toBe(true);
    expect(adminEnabled({ FADI_ADMIN_ENABLED: "1" })).toBe(false);
  });
});

import { removesLastAdmin } from "./platform-access.js";
describe("garde du dernier administrateur", () => {
  it("retirer le seul administrateur actif : refusé", () => { expect(removesLastAdmin(["a"], "a")).toBe(true); });
  it("deux administrateurs : permis", () => { expect(removesLastAdmin(["a", "b"], "a")).toBe(false); });
  it("cible non administratrice : sans effet", () => { expect(removesLastAdmin(["a"], "u")).toBe(false); });
});
