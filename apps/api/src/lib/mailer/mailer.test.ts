import { describe, expect, it } from "vitest";
import { createMailer, MailConfigError, readMailConfig } from "./index.js";
import { MAIL_TEMPLATES, renderMail } from "./templates.js";



import { isReservedDomain, quotaDecision, RESERVED_ADDRESS_PATTERN, retryDelayMs } from "./quota.js";

const smtpEnv = { MAIL_TRANSPORT: "smtp", SMTP_HOST: "mail.infomaniak.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "noreply@exemple.ch", SMTP_PASS: "x", MAIL_FROM: "Fadi <noreply@exemple.ch>", APP_PUBLIC_URL: "https://fadi.exemple.ch" };

describe("configuration du courriel (D-1)", () => {
  it("SMTP valide", () => {
    const c = readMailConfig(smtpEnv);
    expect(c.transport).toBe("smtp");
    expect(c.smtp).toMatchObject({ host: "mail.infomaniak.com", port: 465, secure: true });
    expect(c.dailyLimit).toBe(150);
  });
  it("démarrage refusé si l'adresse de MAIL_FROM ≠ SMTP_USER", () => {
    expect(() => readMailConfig({ ...smtpEnv, MAIL_FROM: "Fadi <autre@exemple.ch>" })).toThrow(MailConfigError);
  });
  it("démarrage refusé si une variable SMTP manque", () => {
    expect(() => readMailConfig({ ...smtpEnv, SMTP_HOST: undefined })).toThrow(/SMTP_HOST/);
    expect(() => readMailConfig({ ...smtpEnv, NODE_ENV: "production", SMTP_PASS: undefined })).toThrow(/SMTP_PASS/);
  });
  it("console interdit en production, transport inconnu refusé", () => {
    expect(() => readMailConfig({ MAIL_TRANSPORT: "console", NODE_ENV: "production" })).toThrow(/interdit/);
    expect(readMailConfig({ MAIL_TRANSPORT: "console" }).transport).toBe("console");
    expect(() => readMailConfig({ MAIL_TRANSPORT: "sendmail" })).toThrow(MailConfigError);
  });
  it("sans transport : aucun envoi, déclaré", async () => {
    const c = readMailConfig({});
    expect(c.transport).toBe("disabled");
    await expect(createMailer(c).send({ to: "a@b.c", template: "verify_email", data: {}, locale: "fr" })).rejects.toThrow("mail_disabled");
  });
  it("transport console : écrit le courriel au journal", async () => {
    const lines: string[] = [];
    await createMailer(readMailConfig({ MAIL_TRANSPORT: "console" }), (l) => lines.push(l)).send({ to: "a@b.c", template: "reset_password", data: { link: "http://x/#jeton=1" }, locale: "en" });
    expect(lines[0]).toContain("Reset your password");
  });
});

describe("garde-fou de quota", () => {
  const base = { transport: "smtp", last24h: 0, recipientLastHour: 0, dailyLimit: 150, perRecipientHourly: 5 };
  it("sous les seuils : envoi", () => { expect(quotaDecision(base)).toBeNull(); });
  it("quota quotidien atteint : bascule vers le lien à copier", () => { expect(quotaDecision({ ...base, last24h: 150 })).toBe("daily_quota"); });
  it("5 courriels par heure et par destinataire", () => { expect(quotaDecision({ ...base, recipientLastHour: 5 })).toBe("recipient_limit"); });
  it("transport absent", () => { expect(quotaDecision({ ...base, transport: "disabled" })).toBe("disabled"); });
  it("domaine réservé en SMTP : non envoyé, raison explicite (lien à copier)", () => {
    expect(quotaDecision({ ...base, to: "comptes-a@example.test" })).toBe("reserved_domain");
    expect(quotaDecision({ ...base, to: "bob@example.com" })).toBe("reserved_domain");
    expect(quotaDecision({ ...base, to: "vraie@fadimmo.com" })).toBeNull();
  });
  it("domaine réservé : autorisé explicitement (Mailpit), sans objet hors SMTP, transport absent prioritaire", () => {
    expect(quotaDecision({ ...base, to: "a@example.test", allowReserved: true })).toBeNull();
    expect(quotaDecision({ ...base, transport: "console", to: "a@example.test" })).toBeNull();
    expect(quotaDecision({ ...base, transport: "disabled", to: "a@example.test" })).toBe("disabled");
    expect(quotaDecision({ ...base, to: "a@example.test", last24h: 150 })).toBe("reserved_domain");
  });
  it("attente croissante", () => { expect([1, 2, 3].map(retryDelayMs)).toEqual([30_000, 120_000, 480_000]); });
});

describe("domaines réservés (RFC 2606 / 6761, UM-28)", () => {
  it.each([
    "a@example.com", "a@example.net", "a@example.org", "a@mail.example.com", "a@foo.example", "a@example.test",
    "a@fadi.test", "deleted-u1@invalid", "a@x.invalid", "a@localhost", "a@app.localhost", "A@EXAMPLE.COM", "a@example.com.",
    "sans-arobase", "a@",
  ])("%s : réservé", (a) => { expect(isReservedDomain(a)).toBe(true); });
  it.each(["noreply@fadimmo.com", "a@gmail.com", "a@example.co", "a@myexample.com", "a@testing.ch", "a@example.com.au", "a@invalid.ch"])(
    "%s : non réservé", (a) => { expect(isReservedDomain(a)).toBe(false); });
  it("RESERVED_ADDRESS_PATTERN (filtre SQL des comptes de test, UM-31) : même verdict qu'isReservedDomain", () => {
    const re = new RegExp(RESERVED_ADDRESS_PATTERN, "i");
    for (const a of [
      "a@example.com", "a@example.net", "a@example.org", "a@mail.example.com", "a@foo.example", "a@example.test", "a@fadi.test",
      "deleted-u1@invalid", "a@x.invalid", "a@localhost", "a@app.localhost", "A@EXAMPLE.COM", "a@example.com.", "sans-arobase", "a@",
      "noreply@fadimmo.com", "a@gmail.com", "a@example.co", "a@myexample.com", "a@testing.ch", "a@example.com.au", "a@invalid.ch",
      "x.example.com@gmail.com", "test@fadimmo.com", "a@test", "a@contest", "a@b@example.com", "a@example.com@gmail.com",
    ]) expect(re.test(a), a).toBe(isReservedDomain(a));
  });
  it("MAIL_ALLOW_RESERVED_DOMAINS : faux par défaut, true hors production, refusé en production ou mal écrit", () => {
    expect(readMailConfig(smtpEnv).allowReservedDomains).toBe(false);
    expect(readMailConfig({ ...smtpEnv, MAIL_ALLOW_RESERVED_DOMAINS: "true" }).allowReservedDomains).toBe(true);
    expect(readMailConfig({ ...smtpEnv, NODE_ENV: "production", MAIL_ALLOW_RESERVED_DOMAINS: "false" }).allowReservedDomains).toBe(false);
    expect(() => readMailConfig({ ...smtpEnv, NODE_ENV: "production", MAIL_ALLOW_RESERVED_DOMAINS: "true" })).toThrow(/interdit en production/);
    expect(() => readMailConfig({ ...smtpEnv, MAIL_ALLOW_RESERVED_DOMAINS: "1" })).toThrow(MailConfigError);
  });
});

describe("gabarits FR / EN", () => {
  it.each(MAIL_TEMPLATES)("%s : sujet, texte et HTML dans les deux langues, sans pixel de suivi", (t) => {
    for (const locale of ["fr", "en"] as const) {
      const r = renderMail(t, { link: "https://fadi.test/compte/x#jeton=abc", projectName: "P<1>", role: "lecteur", expiresAt: "29/10/2026", deletionAt: "21/11/2026" }, locale);
      expect(r.subject.length).toBeGreaterThan(5);
      expect(r.text.length).toBeGreaterThan(20);
      expect(r.html).not.toMatch(/<img/i);
      expect(r.html).not.toContain("P<1>");
    }
  });
  it("le lien figure dans les gabarits à action", () => {
    expect(renderMail("invitation", { link: "https://fadi.test/i#jeton=abc" }, "fr").text).toContain("https://fadi.test/i#jeton=abc");
  });
});
