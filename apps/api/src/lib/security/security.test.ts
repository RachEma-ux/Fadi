import { describe, expect, it } from "vitest";
import { checkPassword, commonPasswords, PASSWORD_MAX, PASSWORD_MIN } from "./password-policy.js";
import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUri, stepAt, verifyTotp } from "./totp.js";
import { EncryptionUnavailable, encryptionKey, openSecret, sealSecret } from "./secret-box.js";
import { normalizeRecoveryCode, randomToken, recoveryCode, sha256Hex } from "./tokens.js";
import { displayStatus, isLocked, lockDurationMs, loginBlock, newSessionTimes, sessionValid, slideExpiry, SESSION_LIMITS } from "./auth-policy.js";
import { AccountTransitionRefused, assertTransition, canTransition } from "./account-state.js";

describe("politique de mot de passe (D-6)", () => {
  it("11 caractères refusé, 12 accepté, 128 accepté, 129 refusé", () => {
    expect(checkPassword("a".repeat(5) + "Xq9#z!")).toBe("too_short");
    expect(checkPassword("tortue-verte-7")).toBeNull();
    expect(checkPassword("é".repeat(PASSWORD_MIN - 1) + "x")).toBeNull();
    expect(checkPassword("k".repeat(PASSWORD_MAX))).toBeNull();
    expect(checkPassword("k".repeat(PASSWORD_MAX + 1))).toBe("too_long");
  });
  it("aucune règle de composition : minuscules seules acceptées", () => {
    expect(checkPassword("correcthorsebatterystaple")).toBeNull();
  });
  it("mot de passe courant refusé, sans tenir compte de la casse", () => {
    const sample = [...commonPasswords()][0]!;
    expect(sample.length).toBeGreaterThanOrEqual(PASSWORD_MIN);
    expect(checkPassword(sample)).toBe("common");
    expect(checkPassword(sample.toUpperCase())).toBe("common");
    expect(commonPasswords().size).toBeGreaterThan(1000);
  });
  it("refuse un mot de passe qui reprend l'adresse", () => {
    expect(checkPassword("martin.dupont2026", { email: "martin.dupont@example.test" })).toBe("contains_email");
  });
});

