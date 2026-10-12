import { describe, expect, it } from "vitest";
import { ApiError, type EditingLock } from "./api";
import { resolveProjectAccess } from "./access";

const now = Date.parse("2026-10-12T10:00:00Z");
const lock: EditingLock = { userId: "other", email: "other@example.test", since: "2026-10-12T09:00:00Z", expiresAt: "2026-10-12T11:00:00Z" };

describe("droits connus et récents du dossier", () => {
  it("un rôle absent n'est ni un propriétaire ni un accès en écriture", () => {
    expect(resolveProjectAccess(undefined, null, "me", now)).toMatchObject({ known: false, canWrite: false, mayEdit: false, isOwner: false, role: "lecteur" });
  });
  it("respecte les rôles du serveur", () => {
    expect(resolveProjectAccess("lecteur", null, "me", now)).toMatchObject({ known: true, canWrite: false });
    expect(resolveProjectAccess("editeur", null, "me", now)).toMatchObject({ canWrite: true, isOwner: false });
    expect(resolveProjectAccess("proprietaire", null, "me", now)).toMatchObject({ canWrite: true, isOwner: true });
  });
  it("bloque un verrou d'autrui, mais permet son propre verrou ou un verrou expiré", () => {
    expect(resolveProjectAccess("editeur", lock, "me", now)).toMatchObject({ canWrite: false, mayEdit: true, holdsLock: false });
    expect(resolveProjectAccess("editeur", lock, "other", now)).toMatchObject({ canWrite: true, holdsLock: true });
    expect(resolveProjectAccess("editeur", lock, "me", now + 7_200_000)).toMatchObject({ canWrite: true, lock: null });
  });
  it.each([401, 403, 404])("un refus %i récent retire les anciens droits encore en cache", (status) => {
    expect(resolveProjectAccess("proprietaire", null, "me", now, new ApiError(status, "refus"))).toMatchObject({ known: false, canWrite: false, mayEdit: false, isOwner: false });
  });
  it("une coupure réseau ne transforme pas des droits déjà lus en accès inconnu", () => {
    expect(resolveProjectAccess("editeur", null, "me", now, new TypeError("network"))).toMatchObject({ known: true, canWrite: true });
  });
});
