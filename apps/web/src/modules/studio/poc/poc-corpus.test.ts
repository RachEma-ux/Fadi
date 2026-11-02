/**
 * G2-03 — POC autorisés (ADR-STUDIO-PILOTE-01 P-05) joués sur les corpus S1–S7 pertinents, résultats datés et
 * reproductibles. Toujours joué par `npm test` (tailles 100 et 10 000) ; avec `STUDIO_POC_SORTIE=<dossier sous
 * atelier-captures/>`, le rapport daté (`poc-corpus.json`, `poc-corpus.md` : date en heure suisse, commit, environnement,
 * graines, empreintes, verdicts, durées, commande de reproduction) est écrit — c'est ce que consigne le workflow
 * « Studio — POC des corpus » et le rapport versionné `docs/ai-team/reports/etat-studio/POC-CORPUS.json`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  applyStudioCommands, assemblerDossierConception, controlerExigences, createStudioHistory, applyToStudioHistory, exportStudioSvg,
  newStudioDocument, pdfDossierConception, redoStudioHistory, studioChevauchements, studioJsonStable,
  studioMesh3d, studioEmpreinteContenu, studioQuantitesArchitecture, studioQuantitesSolides, studioSha256, undoStudioHistory,
  validateStudioDocument, type StudioCommand, type StudioDocument,
} from "@parcours/atelier-model";
import {
  commandesDuDocument, empreinteCorpus, genererCorpus, GRAINES_CORPUS, oracleCorpus, oracleS6, planS6, SESSION_HORS_RESEAU_S7, TOLERANCE_ORACLE,
  type SceneDocuments,
} from "@parcours/atelier-model/studio-corpus";
import { mesurerCorpus } from "../planche2d/mesure-spatiale";


/*
 * Outils du POC (dans le fichier de test : ce sont des outils d'essai, jamais du code produit du module Studio).
 *
 * POC de la porte G2 sur les corpus de qualification S1–S7 (G2-03 ; périmètre autorisé par ADR-STUDIO-PILOTE-01 P-05 :
 * contexte, 2D, association, chargement, index, conflit, reprise, publication). Chaque POC est joué sur les scènes où il
 * a un sens et rend un résultat **reproductible** (mêmes graines, mêmes empreintes, mêmes valeurs à chaque exécution) et
 * un verdict comparé à l'oracle ou à la référence conservée — jamais à une valeur recopiée à la main. Les durées sont
 * mesurées et rapportées à part : elles ne portent ni seuil ni verdict (DEC-13) et n'entrent pas dans l'empreinte.
 *
 * Le POC « contexte » (ouvrir Studio dans un projet sans le Parcours) ne dépend d'aucun corpus : il est joué par les
 * recettes de navigation (`apps/web/e2e/studio-navigation.mjs`), et le rapport le déclare ainsi.
 * Pur (ni React, ni DOM) ; l'horloge est injectée.
 */
export type Poc = "2d" | "3d" | "association" | "chargement" | "index" | "conflit" | "reprise" | "publication";
export interface ResultatPoc {
  poc: Poc;
  scene: string;
  taille: number;
  /** Conforme : chaque contrôle du POC égale son oracle ou sa référence conservée. */
  verdict: "conforme" | "écart";
  /** Valeurs déterministes (comparées, reproductibles). */
  valeurs: Record<string, number | string | boolean>;
  /** Contrôles en échec (vide si conforme). */
  ecarts: string[];
  /** Durées mesurées (ms) : rapportées, jamais jugées. */
  durees: Record<string, number>;
}
/** Empreintes conservées du corpus (`packages/atelier-model/src/studio/corpus/empreintes.json`). */
export interface EmpreintesConservees { scenes: Record<string, Record<string, { corpus: string; feuillets: number; svg?: string[]; maillage?: string[] }>> }

/** Valeur d'une cote (même règle que le modèle, `objets/cote.ts`) : longueur départ → arrivée, null si à résoudre. */
const valeurCote = (d: { start: { x: number; y: number }; end: { x: number; y: number }; toResolve: boolean }) => (d.toResolve ? null : Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y));
const proche = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE_ORACLE * Math.max(1, Math.abs(b));

