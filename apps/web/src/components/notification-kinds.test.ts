import { describe, expect, it } from "vitest";
import { Traducteur } from "../lib/i18n/traduire";
import dico from "../lib/i18n/en.json";
import { NOTIFICATION_KIND_DESCRIPTION, NOTIFICATION_KIND_LABEL, NOTIFICATION_KINDS } from "./notification-kinds";

describe("types de notification (réglages et cloche)", () => {
  it("couvre les dix types calculés par l'API (dont `message`, `demande` et la revue externe)", () => {
    expect([...NOTIFICATION_KINDS].sort()).toEqual(["acces", "commentaire", "commentaire-studio", "demande", "message", "modification", "peremption", "reservation", "revue", "verrou"]);
    for (const k of NOTIFICATION_KINDS) expect(NOTIFICATION_KIND_DESCRIPTION[k]).toBeTruthy();
  });

  it("chaque libellé et chaque description a sa traduction anglaise", () => {
    const t = new Traducteur(dico as Record<string, string>);
    for (const k of NOTIFICATION_KINDS) {
      expect(t.traduire(NOTIFICATION_KIND_LABEL[k])).not.toBe(NOTIFICATION_KIND_LABEL[k]);
      expect(t.traduire(NOTIFICATION_KIND_DESCRIPTION[k])).not.toBe(NOTIFICATION_KIND_DESCRIPTION[k]);
    }
    expect(t.traduire("3 notification(s) masquée(s) par vos préférences.")).toBe("3 notification(s) hidden by your preferences.");
  });
});
