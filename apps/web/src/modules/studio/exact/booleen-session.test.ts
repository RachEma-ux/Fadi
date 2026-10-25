import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioEmpreinteContenu, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { Ordonnanceur } from "../taches/ordonnanceur";
import { NoyauExactStudio } from "./client-exact";
import { FauxWorker, type CompteurFaux } from "./faux-worker";
import { demandeBooleen, engagement, etatApresIssue, etatCourant, MESSAGES_BOOLEEN, tacheBooleen, type DemandeBooleen } from "./booleen-session";

/**
 * Déroulé d'un booléen exact dans Studio (lot F2, IF-003) avec l'ordonnanceur réel et le client du noyau sur un faux
 * Worker : TEST-014 (résultat d'une ancienne révision : périmé, non engagé), TEST-015 (panne : document identique,
 * erreur, relance contrôlée, attente résolue), TR-EX-058 (aperçu provisoire jamais engagé, refusé au-delà de la tolérance).
 * Le « résultat exact » du faux Worker est SYNTHÉTIQUE (forme du contrat seulement).
 */
const boite = (id: string, x: number, rotation = 0): StudioCommand => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation }, width: 2, depth: 2, height: 2 } });
const doc0 = (rotation = 0): StudioDocument => applyStudioCommands(newStudioDocument("s"), [boite("A", 0), boite("B", 1, rotation)]);
const tetra = () => ({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
const exact = (volume: number) => ({ brep: "U1lOVEhFVElRVUU=", maillage: tetra(), volume, aire: 1, faces: 6, solides: 1, moteur: "occt-wasm", versionMoteur: "5.6.1", empreinte: "0123456789abcdef" });

function banc(volume = 12, mode = { silence: false }) {
  const compteur: CompteurFaux = { crees: 0, arretes: 0, vivants: [] };
  const noyau = new NoyauExactStudio({ creerWorker: () => new FauxWorker((d) => (d.nature === "charger" ? { pret: true } : mode.silence ? "silence" : exact(volume)), compteur) });
  const ord = new Ordonnanceur({ concurrence: 1, reprisesMax: 0, delaiMs: 60_000, executer: ({ charge, signal, delaiMs }) => noyau.executer((charge as { entrees: unknown }).entrees, { signal, delaiMs }) });
  return { noyau, ord, compteur };
}
function demande(doc: StudioDocument, revision = "1", operation = "union"): DemandeBooleen {
  const r = demandeBooleen(doc, revision, { operation, a: "A", b: "B" }, "E");
  if (!r.ok) throw new Error(r.message);
  return r.demande;
}

describe("IF-003 — capture, tâche, retour, vérification, engagement explicite", () => {
  it("de bout en bout : capture (révision 1) → tâche → résultat exact → aperçu confirmé → commande d'engagement → document avec le solide exact", async () => {
    const d = doc0();
    const { ord } = banc(12);
    const dem = demande(d);
    const t = tacheBooleen(dem);
    expect(t).toMatchObject({ cle: "studio.exact.booleen", classe: "interactive", nature: "booleen", empreinte: { revision: "1" } });
    const issue = await ord.soumettre(t).issue;
    const e = etatApresIssue(dem, issue, "1");
    expect(e).toMatchObject({ etape: "pret", comparaison: { conforme: true } });
    const r = engagement(e, { doc: d, revision: "1", modifiable: true });
    if (!r.ok) throw new Error(r.message);
    expect(r.commandes).toHaveLength(1);
    const apres = applyStudioCommands(d, r.commandes);
    expect(apres.exacts![0]).toMatchObject({ id: "E", operation: "union", resultat: { volume: 12 } });
    expect(apres.exacts![0]!.operandes.map((o) => o.id)).toEqual(["A", "B"]);
  });

  it("refus de capture : rien n'est soumis, message dit ce qui manque", () => {
    expect(demandeBooleen(doc0(), "1", { operation: "", a: "A", b: "B" }, "E")).toEqual({ ok: false, message: "Choisissez l’opération : union, différence ou intersection." });
  });
});

describe("TEST-014 — tâche exacte rendue pour une ancienne révision", () => {
  it("le brouillon change pendant le calcul : le résultat revient marqué périmé et n'est jamais engagé dans le modèle courant", async () => {
    const d = doc0();
    const { ord } = banc(12);
    const dem = demande(d, "1");
    const p = ord.soumettre(tacheBooleen(dem));
    // Pendant le calcul, l'utilisateur déplace B : nouvelle révision du brouillon.
    const d2 = applyStudioCommands(d, [{ toolId: "studio.solide.deplacer", params: { id: "B", dx: 0.5, dy: 0, dz: 0 } }]);
    const e = etatApresIssue(dem, await p.issue, "2");
    expect(e).toMatchObject({ etape: "perime", message: MESSAGES_BOOLEEN.perimeRevision });
    expect(e.etape === "perime" && e.resultat?.volume).toBe(12);
    const r = engagement(e, { doc: d2, revision: "2", modifiable: true });
    expect(r.ok).toBe(false);
    expect(d2.exacts).toBeUndefined();
  });

  it("résultat prêt puis brouillon modifié avant l'engagement : affiché périmé, engagement refusé", async () => {
    const d = doc0();
    const { ord } = banc(12);
    const dem = demande(d, "1");
    const e = etatApresIssue(dem, await ord.soumettre(tacheBooleen(dem)).issue, "1");
    expect(e.etape).toBe("pret");
    expect(etatCourant(e, "2")).toMatchObject({ etape: "perime" });
    const r = engagement(e, { doc: d, revision: "2", modifiable: true });
    expect(r).toMatchObject({ ok: false, etat: { etape: "perime" } });
    // Même révision mais opérandes changés (révision recalculée ailleurs) : la vérification du modèle refuse aussi.
    const d2 = applyStudioCommands(d, [{ toolId: "studio.solide.deplacer", params: { id: "A", dx: 0, dy: 0, dz: 1 } }]);
    expect(engagement(e, { doc: d2, revision: "1", modifiable: true })).toMatchObject({ ok: false, etat: { etape: "perime" } });
    expect(engagement(e, { doc: d, revision: "1", modifiable: false })).toMatchObject({ ok: false, message: "Lecture seule : le résultat ne peut pas être engagé." });
  });

  it("nouvelle demande sur la même clé : la précédente est remplacée, son résultat tardif périmé (stale), jamais remis", async () => {
    const d = doc0();
    const { ord } = banc(12);
    const remis: unknown[] = [];
    const p1 = ord.soumettre({ ...tacheBooleen(demande(d, "1")), surResultat: (v) => remis.push(["r1", v]) });
    const d2 = applyStudioCommands(d, [boite("C", 5)]);
    const p2 = ord.soumettre({ ...tacheBooleen(demande(d2, "2")), surResultat: (v) => remis.push(["r2", v]) });
    expect((await p1.issue).etat).toBe("superseded");
    expect((await p2.issue).etat).toBe("done");
    expect(remis.map((x) => (x as [string])[0])).toEqual(["r2"]);
  });
});

describe("TEST-015 — échec / coupure du Worker OCCT pendant un booléen", () => {
  it("panne pendant le calcul : attente résolue (failed), erreur annoncée, document identique, relance explicite puis calcul abouti", async () => {
    const d = doc0();
    const avant = studioEmpreinteContenu(d), texte = JSON.stringify(d);
    const mode = { silence: true };
    const { noyau, ord, compteur } = banc(12, mode);
    const dem = demande(d);
    const p = ord.soumettre(tacheBooleen(dem));
    await new Promise((r) => setTimeout(r, 0));
    expect(noyau.metriques().enAttente).toBe(1);
    compteur.vivants[0]!.planter();
    const issue = await p.issue;
    expect(issue).toMatchObject({ etat: "failed", code: "plantage" });
    const e = etatApresIssue(dem, issue, "1");
    expect(e).toMatchObject({ etape: "echec", relancer: true, message: "Le noyau exact s’est interrompu : le calcul est abandonné, le document n’a pas été modifié. Relancez le noyau exact." });
    expect(engagement(e, { doc: d, revision: "1", modifiable: true }).ok).toBe(false);
    // Aucune corruption : le document est identique, octet pour octet.
    expect(JSON.stringify(d)).toBe(texte);
    expect(studioEmpreinteContenu(d)).toBe(avant);
    // Sans relance, la tâche suivante échoue tout de suite (indisponible), sans nouveau Worker.
    expect(await ord.soumettre(tacheBooleen(demande(d, "1", "intersection"))).issue).toMatchObject({ etat: "failed", code: "indisponible" });
    expect(compteur.crees).toBe(1);
    // Relance contrôlée (le binaire répond de nouveau) : un nouveau Worker, et le calcul suivant aboutit.
    mode.silence = false;
    await noyau.relancer();
    expect(compteur.crees).toBe(2);
    const ok = etatApresIssue(dem, await ord.soumettre(tacheBooleen(dem)).issue, "1");
    expect(ok.etape).toBe("pret");
    expect(noyau.metriques()).toMatchObject({ relances: 1, etat: "pret", pannes: 1, workersVivants: 1 });
    expect(JSON.stringify(d)).toBe(texte);
  });

  it("erreur de calcul (intersection vide refusée par le noyau) : échec sans relance, document identique", () => {
    const dem = demande(doc0());
    const e = etatApresIssue(dem, { etat: "failed", code: "calcul", message: "resultat : résultat vide : aucun solide" }, "1");
    expect(e).toEqual({ etape: "echec", demande: dem, relancer: false, message: "Calcul exact refusé par le noyau : resultat : résultat vide : aucun solide" });
  });

  it("délai dépassé : échec, relance proposée ; réponse illisible du Worker : rien n'est engagé", () => {
    const dem = demande(doc0());
    expect(etatApresIssue(dem, { etat: "timed-out" }, "1")).toMatchObject({ etape: "echec", relancer: true });
    expect(etatApresIssue(dem, { etat: "done", valeur: { volume: 3 } }, "1")).toMatchObject({ etape: "echec", message: MESSAGES_BOOLEEN.resultatIllisible });
  });
});

describe("TR-EX-058 — aperçu provisoire et résultat exact", () => {
  it("aperçu exact pour deux boîtes non tournées : confirmé ; boîte tournée : aperçu (emprises) refusé face au résultat exact, qui reste seul engageable", async () => {
    const d = doc0();
    const dem = demande(d);
    expect(dem.capture.apercu).toMatchObject({ nature: "provisoire", volume: 12 });
    const ok = etatApresIssue(dem, { etat: "done", valeur: exact(12) }, "1");
    expect(ok).toMatchObject({ etape: "pret", comparaison: { conforme: true } });
    const tournee = doc0(Math.PI / 4);
    const demT = demande(tournee, "1", "intersection");
    // Volume d'intersection réel (fourni par le faux noyau) inférieur à l'estimation par emprises englobantes.
    const refuse = etatApresIssue(demT, { etat: "done", valeur: exact(demT.capture.apercu.volume * 0.7) }, "1");
    expect(refuse).toMatchObject({ etape: "pret", comparaison: { conforme: false } });
    const r = engagement(refuse, { doc: tournee, revision: "1", modifiable: true });
    if (!r.ok) throw new Error(r.message);
    const cmd = r.commandes[0] as Extract<StudioCommand, { toolId: "studio.solide.booleen" }>;
    // Le résultat engagé est le résultat exact, jamais le volume de l'aperçu.
    expect(cmd.params.resultat.volume).toBeCloseTo(demT.capture.apercu.volume * 0.7, 12);
    expect(JSON.stringify(cmd)).not.toContain("provisoire");
  });
});
