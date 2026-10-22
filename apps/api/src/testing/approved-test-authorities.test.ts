import { createPublicKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APPROVED_TEST_AUTHORITIES } from "./approved-test-authorities.js";

describe("DB-3 approved authority registry (reviewed trust anchor)", () => {
  it("enrols only the CI authority, as a frozen, valid Ed25519 public key", () => {
    expect(Object.isFrozen(APPROVED_TEST_AUTHORITIES)).toBe(true);
    expect(Object.keys(APPROVED_TEST_AUTHORITIES)).toEqual(["fadi-ci-db3"]);
    for (const pem of Object.values(APPROVED_TEST_AUTHORITIES)) {
      expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=]+\n-----END PUBLIC KEY-----\n$/);
      expect(pem).not.toMatch(/PRIVATE/);
      expect(createPublicKey(pem).asymmetricKeyType).toBe("ed25519");
    }
  });
});