function resultat(poc: Poc, scene: string, taille: number, valeurs: ResultatPoc["valeurs"], controles: [string, boolean][], durees: Record<string, number>): ResultatPoc {
  const ecarts = controles.filter(([, ok]) => !ok).map(([nom]) => nom);
  return { poc, scene, taille, verdict: ecarts.length ? "écart" : "conforme", valeurs, ecarts, durees };
}

function chronometrer<T>(maintenant: () => number, f: () => T): [T, number] {
  const t0 = maintenant();
  const r = f();
  return [r, maintenant() - t0];
}

/** 2D (autonomie de la planche) : feuillets valides et canoniques, empreinte du corpus et SVG de référence conservés. */
export function poc2d(scene: SceneDocuments, taille: number, conserve: EmpreintesConservees, maintenant: () => number): ResultatPoc {
  const [corpus, gen] = chronometrer(maintenant, () => genererCorpus(scene, taille));
  const [canoniques, val] = chronometrer(maintenant, () => corpus.documents.every((d) => JSON.stringify(validateStudioDocument(d)) === JSON.stringify(d)));
  const ref = conserve.scenes[scene]?.[String(taille)];
  const empreinte = empreinteCorpus(corpus);
  const controles: [string, boolean][] = [["feuillets valides et canoniques", canoniques], ["empreinte du corpus = empreinte conservée", empreinte === ref?.corpus]];
  const valeurs: ResultatPoc["valeurs"] = { feuillets: corpus.documents.length, empreinte };
  if (taille === 100) {
    const svg = corpus.documents.map((d) => studioSha256(exportStudioSvg(d)));
    controles.push(["SVG de référence identiques (empreintes conservées)", JSON.stringify(svg) === JSON.stringify(ref?.svg)]);
    valeurs.svg = svg.join(",");
  }
  return resultat("2d", scene, taille, valeurs, controles, { generationMs: gen, validationMs: val });
}

/** 3D (autonomie de la vue 3D) : maillage dérivé conservé, volume des solides = oracle. */
export function poc3d(scene: "S4" | "S5", taille: number, conserve: EmpreintesConservees, maintenant: () => number): ResultatPoc {
  const corpus = genererCorpus(scene, taille);
  const [maillage, ms] = chronometrer(maintenant, () => corpus.documents.map((d) => studioEmpreinteContenu(studioMesh3d(d))));
  const volume = corpus.documents.reduce((s, d) => s + (studioQuantitesSolides(d).totalVolume ?? Number.NaN), 0);
  const o = oracleCorpus(scene, taille);
  const controles: [string, boolean][] = [["volume des solides = oracle", proche(volume, o.volumeSolides ?? 0)]];
  if (taille === 100) controles.push(["maillage 3D dérivé = empreinte conservée", JSON.stringify(maillage) === JSON.stringify(conserve.scenes[scene]?.["100"]?.maillage)]);
  return resultat("3d", scene, taille, { maillage: maillage.join(","), volumeSolides: Number(volume.toFixed(9)) }, controles, { maillageMs: ms });
}

/** Association : cotes liées et libres comptées, somme des mesures liées = oracle. */
export function pocAssociation(scene: "S1" | "S2", taille: number): ResultatPoc {
  const corpus = genererCorpus(scene, taille);
  let liees = 0, libres = 0, somme = 0;
  for (const d of corpus.documents) for (const c of d.dimensions ?? []) { if (c.links.start && c.links.end) liees++; else libres++; somme += valeurCote(c) ?? Number.NaN; }
  const o = oracleCorpus(scene, taille).cotes!;
  return resultat("association", scene, taille, { liees, libres, sommeMesures: Number(somme.toFixed(9)) },
    [["cotes liées / libres = oracle", liees === o.liees && libres === o.libres], ["somme des cotes = oracle", proche(somme, o.sommeMesures)]], {});
}

