import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Lot PUB — preuves fonctionnelles de bout en bout sur le routeur Express réel, base simulée en mémoire
 * (`testing/studio-base-simulee.ts`, garde DB fermée : aucune base ni serveur ; mêmes doubles que la matrice des droits).
 * Couvre : vues de coupe enregistrées (EX-075), résultats quantitatifs (IF-008, EX-077), pièces justificatives et BCF
 * (IF-010), observations bloquantes et manifeste (IF-009), publication d'un dossier de conception et pièces
 * indépendantes (EX-074, EX-076), aucune perte de publication après annuler / rétablir (TEST-011), chaîne contrôle →
 * écart → correction → contrôle satisfait → approbation → diffusion (REC-E-03).
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import express from "express";
import request from "supertest";
import { STUDIO_CONTRACT, studioExporterBcf, studioLireBcf, studioSujetsBcf } from "@parcours/atelier-model";
import { studioRouter } from "./studio.js";
import { initialiserProjet, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});
beforeEach(initialiserProjet);

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const PUBS = `${S}/studies/s/publications`;
const VUES = `${S}/studies/s/section-views`;
const appel = (m: "get" | "post" | "patch" | "delete", url: string, corps?: unknown, a: Acteur = "proprietaire") => {
  const r = request(app)[m](url).set("x-acteur", a);
  return corps === undefined ? r : r.send(corps as object);
};
async function ok(m: "get" | "post" | "patch" | "delete", url: string, corps?: unknown, a: Acteur = "proprietaire"): Promise<Record<string, any>> {
  const res = await appel(m, url, corps, a);
  if (res.status >= 300) throw new Error(`${m} ${url} : ${res.status} ${JSON.stringify(res.body).slice(0, 400)}`);
  return res.body;
}
let n = 0;
async function commande(commands: unknown[]): Promise<string> {
  const v = await ok("get", V);
  const r = await ok("post", `${V}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: `q${++n}`, baseRevisionId: v["variant"]["headRevisionId"], commands });
  return r["revision"]["id"] as string;
}
const BOITE = { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3 } };
const VUE_COUPE = { nom: "Coupe AA", niveau: { repere: "local-3d", z: 1 }, cadrage: { xMin: -1, yMin: -1, xMax: 5, yMax: 5 }, echelle: 50, styles: { trait: "fort", hachure: "diagonale" }, annotations: [{ id: "a1", type: "texte", position: { x: 0.5, y: 0.5 }, texte: "Local" }] };
const FEUILLE = { number: "D-01", title: "Détail", format: "A4", orientation: "portrait", scale: 20 };

describe("EX-075 — vues de coupe enregistrées (API)", () => {
  it("EX-075 [+] API : la vue enregistrée garde révision, niveau, cadrage, échelle, styles et annotations ; périmée après une nouvelle révision, rebasée explicitement", async () => {
    const r2 = await commande([BOITE]);
    const vue = await ok("post", `${V}/section-views`, { definition: VUE_COUPE });
    expect(vue).toMatchObject({ revisionId: r2, freshness: "a-jour", definition: { niveau: { repere: "local-3d", z: 1 }, echelle: 50, styles: { trait: "fort", hachure: "diagonale" } } });
    expect(vue["vue"]["coupe"]["sources"]).toEqual([{ id: "b1", segments: 4 }]);
    const r3 = await commande([{ toolId: "studio.solide.deplacer", params: { id: "b1", dx: 0.5, dy: 0, dz: 0 } }]);
    const lue = await ok("get", `${VUES}/${vue["id"]}`);
    expect([lue["freshness"], lue["revisionId"], lue["headRevisionId"]]).toEqual(["perimee", r2, r3]);
    const rebasee = await ok("patch", `${VUES}/${vue["id"]}`, { revisionId: r3 });
    expect([rebasee["freshness"], rebasee["definition"]]).toEqual(["a-jour", lue["definition"]]);
    expect(rebasee["vue"]["empreinteSection"]).not.toBe(lue["vue"]["empreinteSection"]);
    expect((await ok("get", `${S}/studies/s/section-views`))["vues"].map((x: { id: string }) => x.id)).toEqual([vue["id"]]);
  });

  it("EX-075 [−] API : modifier une annotation de la vue n'écrit aucune révision ni aucun paramètre du solide ; la section ne change pas", async () => {
    await commande([BOITE]);
    const vue = await ok("post", `${V}/section-views`, { definition: VUE_COUPE });
    const avant = await ok("get", V);
    const modifiee = await ok("patch", `${VUES}/${vue["id"]}`, { annotation: { op: "modifier", annotation: { id: "a1", type: "texte", position: { x: 0.5, y: 0.5 }, texte: "largeur 9 m" } } });
    const apres = await ok("get", V);
    expect(apres["variant"]["headRevisionId"]).toBe(avant["variant"]["headRevisionId"]);
    expect(apres["revision"]["document"]).toEqual(avant["revision"]["document"]);
    expect(modifiee["vue"]["empreinteSection"]).toBe(vue["vue"]["empreinteSection"]);
    expect(modifiee["definition"]["annotations"][0]["texte"]).toBe("largeur 9 m");
    // Vue citée par un dossier : suppression refusée.
    const f = await ok("post", `${V}/sheets`, FEUILLE);
    await ok("post", `${S}/studies/s/dossiers`, { title: "Dossier", sheetIds: [f["id"]], sectionViewIds: [vue["id"]] });
    expect((await appel("delete", `${VUES}/${vue["id"]}`)).body).toMatchObject({ error: "section_view_in_dossier" });
  });
});

describe("IF-008 — résultats quantitatifs servis par l'API", () => {
  it("IF-008 [+] API : chaque quantité porte quantityId, sourceRevisionSet, ruleId / ruleVersion, objets, unité, valeur brute, affichage et actualité", async () => {
    const r = await ok("get", `${V}/resultats-quantitatifs`);
    expect(r["revisionId"]).toBe("r1");
    const l = r["resultats"].find((x: Record<string, any>) => x.portee === "objet" && x.grandeur === "longueur");
    expect(l).toMatchObject({ ruleId: "studio.metre.longueur", ruleVersion: "1", unit: "m", freshnessStatus: "a-jour", precisionInterne: "ieee754-binary64" });
    expect(l["quantityId"]).toMatch(/^q_/);
    expect(l["sourceRevisionSet"]["revisions"][0]).toMatchObject({ studyId: "s", variantId: "v", revisionId: "r1" });
    await commande([{ toolId: "studio.dessin.ligne", params: { id: "z", type: "line", start: { x: 0, y: 5 }, end: { x: 2, y: 5 } } }]);
    const ancienne = await ok("get", `${V}/resultats-quantitatifs?revisionId=r1`);
    expect(ancienne["resultats"].every((x: Record<string, any>) => x.freshnessStatus === "perimee")).toBe(true);
  });
});

describe("IF-010 — pièces justificatives et BCF (API)", () => {
  it("IF-010 [+] API : l'observation porte issueId distinct, catégorie, gravité et pièce justificative téléchargeable, vérifiée par empreinte", async () => {
    const o = await ok("post", `${V}/observations`, { body: "Gaine non réservée", responsableId: "editeur", categorie: "coordination", gravite: "majeure", pieces: [{ name: "releve.png", mime: "image/png", contentBase64: "iVBORw0KGgo=" }] });
    expect(o).toMatchObject({ categorie: "coordination", gravite: "majeure", resolution: "ouverte", contrat: { noteId: o["id"], gravite: "majeure" } });
    expect(o["issueId"]).not.toBe(o["id"]);
    const p = await appel("get", `${V}/observations/${o["id"]}/pieces/${o["pieces"][0]["sha256"]}`);
    expect(p.status).toBe(200);
    expect(p.headers["x-content-sha256"]).toBe(o["pieces"][0]["sha256"]);
    // Pièce au contenu non conforme à son type : refusée.
    const faux = await appel("post", `${V}/observations`, { body: "x", responsableId: "editeur", pieces: [{ name: "x.pdf", mime: "application/pdf", contentBase64: "iVBORw0KGgo=" }] });
    expect(faux.body).toMatchObject({ error: "invalid_input", code: "piece_invalide" });
  });

  it("IF-010 [−] API : même BCF-ID reçu dans un autre contexte → observation distincte ; même contexte → reconnu sans réécriture ; l'export relu garde les Guid", async () => {
    const fichier = (projet: string) => Buffer.from(studioExporterBcf(studioSujetsBcf([{ issueId: "x1", titre: "Sujet partenaire", description: "Constat", statut: "Open", categorie: "coordination", gravite: "bloquante", creeLe: "2026-10-25T08:00:00.000Z", auteur: "a@x", responsable: null, objets: ["inconnu"], journal: [] }]), { id: projet, nom: projet })).toString("base64");
    const a = await ok("post", `${V}/observations/bcf`, { fichierBase64: fichier("A") });
    expect(a["crees"]).toHaveLength(1);
    expect(a["objetsInconnus"]).toEqual([{ guid: a["crees"][0]["guid"], objets: ["inconnu"] }]);
    const encore = await ok("post", `${V}/observations/bcf`, { fichierBase64: fichier("A") });
    expect([encore["crees"], encore["reconnus"].map((r: { issueId: string }) => r.issueId)]).toEqual([[], [a["crees"][0]["issueId"]]]);
    const b = await ok("post", `${V}/observations/bcf`, { fichierBase64: fichier("B") });
    expect(b["crees"]).toHaveLength(1);
    expect(b["crees"][0]["issueId"]).not.toBe(a["crees"][0]["issueId"]);
    expect(b["homonymes"]).toEqual([{ guid: a["crees"][0]["guid"], issueIdsAutresContextes: [a["crees"][0]["issueId"]] }]);
    const lue = await ok("get", `${V}/observations/${a["crees"][0]["observationId"]}`);
    expect(lue).toMatchObject({ statut: "ouverte", gravite: "bloquante", bcfRefs: [{ guid: a["crees"][0]["guid"] }] });
    const exp = await appel("get", `${V}/observations/bcf`).buffer(true).parse((res, cb) => { const d: Buffer[] = []; res.on("data", (c: Buffer) => d.push(c)); res.on("end", () => cb(null, Buffer.concat(d))); });
    const relu = await studioLireBcf(new Uint8Array(exp.body as Buffer));
    expect(relu.sujets).toHaveLength(2);
  });
});

describe("IF-009 — observation bloquante et manifeste (API)", () => {
  it("IF-009 [−] API : observation bloquante ouverte → soumission refusée (409 blocking_observation_open) ; dérogée par décision du propriétaire → manifeste à actualiser, puis soumission admise", async () => {
    const o = await ok("post", `${V}/observations`, { body: "Bloquant", responsableId: "editeur", gravite: "bloquante", audience: "projet" });
    const pub = await ok("post", `${V}/publications`, { title: "Dossier", contenu: "dessin-2d", usage: "Consultation des entreprises" });
    expect(pub["manifest"]).toMatchObject({ usage: "Consultation des entreprises", controles: { observations: [{ issueId: o["issueId"], resolution: "ouverte" }] } });
    expect(pub["allowed"]).not.toContain("soumettre");
    const refus = await appel("post", `${PUBS}/${pub["id"]}/soumettre`, {});
    expect([refus.status, refus.body["error"]]).toEqual([409, "blocking_observation_open"]);
    // Une proposition ne déroge pas ; une décision du propriétaire, si.
    await ok("post", `${V}/observations/${o["id"]}/decisions`, { nature: "proposition", portee: "derogation", texte: "Proposer la dérogation" }, "editeur");
    expect((await ok("get", `${PUBS}/${pub["id"]}`))["drift"]).toEqual([]);
    await ok("post", `${V}/observations/${o["id"]}/decisions`, { nature: "decision", portee: "derogation", texte: "Dérogation : traité au lot suivant" });
    const lue = await ok("get", `${PUBS}/${pub["id"]}`);
    expect(lue["drift"]).toEqual([{ type: "controles" }]);
    const actualisee = await ok("post", `${PUBS}/${pub["id"]}/actualiser`, {});
    expect(actualisee["manifest"]["controles"]["observations"][0]["resolution"]).toBe("derogee");
    expect((await ok("post", `${PUBS}/${pub["id"]}/soumettre`, {}))["workStatus"]).toBe("en-revue");
  });
});

describe("EX-074 / EX-076 — publication d'un dossier de conception (API)", () => {
  it("EX-074 [+] API : un dossier de conception se publie (revue, approbation, diffusion) ; paquet PDF + JSON, manifeste avec dossier et pièces", async () => {
    const f = await ok("post", `${V}/sheets`, FEUILLE);
    const d = await ok("post", `${S}/studies/s/dossiers`, { title: "Dossier de conception", sheetIds: [f["id"]] });
    const pub = await ok("post", `${V}/publications`, { title: "DCE", contenu: "dossier-conception", dossierId: d["id"] });
    expect(pub["contenu"]).toBe("dossier-conception");
    expect(pub["manifest"]["documents"].map((x: { format: string }) => x.format)).toEqual(["json", "pdf"]);
    expect(pub["manifest"]["dossier"]).toMatchObject({ id: d["id"], pieces: [{ documentId: f["id"], nature: "feuille", origine: "dessin-2d", presentation: "document-independant" }] });
    const s = await ok("post", `${PUBS}/${pub["id"]}/soumettre`, {});
    await ok("post", `${PUBS}/${pub["id"]}/approuver`, { manifestHash: s["manifestHash"] }, "proprietaire").catch(async () => ok("post", `${PUBS}/${pub["id"]}/approuver`, { manifestHash: s["manifestHash"] }, "editeur"));
    const diff = await ok("post", `${PUBS}/${pub["id"]}/diffuser`, {});
    expect(diff["diffusion"]["files"].map((x: { format: string }) => x.format)).toEqual(["pdf", "json"]);
    const j = await appel("get", `${PUBS}/${pub["id"]}/files/json`);
    expect(j.status).toBe(200);
    expect((await ok("get", `${PUBS}/${pub["id"]}/verification`))["identical"]).toBe(true);
  });

  it("EX-076 [+] [−] API : détail 2D et coupe de maquette publiés ensemble avec sources distinctes ; le détail annoncé « synchronisé » sans association est refusé (409 piece_refusee)", async () => {
    await commande([BOITE]);
    const vue = await ok("post", `${V}/section-views`, { definition: VUE_COUPE });
    // Le détail lit une révision antérieure (r1) : aucune association avec la coupe (révision de tête).
    const f = await ok("post", `${V}/sheets`, { ...FEUILLE, revisionId: "r1" });
    const d = await ok("post", `${S}/studies/s/dossiers`, { title: "Dossier", sheetIds: [f["id"]], sectionViewIds: [vue["id"]] });
    const pub = await ok("post", `${V}/publications`, { title: "Conjoint", contenu: "dossier-conception", dossierId: d["id"], presentations: { [vue["id"]]: "extrait-synchronise" } });
    expect(pub["manifest"]["dossier"]["pieces"].map((p: Record<string, any>) => [p.nature, p.origine, p.presentation, p.sources[0].revisionId])).toEqual([
      ["feuille", "dessin-2d", "document-independant", "r1"], ["vue-coupe", "derive-maquette", "extrait-synchronise", vue["revisionId"]],
    ]);
    const refus = await appel("post", `${V}/publications`, { title: "Faux", contenu: "dossier-conception", dossierId: d["id"], presentations: { [f["id"]]: "extrait-synchronise" } });
    expect([refus.status, refus.body["error"], refus.body["refus"]]).toEqual([409, "piece_refusee", [{ code: "synchronisation_non_fondee", documentId: f["id"] }]]);
  });
});

describe("EX-068 — conclusion normative d'un contrôle (API)", () => {
  it("EX-068 [+] [−] API : contrôle conclu conforme / non conforme / non applicable justifié (justification vérifiée, auteur et version du serveur) ; justification invalide refusée", async () => {
    await ok("post", `${S}/studies/s/exigences`, { baseVersion: 0, exigences: [
      { id: "e1", libelle: "Au plus 1 objet", metrique: { type: "nombre" }, comparaison: "<=", valeur: 1, unite: "u", source: "Programme saisi (essai)" },
      { id: "e2", libelle: "Au moins 100 objets", metrique: { type: "nombre" }, comparaison: ">=", valeur: 100, unite: "u", source: "Programme saisi (essai)" },
    ] });
    const sans = await ok("post", `${V}/controles`, {});
    expect(sans["conclusionNormative"]).toMatchObject({ execution: "execute", conclusion: "non-conforme" });
    const na = await ok("post", `${V}/controles`, { nonApplicables: [{ exigenceId: "e2", motif: "Sans objet pour ce lot" }] });
    expect(na["conclusionNormative"]["exigences"].find((x: Record<string, any>) => x.exigenceId === "e2")).toMatchObject({ conclusion: "non-applicable-justifie", justification: { motif: "Sans objet pour ce lot", auteur: "proprietaire", version: 1 } });
    expect((await ok("get", `${V}/controles/${na["id"]}`))["conclusionNormative"]["exigences"][1]["conclusion"]).toBe("non-applicable-justifie");
    const refus = await appel("post", `${V}/controles`, { nonApplicables: [{ exigenceId: "absente", motif: "x" }] });
    expect([refus.status, refus.body["code"], refus.body["motif"]]).toEqual([400, "justification_invalide", "exigence-inconnue"]);
  });
});

describe("TEST-011 / REC-E-03 — aucune perte de publication, chaîne contrôlée jusqu'à la diffusion", () => {
  it("TEST-011 [+] API : après annuler puis rétablir l'opération, la publication diffusée reste lisible et vérifiable (mêmes empreintes), son manifeste inchangé", async () => {
    const pub = await ok("post", `${V}/publications`, { title: "Dessin", contenu: "dessin-2d" });
    const s = await ok("post", `${PUBS}/${pub["id"]}/soumettre`, {});
    await ok("post", `${PUBS}/${pub["id"]}/approuver`, { manifestHash: s["manifestHash"] });
    const diff = await ok("post", `${PUBS}/${pub["id"]}/diffuser`, {});
    const ajout = { toolId: "studio.dessin.ligne", params: { id: "w", type: "line", start: { x: 0, y: 3 }, end: { x: 2, y: 3 } } };
    await commande([ajout]);
    await commande([{ toolId: "studio.dessin.supprimer", params: { ids: ["w"] } }]); // annuler
    await commande([ajout]); // rétablir
    const lue = await ok("get", `${PUBS}/${pub["id"]}`);
    expect([lue["diffusionStatus"], lue["manifestHash"], lue["revisionId"]]).toEqual(["diffuse", diff["manifestHash"], diff["revisionId"]]);
    expect(lue["diffusion"]["files"]).toEqual(diff["diffusion"]["files"]);
    expect((await ok("get", `${PUBS}/${pub["id"]}/verification`))["identical"]).toBe(true);
    for (const f of diff["diffusion"]["files"]) expect((await appel("get", `${PUBS}/${pub["id"]}/files/${f.format}`)).headers["x-content-sha256"]).toBe(f.sha256);
  });

  it("REC-E-03 [+] API : contrôle → écart → correction → nouveau contrôle satisfait → approbation → diffusion, sur la même étude, chaque étape tracée", async () => {
    await ok("post", `${S}/studies/s/exigences`, { baseVersion: 0, exigences: [{ id: "e1", libelle: "Au plus 1 objet", metrique: { type: "nombre" }, comparaison: "<=", valeur: 1, unite: "u", source: "Programme saisi (essai)" }] });
    await commande([{ toolId: "studio.dessin.ligne", params: { id: "k", type: "line", start: { x: 0, y: 7 }, end: { x: 1, y: 7 } } }]);
    const c1 = await ok("post", `${V}/controles`, {});
    expect([c1["execution"], c1["conclusion"]]).toEqual(["execute", "non-satisfaite"]);
    // Écart consigné (gravité majeure, liée au contrôle) ; le cycle complet de l'observation est éprouvé par la recette studio-pub.mjs (base réelle).
    const o = await ok("post", `${V}/observations`, { body: "Trop d'objets", responsableId: "editeur", gravite: "majeure", audience: "projet", liens: [{ domaine: "exigence", ref: "e1", controleId: c1["id"] }] });
    expect(o["contrat"]["sourcesControle"]).toEqual([c1["id"]]);
    const doc = (await ok("get", V))["revision"]["document"] as { objects: { id: string }[] };
    const rc = await commande([{ toolId: "studio.dessin.supprimer", params: { ids: doc.objects.filter((x) => x.id !== "k").map((x) => x.id) } }]);
    const c2 = await ok("post", `${V}/controles`, {});
    expect([c2["revisionId"], c2["conclusion"]]).toEqual([rc, "satisfaite"]);
    await ok("post", `${V}/observations/${o["id"]}/transitions`, { action: "corriger", revisionId: rc }, "editeur");
    const pub = await ok("post", `${V}/publications`, { title: "Étude contrôlée", contenu: "dessin-2d" });
    expect(pub["manifest"]["controles"]).toMatchObject({ regles: [{ type: "exigences", version: "1" }], rapports: [{ controleId: c2["id"], revisionId: rc, execution: "execute", conclusion: "conforme" }], observations: [] });
    const s = await ok("post", `${PUBS}/${pub["id"]}/soumettre`, {});
    await ok("post", `${PUBS}/${pub["id"]}/approuver`, { manifestHash: s["manifestHash"] });
    expect((await ok("post", `${PUBS}/${pub["id"]}/diffuser`, {}))["diffusionStatus"]).toBe("diffuse");
  });
});
