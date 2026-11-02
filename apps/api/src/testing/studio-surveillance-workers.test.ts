/**
 * Boucles de fond branchées sur la surveillance d'exploitation (R.5-03, OPS-08) : chaque boucle démarrée par
 * `startAccountWorkers` est déclarée avec la période du code, chaque succès et chaque échec sont comptés et la règle
 * « worker.echec » passe en alerte dès un échec. Base et envois simulés (aucune socket).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const envoyer = vi.fn<() => Promise<void>>();
const purger = vi.fn();
let suppressionEnEchec = false;
vi.mock("../db/client.js", () => ({
  db: { select: () => ({ from: () => ({ where: () => (suppressionEnEchec ? Promise.reject(new Error("base indisponible")) : Promise.resolve([])) }) }) },
}));
vi.mock("../lib/mailer/outbox.js", () => ({ processMailOutbox: () => envoyer() }));
vi.mock("../lib/studio-journal-acces.js", () => ({ runStudioAccessRetentionJob: () => purger() }));
vi.mock("../lib/participants-db.js", () => ({ runContactRetentionJob: vi.fn() }));
vi.mock("../lib/project-access-db.js", () => ({ relabelShareInviter: vi.fn(), revokeSharesOfUser: vi.fn() }));
vi.mock("../lib/audit.js", () => ({ audit: vi.fn() }));

import { PERIODE_COURRIELS_MS, PERIODE_HORAIRE_MS, startAccountWorkers } from "../lib/account-jobs.js";
import { evaluerAlertes, SurveillanceStudio } from "../lib/studio-surveillance.js";

afterEach(() => { vi.useRealTimers(); suppressionEnEchec = false; });

describe("R.5-03 — boucles de fond déclarées et comptées par la surveillance", () => {
  it("R.5-03 [+] boucles déclarées avec leur période ; échec du courriel et de l'anonymisation comptés et en alerte, succès suivant : retour à la normale", async () => {
    vi.useFakeTimers();
    const s = new SurveillanceStudio();
    envoyer.mockRejectedValueOnce(new Error("smtp injoignable")).mockResolvedValue(undefined);
    purger.mockResolvedValue({ supprimes: 0, limite: new Date() });
    suppressionEnEchec = true;
    const journal: string[] = [];
    const arreter = startAccountWorkers((l) => journal.push(l), s);
    const declares = s.observer().workers;
    expect(declares.map((w) => [w.nom, w.periodeMs])).toEqual([
      ["mail_outbox", PERIODE_COURRIELS_MS], ["account_deletion_job", PERIODE_HORAIRE_MS], ["studio_access_retention_job", PERIODE_HORAIRE_MS],
    ]);
    await vi.advanceTimersByTimeAsync(PERIODE_COURRIELS_MS);
    let o = s.observer();
    const w = (nom: string) => o.workers.find((x) => x.nom === nom)!;
    expect(w("mail_outbox")).toMatchObject({ executions: 1, echecs: 1, echecsConsecutifs: 1, dernierEchec: { message: "smtp injoignable" } });
    expect(w("account_deletion_job")).toMatchObject({ echecs: 1, echecsConsecutifs: 1 });
    expect(w("studio_access_retention_job")).toMatchObject({ echecs: 0, executions: 1 });
    const alertes = evaluerAlertes(o).filter((r) => r.etat === "alerte").map((r) => `${r.regle}|${r.objet}`);
    expect(alertes).toEqual(expect.arrayContaining(["worker.echec|mail_outbox", "worker.echec|account_deletion_job"]));
    expect(alertes).not.toContain("worker.echec|studio_access_retention_job");
    expect(journal.some((l) => JSON.parse(l).message === "mail_outbox")).toBe(true);
    // Envoi suivant réussi : la boucle des courriels revient à la normale.
    await vi.advanceTimersByTimeAsync(PERIODE_COURRIELS_MS);
    o = s.observer();
    expect(w("mail_outbox")).toMatchObject({ executions: 2, echecsConsecutifs: 0 });
    expect(evaluerAlertes(o).find((r) => r.regle === "worker.echec" && r.objet === "mail_outbox")?.etat).toBe("normal");
    arreter();
  });
});