/** Rejoue le plan S6 dans le modèle : têtes et documents après chaque étape. */
function rejouerS6() {
  const plan = planS6();
  const tetes = new Map<string, StudioDocument>(), apres = new Map<string, StudioDocument>();
  for (const e of plan.etapes) {
    let doc = tetes.get(e.variante);
    if (!doc) {
      const v = plan.variantes.find((x) => x.cle === e.variante)!;
      doc = v.depuis ? apres.get(v.depuis.apresEtape)! : newStudioDocument(plan.base.id);
    }
    doc = applyStudioCommands(doc, e.commandes);
    tetes.set(e.variante, doc);
    apres.set(e.cle, doc);
  }
  return { plan, tetes, apres };
}

/** Association sur S6 : le mur hôte suit son ouverture (REC-A-03 : 3,180 m³ puis 3,096 m³). */
export function pocAssociationS6(): ResultatPoc {
  const { apres } = rejouerS6();
  const net = (d: StudioDocument) => { const m = studioQuantitesArchitecture(d.architecture ?? []).find((x) => x.id === "s6-0-mur-h"); return m && m.type === "wall" ? m.volumeNet : Number.NaN; };
  const avant = net(apres.get("A1")!), apresA2 = net(apres.get("A2")!);
  return resultat("association", "S6", 100, { netA1: Number(avant.toFixed(9)), netA2: Number(apresA2.toFixed(9)) },
    [["A1 : net du mur = 3,180 m³", proche(avant, 3.18)], ["A2 : net du mur = 3,096 m³ (ouverture ajoutée)", proche(apresA2, 3.096)], ["A2 = oracle", proche(apresA2, oracleS6().premierMur.apres.net)]], {});
}

/** Chargement : le document se recharge exactement depuis son journal de commandes (`studio-commands/1`). */
export function pocChargement(scene: SceneDocuments, taille: number, maintenant: () => number): ResultatPoc {
  const corpus = genererCorpus(scene, taille);
  let identiques = true, commandes = 0, rejeu = 0;
  for (const d of corpus.documents) {
    const cmds = commandesDuDocument(d);
    commandes += cmds.length;
    const [recharge, ms] = chronometrer(maintenant, () => applyStudioCommands(newStudioDocument(d.id), cmds));
    rejeu += ms;
    identiques &&= JSON.stringify(recharge) === JSON.stringify(d);
  }
  return resultat("chargement", scene, taille, { commandes, feuillets: corpus.documents.length }, [["document rechargé par ses commandes = document généré", identiques]], { rejeuMs: rejeu });
}

/** Index : sélection et candidats d'accrochage identiques par l'index C.1 et par le parcours linéaire. */
export function pocIndex(scene: SceneDocuments, taille: number, maintenant: () => number): ResultatPoc {
  const m = mesurerCorpus(scene, taille, { requetes: 30, echauffement: 2, graine: 7, maintenant });
  return resultat("index", scene, taille, { elements: m.elementsPlanche, formes: m.formesAccrochables, divergencesSelection: m.selection.divergences, divergencesAccrochage: m.accrochage.divergences },
    [["sélection : index = parcours linéaire", m.selection.divergences === 0], ["accrochage : index = parcours linéaire", m.accrochage.divergences === 0]],
    { selectionIndexP50: m.selection.indexe.p50, selectionLineaireP50: m.selection.lineaire.p50, accrochageIndexP50: m.accrochage.indexe.p50 });
}

/** Conflit : deux écritures concurrentes sur le même mur sont signalées ; sur deux murs différents, aucune. */
export function pocConflit(scene: "S2" | "S7"): ResultatPoc {
  const base = genererCorpus(scene, 100).documents[0]!;
  const murs = (base.architecture ?? []).filter((x) => x.type === "wall");
  const changer = (d: StudioDocument, id: string, epaisseur: number): StudioDocument => ({ ...d, architecture: (d.architecture ?? []).map((x) => (x.id === id && x.type === "wall" ? { ...x, thickness: epaisseur } : x)) });
  const local = changer(base, murs[0]!.id, 0.25);
  const meme = studioChevauchements(base, local, changer(base, murs[0]!.id, 0.3));
  const autre = studioChevauchements(base, local, changer(base, murs[1]!.id, 0.3));
  const identique = studioChevauchements(base, local, changer(base, murs[0]!.id, 0.25));
  return resultat("conflit", scene, 100, { chevauchementMemeMur: meme.join(","), chevauchementAutreMur: autre.length, memeResultat: identique.length },
    [["même mur, résultats différents : chevauchement signalé", meme.length === 1 && meme[0] === `architecture:${murs[0]!.id}`], ["murs différents : aucun chevauchement", autre.length === 0], ["même résultat des deux côtés : aucun chevauchement", identique.length === 0]], {});
}