describe("TOTP (RFC 6238)", () => {
  // Vecteurs de la RFC 6238, annexe B (SHA-1, secret ASCII « 12345678901234567890 »), 8 chiffres.
  const rfc = Buffer.from("12345678901234567890");
  it.each([[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"]])(
    "vecteur RFC à t=%i", (t, expected) => { expect(hotp(rfc, Math.floor(t / 30), 8)).toBe(expected); });
  it("base32 aller-retour", () => {
    const b = Buffer.from("fadi-secret-1234");
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
    expect(base32Decode(generateTotpSecret()).length).toBe(20);
  });
  it("tolérance ±1 pas, refus à ±2", () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const step = stepAt(now);
    const code = (s: number) => hotp(base32Decode(secret), s);
    expect(verifyTotp(secret, code(step), now, null)).toBe(step);
    expect(verifyTotp(secret, code(step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, code(step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(secret, code(step - 2), now, null)).toBeNull();
    expect(verifyTotp(secret, code(step + 2), now, null)).toBeNull();
  });
  it("rejeu refusé : un pas déjà accepté (ou antérieur) ne passe plus", () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const step = stepAt(now);
    const c = hotp(base32Decode(secret), step);
    expect(verifyTotp(secret, c, now, step)).toBeNull();
    expect(verifyTotp(secret, hotp(base32Decode(secret), step - 1), now, step)).toBeNull();
    expect(verifyTotp(secret, "12345", now, null)).toBeNull();
  });
  it("URI d'enrôlement", () => {
    expect(otpauthUri("ABC", "a@b.c")).toBe("otpauth://totp/Fadi%3Aa%40b.c?secret=ABC&issuer=Fadi&algorithm=SHA1&digits=6&period=30");
  });
});

describe("coffre des secrets (AES-256-GCM)", () => {
  const key = Buffer.alloc(32, 7);
  it("aller-retour, chiffré différent à chaque fois", () => {
    const a = sealSecret("JBSWY3DPEHPK3PXP", key), b = sealSecret("JBSWY3DPEHPK3PXP", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("JBSWY3DPEHPK3PXP");
    expect(openSecret(a, key)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("altération détectée, mauvaise clé refusée", () => {
    const s = sealSecret("x", key);
    expect(() => openSecret(s, Buffer.alloc(32, 8))).toThrow();
    expect(() => openSecret(s.slice(0, -2) + "AA", key)).toThrow();
  });
  it("sans clé valide : refus explicite", () => {
    expect(encryptionKey({})).toBeNull();
    expect(encryptionKey({ FADI_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toBeNull();
    expect(() => sealSecret("x", null)).toThrow(EncryptionUnavailable);
  });
});

describe("jetons et codes de secours", () => {
  it("jeton de 32 octets, empreinte hexadécimale", () => {
    expect(Buffer.from(randomToken(), "base64url").length).toBe(32);
    expect(sha256Hex("a")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("codes de secours lisibles et normalisés", () => {
    const c = recoveryCode();
    expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    expect(normalizeRecoveryCode(` ${c.toUpperCase()} `)).toBe(c.replace("-", ""));
  });
});

describe("politiques de session et de verrouillage", () => {
  const t0 = new Date("2026-10-22T10:00:00Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);
  const H = 3_600_000;
  it("utilisateur : 30 jours au plus", () => {
    const s = { createdAt: t0, ...newSessionTimes("user", t0), lastSeenAt: t0, revokedAt: null };
    expect(sessionValid(s, "user", at(29 * 24 * H))).toBe(true);
    expect(sessionValid(s, "user", at(30 * 24 * H))).toBe(false);
  });
  it("administrateur : 1 h d'inactivité et 24 h au plus, même avec activité", () => {
    const s = { createdAt: t0, ...newSessionTimes("admin", t0), lastSeenAt: t0, revokedAt: null };
    expect(sessionValid(s, "admin", at(H - 1))).toBe(true);
    expect(sessionValid(s, "admin", at(H + 1))).toBe(false);
    const active = { ...s, lastSeenAt: at(23.5 * H), expiresAt: slideExpiry(s, "admin", at(23.5 * H)) };
    expect(active.expiresAt.getTime()).toBe(at(24 * H).getTime());
    expect(sessionValid(active, "admin", at(23.9 * H))).toBe(true);
    expect(sessionValid(active, "admin", at(24 * H))).toBe(false);
  });
  it("promotion en administrateur : une ancienne session utilisateur est resserrée", () => {
    const s = { createdAt: t0, ...newSessionTimes("user", t0), lastSeenAt: t0, revokedAt: null };
    expect(sessionValid(s, "admin", at(2 * H))).toBe(false);
  });
  it("session révoquée invalide", () => {
    expect(sessionValid({ createdAt: t0, ...newSessionTimes("user", t0), lastSeenAt: t0, revokedAt: t0 }, "user", t0)).toBe(false);
    expect(SESSION_LIMITS.admin.absoluteMs).toBe(24 * H);
  });
  it("verrouillage progressif plafonné", () => {
    expect(lockDurationMs(4)).toBe(0);
    expect(lockDurationMs(5)).toBe(60_000);
    expect(lockDurationMs(6)).toBe(120_000);
    expect(lockDurationMs(30)).toBe(H);
    expect(isLocked(at(1), t0)).toBe(true);
    expect(isLocked(t0, t0)).toBe(false);
  });
  it("connexion refusée selon l'état du compte", () => {
    const base = { status: "active" as const, lockedUntil: null, deletionRequestedAt: null };
    expect(loginBlock(base, t0)).toBeNull();
    expect(loginBlock({ ...base, status: "suspended" }, t0)).toBe("suspended");
    expect(loginBlock({ ...base, status: "closed" }, t0)).toBe("closed");
    expect(loginBlock({ ...base, lockedUntil: at(1000) }, t0)).toBe("locked");
    expect(loginBlock({ ...base, deletionRequestedAt: t0 }, t0)).toBe("deletion_pending");
    expect(displayStatus({ ...base, lockedUntil: at(1000) }, t0)).toBe("locked");
  });
});

describe("machine d'états du compte", () => {
  it("transitions permises", () => {
    expect(canTransition("active", "suspended")).toBe(true);
    expect(canTransition("suspended", "active")).toBe(true);
    expect(canTransition("active", "closed")).toBe(true);
    expect(canTransition("suspended", "closed")).toBe(true);
  });
  it.each([["active", "active"], ["suspended", "suspended"], ["closed", "active"], ["closed", "suspended"], ["closed", "closed"]] as const)(
    "%s → %s refusée", (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(AccountTransitionRefused);
    });
});

import { invitationRefusal } from "./invitation-rules.js";
describe("acceptation d'une invitation (UM-3)", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  const inv = { status: "pending" as const, expiresAt: new Date("2026-10-29T10:00:00Z"), email: "invitee@example.test" };
  const account = { email: "invitee@example.test", status: "active" };
  it("acceptable par le compte visé, invitant habilité", () => { expect(invitationRefusal(inv, account, true, now)).toBeNull(); });
  it("nouvel utilisateur (pas encore de compte)", () => { expect(invitationRefusal(inv, null, true, now)).toBeNull(); });
  it("lien transféré : autre compte refusé", () => { expect(invitationRefusal(inv, { ...account, email: "autre@example.test" }, true, now)).toBe("wrong_account"); });
  it("expirée, acceptée, déclinée, annulée : aucune activation", () => {
    expect(invitationRefusal({ ...inv, expiresAt: now }, account, true, now)).toBe("expired");
    expect(invitationRefusal({ ...inv, status: "accepted" }, account, true, now)).toBe("already_accepted");
    expect(invitationRefusal({ ...inv, status: "declined" }, account, true, now)).toBe("declined");
    expect(invitationRefusal({ ...inv, status: "cancelled" }, account, true, now)).toBe("cancelled");
    expect(invitationRefusal(null, account, true, now)).toBe("not_found");
  });
  it("autorité de l'invitant retirée : refus", () => { expect(invitationRefusal(inv, account, false, now)).toBe("inviter_not_authorized"); });
  it("compte suspendu : refus", () => { expect(invitationRefusal(inv, { ...account, status: "suspended" }, true, now)).toBe("account_inactive"); });
  it("casse de l'adresse indifférente", () => { expect(invitationRefusal(inv, { ...account, email: "Invitee@Example.test" }, true, now)).toBeNull(); });
});

import { anonymisationDue, anonymisedEmail } from "./deletion.js";
describe("suppression (D-5)", () => {
  const req = new Date("2026-10-01T00:00:00Z");
  it("anonymisation due à 30 jours exactement, pas avant (horloge simulée)", () => {
    expect(anonymisationDue(req, new Date("2026-10-30T23:59:59Z"))).toBe(false);
    expect(anonymisationDue(req, new Date("2026-10-31T00:00:00Z"))).toBe(true);
    expect(anonymisationDue(null, new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });
  it("adresse de remplacement non routable, sans l'ancienne adresse", () => {
    expect(anonymisedEmail("user_1")).toBe("deleted-user_1@invalid");
  });
});
