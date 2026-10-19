import { describe, expect, it } from "vitest";
import {
  acteurAutorise, echeanceValide, estAncetreOuEgale, lireRefMetre, OBSERVATION_DOMAINES, OBSERVATION_TRANSITIONS, peutCreerTache, peutLier, refMetre, refusCloture, refusDecision,
  statutApres, TACHE_TRANSITIONS, tacheApres, tacheAutorisee, VUE_MODES,
} from "./studio-observations.js";

const personne = { estResponsable: false, estAuteur: false, estProprietaire: false, peutEcrire: false };

describe("Observations Studio — règles pures", () => {
  it("suit le cycle ouverte → corrigée → recontrôlée → clôturée, et rouvre", () => {
    expect(statutApres("ouverte", "corriger")).toBe("corrigee");
    expect(statutApres("corrigee", "recontroler")).toBe("recontrolee");
    expect(statutApres("recontrolee", "cloturer")).toBe("cloturee");
    expect(statutApres("cloturee", "rouvrir")).toBe("rouverte");
    expect(statutApres("rouverte", "corriger")).toBe("corrigee");
  });

  it("réattribue sans changer le statut, sauf une observation clôturée", () => {
    expect(statutApres("ouverte", "reattribuer")).toBe("ouverte");
    expect(statutApres("corrigee", "reattribuer")).toBe("corrigee");
    expect(statutApres("cloturee", "reattribuer")).toBeNull();
  });

  it("refuse les sauts et les retours non prévus", () => {
    expect(statutApres("ouverte", "recontroler")).toBeNull();
    expect(statutApres("ouverte", "cloturer")).toBeNull();
    expect(statutApres("corrigee", "cloturer")).toBeNull();
    expect(statutApres("ouverte", "rouvrir")).toBeNull();
    expect(statutApres("cloturee", "corriger")).toBeNull();
    expect(statutApres("recontrolee", "recontroler")).toBeNull();
  });

  it("réserve chaque passage à son rôle ; personne d'autre", () => {
    for (const action of OBSERVATION_TRANSITIONS) expect(acteurAutorise(action, personne)).toBe(false);
    expect(acteurAutorise("corriger", { ...personne, estResponsable: true, peutEcrire: true })).toBe(true);
    expect(acteurAutorise("corriger", { ...personne, estResponsable: true })).toBe(false);
    expect(acteurAutorise("reattribuer", { ...personne, estProprietaire: true })).toBe(true);
    expect(acteurAutorise("reattribuer", { ...personne, estAuteur: true, estResponsable: true, peutEcrire: true })).toBe(false);
    expect(acteurAutorise("corriger", { ...personne, estProprietaire: true })).toBe(false);
    expect(acteurAutorise("recontroler", { ...personne, estAuteur: true })).toBe(true);
    expect(acteurAutorise("recontroler", { ...personne, estResponsable: true })).toBe(false);
    expect(acteurAutorise("cloturer", { ...personne, estAuteur: true, estResponsable: true })).toBe(false);
    expect(acteurAutorise("cloturer", { ...personne, estProprietaire: true })).toBe(true);
    expect(acteurAutorise("rouvrir", { ...personne, estAuteur: true })).toBe(true);
  });

  it("compare les révisions par la chaîne des parents", () => {
    const parents = new Map<string, string | null>([["r1", null], ["r2", "r1"], ["r3", "r2"], ["x", "x"]]);
    expect(estAncetreOuEgale(parents, "r2", "r3")).toBe(true);
    expect(estAncetreOuEgale(parents, "r2", "r2")).toBe(true);
    expect(estAncetreOuEgale(parents, "r3", "r2")).toBe(false);
    expect(estAncetreOuEgale(parents, "r1", "x")).toBe(false);
  });

  it("valide une échéance réelle AAAA-MM-JJ", () => {
    expect(echeanceValide("2026-11-30")).toBe(true);
    expect(echeanceValide("2026-02-30")).toBe(false);
    expect(echeanceValide("30/11/2026")).toBe(false);
  });
});