/** Reprise : la session hors réseau S7 (rectangle ajouté) s'annule et se rétablit ; son rejeu est déterministe. */
export function pocReprise(): ResultatPoc {
  const base = genererCorpus("S7", 100).documents[0]!;
  const r = SESSION_HORS_RESEAU_S7.rectangle;
  const cmd = { toolId: "studio.dessin.rectangle", params: { id: "s7-hors-ligne", type: "rectangle", origin: { x: r.x, y: r.y }, width: r.largeur, height: r.hauteur } } as unknown as StudioCommand;
  const h = applyToStudioHistory(createStudioHistory(base), [cmd]);
  const apres = h.present, annule = undoStudioHistory(h).present, retabli = redoStudioHistory(undoStudioHistory(h)).present;
  const rejoue = applyStudioCommands(base, [cmd]);
  return resultat("reprise", "S7", 100, { objetsAvant: base.objects.length, objetsApres: apres.objects.length, empreinteApres: studioSha256(studioJsonStable(apres)) },
    [["un objet ajouté", apres.objects.length === base.objects.length + 1], ["annuler rend le corpus de départ intact", studioJsonStable(annule) === studioJsonStable(base)], ["rétablir rend la session", studioJsonStable(retabli) === studioJsonStable(apres)], ["rejeu de la même commande : même document", studioJsonStable(rejoue) === studioJsonStable(apres)]], {});
}

/** Publication : contrôles des exigences = oracle sur A, B, C ; dossier de conception de la tête A déterministe. */
export function pocPublication(maintenant: () => number): ResultatPoc {
  const { plan, tetes } = rejouerS6();
  const o = oracleS6();
  const jeu = { version: 1, exigences: plan.exigences.map((e) => ({ ...e, valeur: o.exigences.valeurs[e.id]! })) };
  const conclusions = (["A", "B", "C"] as const).map((v) => [v, controlerExigences("s6", v, tetes.get(v)!, jeu as never).conclusion] as const);
  const tete = tetes.get(plan.feuille.variante)!;
  const source = { studyId: "s6", studyName: plan.etude, variantId: plan.feuille.variante, revisionId: "tete", documentHash: studioSha256(studioJsonStable(tete)) };
  const entree = () => ({
    titre: plan.dossier.title, etude: { id: "s6", nom: plan.etude },
    feuilles: [{ id: "f1", definition: { numero: plan.feuille.number, titre: plan.feuille.title, format: plan.feuille.format, orientation: plan.feuille.orientation, echelle: plan.feuille.scale, vueSource: { type: "planche-2d" as const } }, document: tete, source }],
    metre: { document: tete, source },
  });
  const [a, ms] = chronometrer(maintenant, () => assemblerDossierConception(entree()));
  const b = assemblerDossierConception(entree());
  const pdfA = studioSha256(Array.from(pdfDossierConception(a.dossier, a.rendus), (x) => String.fromCharCode(x)).join(""));
  const pdfB = studioSha256(Array.from(pdfDossierConception(b.dossier, b.rendus), (x) => String.fromCharCode(x)).join(""));
  return resultat("publication", "S6", 100, { conclusions: conclusions.map(([v, c]) => `${v}:${c}`).join(","), empreinteDossier: a.dossier.empreinte, empreintePdf: pdfA },
    [["contrôles des exigences = oracle (A, B, C)", conclusions.every(([v, c]) => c === o.exigences.conclusions[v])], ["dossier de conception déterministe (empreinte)", a.dossier.empreinte === b.dossier.empreinte], ["PDF du dossier déterministe", pdfA === pdfB]],
    { dossierMs: ms });
}

