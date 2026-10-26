/**
 * Surveillance d'exploitation (R.5-03, OPS-08) : règles d'alerte des jobs et des workers, mesure de la consommation des
 * noyaux exact et rendu, exposition par `GET /admin/surveillance` et par le journal structuré. Tests purs (aucune base) :
 * la garde d'administration (404 pour un non-administrateur) est contrôlée sur base réelle dans `app.test.ts`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const charger = vi.fn();
vi.mock("@parcours/geometry-exact", () => ({
  MoteurExact: { charger: () => charger() },
  ErreurExacte: class ErreurExacte extends Error { chemin = "type"; },
}));
const observerSurveillance = vi.fn();
vi.mock("../lib/studio-surveillance-db.js", () => ({ observerSurveillance: () => observerSurveillance() }));

import { revaliderSolidesExacts } from "../lib/atelier-exact.js";
import {
  documentSurveillance, estSourcee, evaluerAlertes, journaliserTransitions, REGLES_ALERTE_STUDIO, SurveillanceStudio, surveillanceStudio,
  type MemoireProcessus, type Observation,
} from "../lib/studio-surveillance.js";
import { adminSurveillanceRouter, SCHEMA_SURVEILLANCE } from "../routes/admin/surveillance.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const memoire = (rss: number): MemoireProcessus => ({ rss, heapUsed: rss / 2, external: 0, arrayBuffers: 0 });

function banc() {
  let t = 0, rss = 100;
  const s = new SurveillanceStudio({ maintenant: () => new Date(Date.UTC(2026, 9, 26, 10, 0, 0) + t), chrono: () => t, memoire: () => memoire(rss) });
  return { s, avancer: (ms: number) => { t += ms; }, memoire: (v: number) => { rss = v; } };
}
const etat = (o: Observation, regle: string, objet: string) => evaluerAlertes(o).find((r) => r.regle === regle && r.objet === objet)!;

describe("R.5-03 / OPS-08 — règles d'alerte déclarées au dépôt", () => {
  it("chaque règle a un seuil chiffré avec sa source écrite, ou est « non évaluée » avec sa raison ; aucune valeur sans source", () => {
    expect(REGLES_ALERTE_STUDIO.length).toBeGreaterThanOrEqual(8);
    expect(new Set(REGLES_ALERTE_STUDIO.map((r) => r.id)).size).toBe(REGLES_ALERTE_STUDIO.length);
    for (const r of REGLES_ALERTE_STUDIO) {
      if (estSourcee(r.seuil)) {
        expect(Number.isFinite(r.seuil.valeur)).toBe(true);
        expect(r.seuil.source.length).toBeGreaterThan(40);
        expect(r.seuil.source).toMatch(/\.ts\b|DEC-|R9|IF-|EX-/);
      } else expect(r.seuil.nonEvalue).toMatch(/DEC-13|OPS-09/);
    }
    // Les mesures de consommation des noyaux (durée, mémoire) n'ont aucun seuil fixé (DEC-13) : jamais chiffrées ici.
    for (const id of ["noyau.duree-max", "noyau.memoire-chargement", "processus.memoire", "job.echecs", "worker.silence"]) {
      expect(estSourcee(REGLES_ALERTE_STUDIO.find((r) => r.id === id)!.seuil)).toBe(false);
    }
    // Portées couvertes : jobs, workers, noyaux exact et rendu.
    expect(new Set(REGLES_ALERTE_STUDIO.map((r) => r.portee))).toEqual(new Set(["job", "worker", "noyau", "processus"]));
  });

  it("R.5-03 [+] job « en-calcul » persisté, boucle de fond en échec, noyau non chargé : alerte ; retour à la normale après un succès", async () => {
    const { s } = banc();
    s.declarerWorker("mail_outbox", 5_000);
    s.workerEchoue("mail_outbox", new Error("smtp injoignable"));
    await expect(s.mesurerChargement("exact", () => Promise.reject(new Error("occt.wasm introuvable")))).rejects.toThrow("occt.wasm introuvable");
    const o = s.observer({ jobs: { enCalcul: 1, echecsFenetre: 0, totalFenetre: 3, fenetreMs: 1 }, courriels: { enAttente: 2, plusAncienMs: 10 } });
    expect(etat(o, "noyau.chargement-echec", "exact")).toMatchObject({ etat: "alerte", valeur: 1 });
    expect(etat(o, "noyau.chargement-echec", "rendu")).toMatchObject({ etat: "normal", valeur: 0 });
    expect(etat(o, "job.en-calcul-persistant", "studio_jobs")).toMatchObject({ etat: "alerte", valeur: 1, seuil: 1 });
    expect(etat(o, "worker.echec", "mail_outbox")).toMatchObject({ etat: "alerte", valeur: 1 });
    s.workerReussi("mail_outbox");
    const apres = s.observer({ jobs: { enCalcul: 0, echecsFenetre: 0, totalFenetre: 3, fenetreMs: 1 }, courriels: null });
    expect(etat(apres, "worker.echec", "mail_outbox").etat).toBe("normal");
    expect(etat(apres, "job.en-calcul-persistant", "studio_jobs").etat).toBe("normal");
  });

  it("R.5-03 [−] une mesure sans seuil fixé ne déclenche jamais d'alerte, quelle que soit sa valeur ; sans donnée : « sans-donnee », jamais zéro", () => {
    const { s, avancer } = banc();
    s.mesurer("exact", "studio.solide.booleen", () => { avancer(9_999_999); return 1; });
    const o = s.observer({ jobs: { enCalcul: 0, echecsFenetre: 10_000, totalFenetre: 10_000, fenetreMs: 1 }, courriels: { enAttente: 1e6, plusAncienMs: 1e9 } });
    for (const r of evaluerAlertes(o).filter((x) => ["noyau.duree-max", "noyau.memoire-chargement", "processus.memoire", "job.echecs", "worker.courriels-en-attente"].includes(x.regle))) {
      expect(r.etat === "non-evaluee" || r.etat === "sans-donnee").toBe(true);
    }
    expect(etat(o, "noyau.duree-max", "exact")).toMatchObject({ etat: "non-evaluee", valeur: 9_999_999, seuil: null });
    expect(etat(o, "noyau.duree-max", "rendu")).toMatchObject({ etat: "sans-donnee", valeur: null });
    const sansBase = s.observer();
    expect(etat(sansBase, "job.en-calcul-persistant", "studio_jobs")).toMatchObject({ etat: "sans-donnee", valeur: null });
  });
});

describe("R.5-03 — erreurs applicatives", () => {
  it("R.5-03 [+] / [−] erreur applicative non traitée : comptée et en alerte pendant la minute qui suit, levée ensuite ; seul le message est gardé", () => {
    const { s, avancer } = banc();
    expect(etat(s.observer(), "api.erreurs-internes", "api")).toMatchObject({ etat: "normal", valeur: 0, seuil: 1 });
    s.erreurApplicative(new Error("colonne inconnue"));
    const o = s.observer();
    expect(etat(o, "api.erreurs-internes", "api")).toMatchObject({ etat: "alerte", valeur: 1 });
    expect(o.erreurs).toMatchObject({ total: 1, fenetre: 1, derniere: { message: "colonne inconnue" } });
    avancer(60_000);
    const apres = s.observer();
    expect(etat(apres, "api.erreurs-internes", "api").etat).toBe("normal");
    expect(apres.erreurs.total).toBe(1);
    // Branchée sur le gestionnaire d'erreurs final de l'API, avant la réponse 500.
    const app = readFileSync(join(RACINE, "apps/api/src/app.ts"), "utf8");
    const gestionnaire = app.slice(app.indexOf("const errorHandler"), app.indexOf("app.use(errorHandler)"));
    expect(gestionnaire.indexOf("surveillanceStudio.erreurApplicative(err)")).toBeGreaterThan(0);
    expect(gestionnaire.indexOf("surveillanceStudio.erreurApplicative(err)")).toBeLessThan(gestionnaire.indexOf('res.status(500)'));
  });
});

describe("R.5-03 / OPS-08 — consommation des noyaux exact et rendu", () => {
  it("chargement mesuré (durée, mémoire du processus avant / après) ; opérations et erreurs comptées par noyau et par opération", async () => {
    const { s, avancer, memoire: rss } = banc();
    await s.mesurerChargement("exact", async () => { avancer(40); rss(900); return "moteur"; });
    s.mesurer("exact", "studio.solide.booleen", () => { avancer(12); return 1; });
    expect(() => s.mesurer("exact", "studio.solide.booleen", () => { avancer(3); throw new Error("intersection vide"); })).toThrow("intersection vide");
    await s.mesurerAsync("rendu", "studio.illustration.locale", async () => { avancer(7); });
    const o = s.observer();
    const exact = o.noyaux.find((n) => n.noyau === "exact")!;
    expect(exact).toMatchObject({ chargements: 1, echecsChargement: 0, dureeDernierChargementMs: 40, executions: 2, erreurs: 1, dureeMaxMs: 12, dureeTotaleMs: 15, derniereDureeMs: 3 });
    expect(exact.memoireAvantChargement?.rss).toBe(100);
    expect(exact.memoireApresChargement?.rss).toBe(900);
    expect(exact.parOperation["studio.solide.booleen"]).toEqual({ executions: 2, erreurs: 1, dureeTotaleMs: 15, dureeMaxMs: 12 });
    expect(exact.derniereErreur).toMatchObject({ operation: "studio.solide.booleen", message: "intersection vide" });
    expect(etat(o, "noyau.memoire-chargement", "exact")).toMatchObject({ etat: "non-evaluee", valeur: 800 });
    expect(o.noyaux.find((n) => n.noyau === "rendu")).toMatchObject({ executions: 1, erreurs: 0, dureeMaxMs: 7 });
  });

  it("noyau exact du serveur branché : un chargement d'OCCT en échec est compté et passe la règle « noyau.chargement-echec » en alerte ; une opération refusée est comptée", async () => {
    const avant = surveillanceStudio.observer().noyaux.find((n) => n.noyau === "exact")!;
    charger.mockRejectedValueOnce(new Error("occt.wasm introuvable"));
    const commande = { type: "solideExact.creer", params: { operation: { entrees: { type: "boite" } } } };
    await expect(revaliderSolidesExacts([structuredClone(commande)] as never)).rejects.toThrow("occt.wasm introuvable");
    const apresEchec = surveillanceStudio.observer();
    expect(apresEchec.noyaux.find((n) => n.noyau === "exact")!.echecsChargement).toBe(avant.echecsChargement + 1);
    expect(etat(apresEchec, "noyau.chargement-echec", "exact").etat).toBe("alerte");
    // Le chargement suivant réussit ; l'opération refusée par le noyau est comptée comme erreur de « solideExact.creer ».
    charger.mockResolvedValueOnce({ executer: () => { throw new Error("paramètres invalides"); } });
    const refus = await revaliderSolidesExacts([structuredClone(commande)] as never);
    expect(refus?.status).toBe(400);
    const exact = surveillanceStudio.observer().noyaux.find((n) => n.noyau === "exact")!;
    expect(exact.chargements).toBe(avant.chargements + 1);
    expect(exact.parOperation["solideExact.creer"]).toMatchObject({ executions: 1, erreurs: 1 });
  });

  it("aucun appel de noyau du serveur hors mesure : chaque exécution OCCT et chaque production d'illustration passe par la surveillance", () => {
    const appels = [
      ["apps/api/src/lib/atelier-exact.ts", /\.executer\(/g], ["apps/api/src/lib/studio-exact.ts", /\.executer\(/g],
      ["apps/api/src/routes/atelier-commands.ts", /\.(?:exporterStep|compterSolidesStep|executer)\(/g],
      ["apps/api/src/lib/studio-illustrations.ts", /\b(?:studioIllustrationLocale|genererIllustrationExterne)\(/g],
    ] as const;
    let vus = 0;
    for (const [f, motif] of appels) {
      for (const ligne of readFileSync(join(RACINE, f), "utf8").split("\n")) {
        if (/^\s*(?:\*|\/\/|import\b)/.test(ligne) || !motif.test(ligne)) { motif.lastIndex = 0; continue; }
        motif.lastIndex = 0;
        vus++;
        expect(ligne, `${f} : ${ligne.trim()}`).toMatch(/surveillanceStudio\.mesurer(?:Async)?\("(?:exact|rendu)"/);
      }
    }
    expect(vus).toBeGreaterThanOrEqual(6);
    expect(readFileSync(join(RACINE, "apps/api/src/lib/atelier-exact.ts"), "utf8")).toMatch(/surveillanceStudio\.mesurerChargement\("exact", \(\) => MoteurExact\.charger\(\)\)/);
  });
});

describe("R.5-03 / OPS-08 — exposition", () => {
  it("journal structuré : une ligne JSON « studio_alerte » à l'entrée en alerte, aucune répétition tant qu'elle dure, « studio_alerte_levee » au retour", () => {
    const { s } = banc();
    s.declarerWorker("account_deletion_job", 3_600_000);
    s.workerEchoue("account_deletion_job", new Error("base indisponible"));
    const lignes: string[] = [];
    let actives = journaliserTransitions(evaluerAlertes(s.observer()), new Set(), (l) => lignes.push(l));
    actives = journaliserTransitions(evaluerAlertes(s.observer()), actives, (l) => lignes.push(l));
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0]!)).toMatchObject({ level: "warn", message: "studio_alerte", regle: "worker.echec", objet: "account_deletion_job", valeur: 1, seuil: 1 });
    s.workerReussi("account_deletion_job");
    actives = journaliserTransitions(evaluerAlertes(s.observer()), actives, (l) => lignes.push(l));
    expect(JSON.parse(lignes[1]!)).toEqual({ level: "info", message: "studio_alerte_levee", regle: "worker.echec", objet: "account_deletion_job" });
    expect(actives.size).toBe(0);
    // Aucune donnée de projet dans le journal : comptages, durées et noms de règles seulement.
    expect(lignes.join("\n")).not.toMatch(/projectId|studyId|variantId|@/);
  });

  it("GET /admin/surveillance : schéma versionné, observation, règles avec seuil et source ou « non évaluée », alertes actives", async () => {
    const { s } = banc();
    s.declarerWorker("mail_outbox", 5_000);
    s.workerEchoue("mail_outbox", new Error("smtp"));
    observerSurveillance.mockResolvedValueOnce(s.observer({ jobs: { enCalcul: 0, echecsFenetre: 2, totalFenetre: 5, fenetreMs: 86_400_000 }, courriels: { enAttente: 0, plusAncienMs: null } }));
    // Gestionnaire de la route appelé directement (la garde interdit toute socket, même locale).
    const couche = (adminSurveillanceRouter.stack as unknown as { route?: { path: string; methods: Record<string, boolean>; stack: { handle: (q: unknown, r: unknown) => Promise<void> }[] } }[]).find((c) => c.route?.path === "/surveillance")!;
    expect(couche.route!.methods).toEqual({ get: true });
    const r = { status: 200, body: undefined as unknown as Record<string, any> };
    await couche.route!.stack[0]!.handle({}, { json: (b: Record<string, any>) => { r.body = b; }, status: (c: number) => { r.status = c; return r; } });
    expect(r.status).toBe(200);
    expect(r.body.schema).toBe(SCHEMA_SURVEILLANCE);
    expect(r.body.regles).toHaveLength(REGLES_ALERTE_STUDIO.length);
    expect(r.body.regles.find((x: { id: string }) => x.id === "noyau.duree-max").seuil).toMatchObject({ nonEvalue: true, raison: expect.stringContaining("DEC-13") });
    expect(r.body.regles.find((x: { id: string }) => x.id === "worker.echec").seuil).toMatchObject({ valeur: 1, source: expect.stringContaining("account-jobs.ts") });
    expect(r.body.alertes).toEqual([expect.objectContaining({ regle: "worker.echec", objet: "mail_outbox", etat: "alerte" })]);
    expect(r.body.observation.noyaux.map((n: { noyau: string }) => n.noyau)).toEqual(["exact", "rendu"]);
    expect(r.body.resultats.find((x: { regle: string }) => x.regle === "job.echecs")).toMatchObject({ etat: "non-evaluee", valeur: 2 });
  });

  it("document versionné des règles et de la vérification après déploiement, tenu au code (docs/studio/SURVEILLANCE-EXPLOITATION.md)", () => {
    const chemin = join(RACINE, "docs/studio/SURVEILLANCE-EXPLOITATION.md");
    const attendu = documentSurveillance();
    if (process.env["STUDIO_SURVEILLANCE_ECRIRE"] === "1") writeFileSync(chemin, attendu);
    expect(readFileSync(chemin, "utf8")).toBe(attendu);
    for (const r of REGLES_ALERTE_STUDIO) expect(attendu).toContain(`\`${r.id}\``);
  });

  it("la route est montée sous la garde d'administration et reconnue comme API (jamais servie comme page)", () => {
    const index = readFileSync(join(RACINE, "apps/api/src/routes/admin/index.ts"), "utf8");
    expect(index.indexOf('adminRouter.use(requirePlatformRole("admin"))')).toBeLessThan(index.indexOf("adminRouter.use(adminSurveillanceRouter)"));
    const app = readFileSync(join(RACINE, "apps/api/src/app.ts"), "utf8");
    expect(app).toContain("admin\\/(?:users|invitations|trash|audit|surveillance)");
    expect(app).toContain("/^\\/(users|invitations|trash|audit|surveillance)(\\/|$)/.test(req.path)");
    const serveur = readFileSync(join(RACINE, "apps/api/src/server.ts"), "utf8");
    expect(serveur).toMatch(/startSurveillance\(\)/);
  });
});