describe("Observations Studio — suivi E.2 (règles pures)", () => {
  const proprietaire = { ...personne, estProprietaire: true, peutEcrire: true };
  const editeur = { ...personne, peutEcrire: true };
  const lecteur = { ...personne };

  it("E.2-04 / E.2-05 : la décision de clôture est motivée et attend la fin des tâches", () => {
    expect(refusCloture(undefined, 0)).toMatchObject({ status: 400, body: { code: "motif_exige" } });
    expect(refusCloture("   ", 0)).toMatchObject({ status: 400, body: { code: "motif_exige" } });
    expect(refusCloture("Recontrôle conforme", 2)).toMatchObject({ status: 409, body: { error: "taches_ouvertes", count: 2 } });
    expect(refusCloture("Recontrôle conforme", 0)).toBeNull();
    // Le rôle reste réservé au propriétaire (contrat existant) : un éditeur, même responsable et auteur, ne clôt pas.
    expect(acteurAutorise("cloturer", { ...editeur, estResponsable: true, estAuteur: true })).toBe(false);
  });

  it("E.2-03 / E.2-05 : un éditeur propose, le propriétaire décide, le lecteur ni l'un ni l'autre ; la clôture passe par le passage", () => {
    expect(refusDecision("proposition", "cloture", editeur)).toBeNull();
    expect(refusDecision("proposition", "autre", proprietaire)).toBeNull();
    expect(refusDecision("decision", "autre", proprietaire)).toBeNull();
    expect(refusDecision("decision", "autre", editeur)).toMatchObject({ status: 403 });
    expect(refusDecision("proposition", "autre", lecteur)).toMatchObject({ status: 403 });
    expect(refusDecision("decision", "cloture", proprietaire)).toMatchObject({ status: 400, body: { code: "cloture_par_passage" } });
  });

  it("E.2-03 : cycle des tâches à faire → faite | annulée, rouverte ; réattribution sans changer le statut", () => {
    expect(tacheApres("a-faire", "terminer")).toBe("faite");
    expect(tacheApres("a-faire", "annuler")).toBe("annulee");
    expect(tacheApres("faite", "rouvrir")).toBe("a-faire");
    expect(tacheApres("annulee", "rouvrir")).toBe("a-faire");
    expect(tacheApres("a-faire", "reattribuer")).toBe("a-faire");
    expect(tacheApres("faite", "terminer")).toBeNull();
    expect(tacheApres("faite", "reattribuer")).toBeNull();
    expect(tacheApres("a-faire", "rouvrir")).toBeNull();
  });

  it("E.2-03 : droits des tâches (personne chargée, créateur, propriétaire ; un lecteur rien)", () => {
    const t = { estProprietaire: false, peutEcrire: true, estResponsableObservation: false, estChargee: false, estCreateur: false };
    for (const a of TACHE_TRANSITIONS) expect(tacheAutorisee(a, { ...t, estProprietaire: true })).toBe(true);
    for (const a of TACHE_TRANSITIONS) expect(tacheAutorisee(a, { ...t, peutEcrire: false, estChargee: true, estCreateur: true })).toBe(false);
    expect(tacheAutorisee("terminer", { ...t, estChargee: true })).toBe(true);
    expect(tacheAutorisee("terminer", { ...t, estCreateur: true })).toBe(false);
    expect(tacheAutorisee("annuler", { ...t, estCreateur: true })).toBe(true);
    expect(tacheAutorisee("reattribuer", { ...t, estChargee: true })).toBe(false);
    expect(tacheAutorisee("rouvrir", { ...t, estCreateur: true, estChargee: true })).toBe(false);
    expect(peutCreerTache({ estProprietaire: false, peutEcrire: true, estResponsableObservation: true })).toBe(true);
    expect(peutCreerTache({ estProprietaire: false, peutEcrire: false, estResponsableObservation: true })).toBe(false);
    expect(peutCreerTache({ estProprietaire: false, peutEcrire: true, estResponsableObservation: false })).toBe(false);
  });

  it("E.2-01 / E.2-02 : domaines, vues, référence de métré et droit de lier", () => {
    expect(OBSERVATION_DOMAINES).toEqual(["exigence", "metre", "revue", "objet"]);
    expect(VUE_MODES).toContain("3d");
    expect(refMetre("mur-1", "surface")).toBe("mur-1#surface");
    expect(lireRefMetre("mur-1#surface")).toEqual({ objetId: "mur-1", grandeur: "surface" });
    expect(lireRefMetre("mur-1")).toBeNull();
    expect(lireRefMetre("#surface")).toBeNull();
    expect(lireRefMetre("mur-1#")).toBeNull();
    expect(peutLier({ ...personne, estAuteur: true })).toBe(true);
    expect(peutLier({ ...personne, estResponsable: true, peutEcrire: true })).toBe(true);
    expect(peutLier({ ...personne, estResponsable: true })).toBe(false);
    expect(peutLier({ ...personne, peutEcrire: true })).toBe(false);
    expect(peutLier(proprietaire)).toBe(true);
  });
});
