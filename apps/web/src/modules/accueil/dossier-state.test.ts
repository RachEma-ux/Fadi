import { describe, expect, it } from "vitest";
import { completeParcoursList, resolveDossierPrimaryAction, type DossierActionInput, type DossierStepSummary } from "./dossier-state";

const steps = (status: DossierStepSummary["status"] = "a-faire"): DossierStepSummary[] => Array.from({ length: 21 }, (_, i) => ({ number: i + 1, status, title: `Étape ${i + 1}`, goal: `But ${i + 1}` }));
function input(): DossierActionInput {
  return { projectId: "p-303", access: { known: true, canWrite: true }, steps: { status: "ready", data: steps() }, sync: { projectId: "p-303", pending: 0, conflicts: 0, busy: false, localStatus: "ready", localSaveError: null, online: true, reachable: true } };
}

describe("action principale propre au dossier", () => {
  it("ne déclare complet que 21 numéros distincts et valides", () => {
    expect(completeParcoursList(steps())).toBe(true);
    expect(completeParcoursList(steps().slice(1))).toBe(false);
    expect(completeParcoursList([...steps().slice(1), { number: 2, status: "termine" }])).toBe(false);
    expect(completeParcoursList([...steps().slice(1), { number: 22, status: "termine" }])).toBe(false);
  });
  it("reprend l'étape réellement consultée si elle reste incomplète", () => {
    const state = input();
    const progress = steps();progress[0]!.status = "termine";progress[7]!.status = "en-cours";
    state.steps.data = progress;state.resumedStep = 14;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Poursuivre le Parcours", href: "/projets/p-303?module=parcours&etape=14", disabled: false });
    expect(resolveDossierPrimaryAction(state).detail).toContain("Étape 14 / 21 — Étape 14 · But 14");
  });
  it("ignore une reprise déjà terminée et préfère l'étape en cours au nombre terminé + 1", () => {
    const state = input(), progress = steps();
    progress[0]!.status = "termine";progress[7]!.status = "en-cours";
    state.steps.data = progress;state.resumedStep = 1;
    expect(resolveDossierPrimaryAction(state).href).toContain("etape=8");
    progress[7]!.status = "a-faire";
    expect(resolveDossierPrimaryAction(state).href).toContain("etape=2");
  });
  it("n'utilise Commencer que pour un dossier neuf explicitement confirmé", () => {
    const state = input();
    expect(resolveDossierPrimaryAction(state).label).toBe("Poursuivre le Parcours");
    state.confirmedNew = true;
    expect(resolveDossierPrimaryAction(state).label).toBe("Commencer le Parcours");
    state.resumedStep = 21;
    expect(resolveDossierPrimaryAction(state).href).toBe("/projets/p-303?module=parcours&etape=1");
    state.steps.data = steps("en-cours");
    expect(resolveDossierPrimaryAction(state).label).toBe("Poursuivre le Parcours");
  });
  it("ouvre la consultation en lecture seule, pendant une réservation ou après 21 étapes terminées", () => {
    const state = input();state.access.canWrite = false;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Consulter le Parcours", href: "/projets/p-303?module=parcours" });
    state.access.locked = true;
    expect(resolveDossierPrimaryAction(state).detail).toContain("réservée");
    state.access.canWrite = true;state.steps.data = steps("termine");
    expect(resolveDossierPrimaryAction(state).label).toBe("Consulter le Parcours");
  });
  it("n'invente ni droit ni prochaine étape pendant une lecture inconnue", () => {
    const state = input();state.access.known = false;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ intent: "retry-access" });
    expect(resolveDossierPrimaryAction(state).href).toBeUndefined();
    state.access.known = true;state.steps.status = "loading";
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Chargement du Parcours…", disabled: true });
    state.steps.status = "ready";state.steps.data = [];
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Réessayer l’avancement", intent: "retry-steps" });
  });
  it("traite sauvegarde locale, connexion et comparaison dans cet ordre", () => {
    const state = input();state.sync.localSaveError = "quota";state.sync.online = false;state.sync.conflicts = 1;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ intent: "retry-local", label: "Réessayer la sauvegarde", disabled: false });
    state.sync.localSaveError = null;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ intent: "reconnect", label: "Rétablir la connexion", disabled: true });
    state.sync.online = true;state.sync.reachable = false;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ intent: "reconnect", disabled: false });
    state.sync.reachable = true;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ intent: "review-conflicts", label: "Comparer les versions", disabled: false });
  });
  it("ne transforme pas une file locale confirmée ou le mode hors ligne en conflit bloquant", () => {
    const state = input();state.sync.pending = 4;state.sync.online = false;state.sync.reachable = false;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Poursuivre le Parcours", disabled: false });
    state.sync.pending = null;
    expect(resolveDossierPrimaryAction(state).href).toContain("/projets/p-303?");
  });
  it("n'autorise pas une reprise de sauvegarde en lecture seule", () => {
    const state = input();state.access.canWrite = false;state.sync.localSaveError = "quota";state.sync.conflicts = 2;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Consulter le Parcours" });
  });
  it("désactive l'action avec le libellé de l'opération réellement en cours", () => {
    const state = input();state.sync.busy = true;state.sync.busyLabel = "Sauvegarde locale en cours…";
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Sauvegarde locale en cours…", disabled: true });
  });
  it("n'utilise pas les états d'un autre projet et encode le dossier dans la destination", () => {
    const state = input();state.sync.projectId = "autre";
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ disabled: true });
    expect(resolveDossierPrimaryAction(state).href).toBeUndefined();
    state.projectId = "p/303";state.sync.projectId = "p/303";
    expect(resolveDossierPrimaryAction(state).href).toBe("/projets/p%2F303?module=parcours&etape=1");
  });
  it.each([
    ["programme", "Ouvrir le programme", "?module=programmation"],
    ["atelier", "Ouvrir l’Atelier", "?module=atelier"],
    ["review", "Consulter la revue", "?module=parcours&etape=11&bilan=1"],
  ] as const)("reprend le travail explicite %s dans le même dossier", (currentWork, label, suffix) => {
    const state = input();state.currentWork = currentWork;state.resumedStep = 7;
    state.projectId = "p/303";state.sync.projectId = "p/303";
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label, href: `/projets/p%2F303${suffix}`, disabled: false });
    expect(resolveDossierPrimaryAction(state).intent).toBeUndefined();
  });
  it.each(["programme", "atelier", "review"] as const)("garde %s consultable en lecture seule et sous réservation", (currentWork) => {
    const state = input();state.currentWork = currentWork;
    const work = resolveDossierPrimaryAction(state);
    state.access.canWrite = false;
    expect(resolveDossierPrimaryAction(state)).toEqual(work);
    state.access.locked = true;
    expect(resolveDossierPrimaryAction(state)).toEqual(work);
    state.steps.data = steps("termine");
    expect(resolveDossierPrimaryAction(state)).toEqual(work);
  });
  it.each(["programme", "atelier", "review"] as const)("garde les récupérations et les lectures inconnues prioritaires sur %s", (currentWork) => {
    const state = input();state.currentWork = currentWork;state.access.known = false;
    expect(resolveDossierPrimaryAction(state).intent).toBe("retry-access");
    state.access.known = true;state.sync.busy = true;
    expect(resolveDossierPrimaryAction(state).disabled).toBe(true);
    expect(resolveDossierPrimaryAction(state).href).toBeUndefined();
    state.sync.busy = false;state.sync.localSaveError = "quota";state.sync.conflicts = 1;state.sync.online = false;
    expect(resolveDossierPrimaryAction(state).intent).toBe("retry-local");
    state.sync.localSaveError = null;
    expect(resolveDossierPrimaryAction(state).intent).toBe("reconnect");
    state.sync.online = true;
    expect(resolveDossierPrimaryAction(state).intent).toBe("review-conflicts");
    state.sync.conflicts = 0;state.steps.status = "loading";
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Chargement du Parcours…", disabled: true });
    state.steps.status = "error";
    expect(resolveDossierPrimaryAction(state).intent).toBe("retry-steps");
    state.steps.status = "ready";state.steps.data = steps().slice(1);
    expect(resolveDossierPrimaryAction(state).intent).toBe("retry-steps");
  });
  it("une alerte de revue ancienne ou d'aperçu ne choisit pas le travail à la place de l'utilisateur", () => {
    const state = { ...input(), review: { stale: true }, preview: { status: "error" } };
    state.resumedStep = 4;
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Poursuivre le Parcours", href: "/projets/p-303?module=parcours&etape=4" });
    state.currentWork = "parcours";
    expect(resolveDossierPrimaryAction(state)).toMatchObject({ label: "Poursuivre le Parcours", href: "/projets/p-303?module=parcours&etape=4" });
  });
});