/** Tous les POC autorisés sur leurs scènes pertinentes. */
export function jouerPocs(conserve: EmpreintesConservees, maintenant: () => number, tailles: readonly number[] = [100, 10_000]): ResultatPoc[] {
  const out: ResultatPoc[] = [];
  for (const t of tailles) {
    for (const s of ["S1", "S2", "S3", "S7"] as const) out.push(poc2d(s, t, conserve, maintenant));
    for (const s of ["S4", "S5"] as const) out.push(poc3d(s, t, conserve, maintenant));
    for (const s of ["S1", "S2"] as const) out.push(pocAssociation(s, t));
    for (const s of ["S1", "S2", "S3", "S4", "S5", "S7"] as const) out.push(pocChargement(s, t, maintenant));
    for (const s of ["S1", "S2", "S3", "S4", "S5", "S7"] as const) out.push(pocIndex(s, t, maintenant));
  }
  out.push(pocAssociationS6(), pocConflit("S2"), pocConflit("S7"), pocReprise(), pocPublication(maintenant));
  return out;
}

/** Empreinte des résultats déterministes (sans les durées) : la même à chaque exécution reproductible. */
export const empreinteResultats = (r: readonly ResultatPoc[]): string => studioSha256(JSON.stringify(r.map(({ durees: _d, ...x }) => x)));

export const POC_HORS_CORPUS = Object.freeze([
  { poc: "contexte", raison: "ouvrir Studio dans un projet sans le Parcours ne dépend d'aucun corpus : recettes apps/web/e2e/studio-navigation.mjs (NAV-002 à NAV-004) et studio-preuves-d1.mjs (parcours A, B, C)" },
]);

vi.setConfig({ testTimeout: 300_000 });
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const CONSERVE = JSON.parse(readFileSync(join(RACINE, "packages/atelier-model/src/studio/corpus/empreintes.json"), "utf8")) as EmpreintesConservees;
const horloge = () => performance.now();

/** Heure suisse (Europe/Zurich), ISO 8601 avec décalage. */
export function heureSuisse(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" }).formatToParts(d).map((x) => [x.type, x.value]));
  const decalage = String(p.timeZoneName).replace("GMT", "") || "+00:00";
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${decalage}`;
}

function rapportMarkdown(r: { date: string; commit: string; environnement: Record<string, string | number>; empreinte: string; resultats: ResultatPoc[] }): string {
  return [
    "# POC de la porte G2 sur les corpus S1–S7 (G2-03)", "",
    `Exécution du ${r.date} (heure suisse), commit \`${r.commit}\`. Empreinte des résultats déterministes : \`${r.empreinte}\`.`,
    "Périmètre autorisé : ADR-STUDIO-PILOTE-01 P-05 (contexte, 2D, association, chargement, index, conflit, reprise, publication).",
    "Reproduire : `STUDIO_POC_SORTIE=atelier-captures/poc-corpus npx --workspace=@fadi/web vitest run src/modules/studio/poc/poc-corpus.test.ts`.",
    "Les durées sont mesurées sans seuil ni verdict (DEC-13) et hors empreinte.", "",
    "## Environnement", "", ...Object.entries(r.environnement).map(([k, v]) => `- ${k} : ${v}`), "",
    "## Résultats", "", "| POC | Scène | Taille | Verdict | Valeurs | Durées (ms) |", "|---|---|---:|---|---|---|",
    ...r.resultats.map((x) => `| ${x.poc} | ${x.scene} | ${x.taille} | ${x.verdict}${x.ecarts.length ? ` (${x.ecarts.join(" ; ")})` : ""} | ${Object.entries(x.valeurs).map(([k, v]) => `${k}=${String(v).slice(0, 24)}`).join(", ")} | ${Object.entries(x.durees).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ")} |`),
    "", "## POC hors corpus", "", ...POC_HORS_CORPUS.map((x) => `- ${x.poc} : ${x.raison}`), "",
  ].join("\n");
}

