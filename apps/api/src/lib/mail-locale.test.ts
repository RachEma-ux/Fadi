import { describe, expect, it } from "vitest";
import { mailLocale } from "./mail-locale.js";

/** Requête minimale : un en-tête `Accept-Language` anglais que `mailLocale` ne doit jamais lire (UM-29). */
const req = (body?: unknown) => ({ body, get: (h: string) => (h.toLowerCase() === "accept-language" ? "en-US,en;q=0.9" : undefined) });

describe("mailLocale (UM-29)", () => {
  it("navigateur en anglais sans langue explicite → français", () => {
    expect(mailLocale(req())).toBe("fr");
    expect(mailLocale(req({}))).toBe("fr");
    expect(mailLocale(req({ email: "a@b.c" }), undefined)).toBe("fr");
  });
  it("langue explicite valide → retenue", () => {
    expect(mailLocale(req(), "en")).toBe("en");
    expect(mailLocale(req({ locale: "en" }))).toBe("en");
    expect(mailLocale(req({ locale: "en" }), "fr")).toBe("fr");
    expect(mailLocale(req({ locale: "fr" }))).toBe("fr");
  });
  it("valeur invalide → français", () => {
    for (const v of ["EN", "en-US", "de", "", 1, null, ["en"], { en: true }]) {
      expect(mailLocale(req(), v)).toBe("fr");
      expect(mailLocale(req({ locale: v }))).toBe("fr");
    }
  });
});