describe("G2-03 — POC autorisés sur les corpus S1–S7", () => {
  const resultats = jouerPocs(CONSERVE, horloge);

  it("G2-03 [+] chaque POC autorisé, sur chaque corpus pertinent, est conforme à son oracle ou à sa référence conservée", () => {
    const pocs = new Set(resultats.map((r) => r.poc));
    expect([...pocs].sort()).toEqual(["2d", "3d", "association", "chargement", "conflit", "index", "publication", "reprise"]);
    expect(new Set(resultats.map((r) => r.scene))).toEqual(new Set(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]));
    expect(resultats.filter((r) => r.verdict !== "conforme").map((r) => `${r.poc} ${r.scene} ${r.taille} : ${r.ecarts.join(" ; ")}`)).toEqual([]);
    expect(POC_HORS_CORPUS.map((x) => x.poc)).toEqual(["contexte"]);
  });

  it("G2-03 [+] résultats reproductibles : deuxième exécution, même empreinte des résultats déterministes", () => {
    expect(empreinteResultats(jouerPocs(CONSERVE, horloge))).toBe(empreinteResultats(resultats));
  });

  it("G2-03 [−] une référence conservée altérée d'un octet fait passer le POC en écart", () => {
    const altere = structuredClone(CONSERVE);
    const e = altere.scenes.S1!["100"]!;
    e.corpus = `${e.corpus.slice(0, -1)}${e.corpus.endsWith("0") ? "1" : "0"}`;
    const r = poc2d("S1", 100, altere, horloge);
    expect(r.verdict).toBe("écart");
    expect(r.ecarts).toContain("empreinte du corpus = empreinte conservée");
  });

  it("G2-03 [+] rapport daté et reproductible : date en heure suisse, commit, environnement, graines, empreinte, commande", () => {
    expect(heureSuisse(new Date("2026-10-25T09:00:00Z"))).toBe("2026-10-25T10:00:00+01:00");
    expect(heureSuisse(new Date("2026-07-01T09:00:00Z"))).toBe("2026-07-01T11:00:00+02:00");
    const sortie = process.env.STUDIO_POC_SORTIE;
    if (!sortie) return;
    const captures = resolve(RACINE, "atelier-captures"), out = resolve(RACINE, sortie), rel = relative(captures, out);
    if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error(`STUDIO_POC_SORTIE doit être un sous-dossier de ${captures}${sep}`);
    const commit = process.env.STUDIO_POC_COMMIT ?? execFileSync("git", ["-C", RACINE, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const environnement = {
      node: process.versions.node, icu: process.versions.icu ?? "absent", plateforme: `${platform()} ${release()} (${arch()})`,
      processeur: `${cpus()[0]?.model ?? "inconnu"} × ${cpus().length}`, memoire: `${Math.round(totalmem() / 2 ** 30)} Gio`,
      execution: process.env.GITHUB_RUN_ID ? `GitHub Actions, exécution ${process.env.GITHUB_RUN_ID} (${process.env.GITHUB_WORKFLOW ?? ""})` : "poste local",
    };
    const rapport = {
      schema: "studio-poc-corpus/1", date: heureSuisse(new Date()), commit, environnement,
      autorisation: "ADR-STUDIO-PILOTE-01 P-05 (G2-02) : contexte, 2D, association, chargement, index, conflit, reprise, publication",
      graines: GRAINES_CORPUS, tailles: [100, 10_000], empreinte: empreinteResultats(resultats),
      commande: "STUDIO_POC_SORTIE=atelier-captures/poc-corpus npx --workspace=@fadi/web vitest run src/modules/studio/poc/poc-corpus.test.ts",
      horsCorpus: POC_HORS_CORPUS, resultats,
    };
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "poc-corpus.json"), `${JSON.stringify(rapport, null, 1)}\n`);
    writeFileSync(join(out, "poc-corpus.md"), rapportMarkdown(rapport));
  });
});
