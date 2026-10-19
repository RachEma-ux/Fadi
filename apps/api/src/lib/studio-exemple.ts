/**
 * Étude exemple de Studio pour le projet P.118 (« Escalier B et mezzanine ») : une étude « Exemple Studio — P.118 »,
 * une variante par niveau du plan de l'exemple (nommée d'après le niveau), chaque variante peuplée par le CONTRAT DE
 * COMMANDES (`createStudioStudy`, `createStudioVariant`, `submitStudioCommands` : même orchestration, mêmes révisions
 * append-only, INV-010 / A.5-01 ; aucune révision insérée ici). Les commandes viennent du convertisseur pur
 * `@parcours/atelier-model/studio-exemples` (plans `floorDesign` de l'exemple, repère local du plan ; le repère
 * cadastral n'est jamais lu) ; ce qu'il ne sait pas représenter est déclaré dans son rapport, enregistré avec
 * l'installation et renvoyé tel quel.
 *
 * Droits (choix documenté) : le projet importé de l'exemple est la RÉFÉRENCE PROTÉGÉE (`example_mode = 'reference'`) ;
 * l'installation est une écriture SYSTÈME du contenu de l'exemple, permise au seul propriétaire (`installation-exemple`
 * de `lib/studio-commands.ts` : propriétaire, verrou d'édition d'un autre compte respecté, protection de la référence non
 * opposée à cette seule écriture). Toute autre écriture Studio dans la référence reste refusée (403
 * `reference-protegee`) : l'étude installée y est lisible, pas modifiable. Une étude déjà complète est renvoyée en
 * LECTURE seule (propriétaire ; aucun 423 pendant le verrou d'édition d'un autre compte, rien n'est écrit).
 *
 * Marquage EXPLICITE (`studio_studies.example_install`) : exemple, version du convertisseur et empreinte des commandes,
 * préfixe des identifiants de requête, état complet, rapport de conversion. Il est écrit avec l'étude (même
 * transaction, `complete: false`) puis passé à `complete: true` après le dernier lot ; l'état de l'exemple d'un projet
 * (`absente | partielle | complete`) se lit dans ce marquage, jamais par déduction.
 *
 * Idempotence : identifiants de requête stables, préfixés par l'exemple, la version et l'empreinte de la conversion
 * (étude, variante de chaque niveau, chaque lot de 500 commandes au plus) ; une installation interrompue reprend où elle
 * s'est arrêtée (chaque création ou lot déjà enregistré est rejoué tel quel par le serveur). Une installation partielle
 * d'une AUTRE version de la conversion n'est pas reprise (409 `exemple_version_changee`) : ses lots ne correspondraient
 * plus ; aucune seconde étude exemple n'est créée d'office (choix conservateur). Une étude complète d'une version
 * antérieure reste l'étude exemple du projet (aucune réinstallation automatique).
 */
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { STUDIO_CONTRACT } from "@parcours/atelier-model";
import { convertirExempleP118, lotsDeCommandes, type ConversionExempleP118, type ConversionNiveauP118 } from "@parcours/atelier-model/studio-exemples";
import { db } from "../db/client.js";
import { studioStudies, studioVariants, type StudioExampleInstall } from "../db/schema.js";
import { exampleNativeModel } from "../data/parcours.js";
import { loadProjectAccess } from "./owned-project.js";
import { assertAccess, createStudioStudy, createStudioVariant, readStudioStudy, STUDIO_PREFIXE_EXEMPLE, StudioRequestError, submitStudioCommands, type StudioStudyRead } from "./studio-commands.js";

export const STUDIO_EXEMPLE_P118 = Object.freeze({
  /** Exemple importable P.118 (`POST /examples/p118-exemple-complet/import`). */
  exampleId: "p118-exemple-complet",
  nom: "Exemple Studio — P.118",
  /** Racine des identifiants de requête (étude, variantes, lots), dans le préfixe réservé `STUDIO_PREFIXE_EXEMPLE`. */
  requete: `${STUDIO_PREFIXE_EXEMPLE}p118`,
});

/** Le projet vient-il de l'exemple P.118 (provenance conservée par l'import et par les copies) ? */
export function estProjetExempleP118(sourceExampleId: string | null | undefined): boolean {
  return sourceExampleId === STUDIO_EXEMPLE_P118.exampleId && exampleNativeModel(STUDIO_EXEMPLE_P118.exampleId) !== null;
}

/** Conversion des plans de l'exemple et sa signature (version du convertisseur, empreinte des commandes, préfixe). */
export interface ConversionSignee { conversion: ConversionExempleP118; version: number; empreinte: string; prefixe: string }
let memo: ConversionSignee | null = null;
/** Conversion pure et déterministe, calculée une fois par processus. */
export function conversionExempleP118(): ConversionSignee {
  if (!memo) {
    const modele = exampleNativeModel(STUDIO_EXEMPLE_P118.exampleId);
    if (!modele) throw new Error("exemple P.118 sans modèle natif");
    const conversion = convertirExempleP118({ levels: modele.domains["levels"], floorDesign: modele.domains["floorDesign"] });
    const empreinte = createHash("sha256").update(JSON.stringify(conversion.niveaux.map((n) => [n.niveauId, n.nom, n.commandes]))).digest("hex").slice(0, 12);
    memo = { conversion, version: conversion.version, empreinte, prefixe: `${STUDIO_EXEMPLE_P118.requete}.v${conversion.version}.${empreinte}` };
  }
  return memo;
}

const idVariante = (prefixe: string, niveauId: string) => `${prefixe}:${niveauId}`;
const idLot = (prefixe: string, niveauId: string, k: number) => `${prefixe}:${niveauId}:${k + 1}`;

/** Rapport de conversion par niveau : comptes, éléments déclarés absents, refus motivés, conventions graphiques. */
export interface RapportExempleStudio {
  version: number;
  empreinte: string;
  niveaux: { niveauId: string; nom: string; elevation: number; variantId: string | null; comptes: ConversionNiveauP118["comptes"]; rapport: ConversionNiveauP118["rapport"] }[];
}
export interface StudioExempleInstalle {
  /** Vrai si cet appel a créé ou repris l'étude ; faux si elle existait déjà, complète (rien n'est écrit). */
  created: boolean;
  etude: StudioStudyRead;
  rapport: RapportExempleStudio;
}
/** État de l'étude exemple d'un projet issu de l'exemple P.118 ; `null` hors d'un tel projet. */
export interface EtatExempleStudio { etat: "absente" | "partielle" | "complete"; studyId: string | null }

/**
 * Étude ACTIVE marquée comme l'exemple P.118 du projet (la plus récente), ou null. Une étude exemple archivée est hors
 * jeu (revue Codex #206) : c'est la voie de sortie prescrite par `exemple_version_changee` (archiver l'installation
 * partielle d'une autre version, puis relancer) ; la relancer ne doit pas resélectionner la même étude.
 */
async function etudeExemple(projectId: string): Promise<{ id: string; initialVariantId: string; exampleInstall: StudioExampleInstall } | null> {
  const rows = await db.select({ id: studioStudies.id, initialVariantId: studioStudies.initialVariantId, exampleInstall: studioStudies.exampleInstall }).from(studioStudies)
    .where(and(eq(studioStudies.projectId, projectId), isNotNull(studioStudies.exampleInstall), isNull(studioStudies.archivedAt)))
    .orderBy(desc(studioStudies.createdAt));
  const s = rows.find((r) => r.exampleInstall?.exampleId === STUDIO_EXEMPLE_P118.exampleId);
  return s ? { ...s, exampleInstall: s.exampleInstall! } : null;
}

/** État lu dans le marquage explicite ; null si le projet ne vient pas de l'exemple P.118. Droit de lecture exigé. */
export async function etatExempleStudio(projectId: string, actorId: string): Promise<EtatExempleStudio | null> {
  const access = assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  if (!estProjetExempleP118(access.sourceExampleId)) return null;
  const s = await etudeExemple(projectId);
  return { etat: !s ? "absente" : s.exampleInstall.complete ? "complete" : "partielle", studyId: s?.id ?? null };
}

/** Variante de chaque niveau : la variante initiale pour le premier, sinon par `creationRequestId` (préfixe enregistré). */
async function variantesParNiveau(etude: { id: string; initialVariantId: string }, prefixe: string, conversion: ConversionExempleP118): Promise<Map<string, string>> {
  const rows = await db.select({ id: studioVariants.id, creationRequestId: studioVariants.creationRequestId }).from(studioVariants).where(eq(studioVariants.studyId, etude.id));
  const parRequete = new Map(rows.filter((r) => r.creationRequestId !== null).map((r) => [r.creationRequestId!, r.id]));
  const m = new Map<string, string>();
  conversion.niveaux.forEach((n, i) => {
    const id = i === 0 ? etude.initialVariantId : parRequete.get(idVariante(prefixe, n.niveauId));
    if (id) m.set(n.niveauId, id);
  });
  return m;
}

function rapportDe(signee: Pick<ConversionSignee, "conversion" | "version" | "empreinte">, variantes: Map<string, string>): RapportExempleStudio {
  return {
    version: signee.version, empreinte: signee.empreinte,
    niveaux: signee.conversion.niveaux.map((n) => ({ niveauId: n.niveauId, nom: n.nom, elevation: n.elevation, variantId: variantes.get(n.niveauId) ?? null, comptes: n.comptes, rapport: n.rapport })),
  };
}
/** Rapport enregistré d'une installation (sans variantes), complété des variantes retrouvées. */
function rapportEnregistre(marquage: StudioExampleInstall, variantes: Map<string, string>): RapportExempleStudio {
  const r = marquage.rapport as RapportExempleStudio;
  return { ...r, niveaux: r.niveaux.map((n) => ({ ...n, variantId: variantes.get(n.niveauId) ?? null })) };
}

/**
 * Installe (ou reprend, ou renvoie) l'étude exemple du projet. 404 sans accès, 403 hors propriétaire, 409
 * `exemple_indisponible` si le projet ne vient pas de l'exemple P.118. Étude complète : renvoyée sans écriture (200,
 * lecture seule, même pendant le verrou d'un autre compte). Sinon : 423 pendant l'édition réservée par un autre compte,
 * 409 `exemple_version_changee` si l'installation partielle vient d'une autre version de la conversion.
 */
export async function installerExempleStudio(projectId: string, actorId: string): Promise<StudioExempleInstalle> {
  const access = assertAccess(await loadProjectAccess(projectId, actorId), actorId, "owner");
  if (!estProjetExempleP118(access.sourceExampleId)) {
    throw new StudioRequestError(409, { error: "exemple_indisponible", message: "L'étude exemple de Studio n'existe que pour un projet issu de l'exemple P.118." });
  }
  const signee = conversionExempleP118();
  const { conversion } = signee;
  const existante = await etudeExemple(projectId);
  if (existante?.exampleInstall.complete) {
    const variantes = await variantesParNiveau(existante, existante.exampleInstall.prefixe, conversion);
    return { created: false, etude: await readStudioStudy(db, projectId, existante.id, actorId, true), rapport: rapportEnregistre(existante.exampleInstall, variantes) };
  }
  assertAccess(access, actorId, "write");
  if (existante && (existante.exampleInstall.empreinte !== signee.empreinte || existante.exampleInstall.version !== signee.version)) {
    throw new StudioRequestError(409, { error: "exemple_version_changee", message: "L'installation interrompue de l'exemple vient d'une autre version de la conversion : elle n'est pas reprise. Archivez cette étude pour installer la version actuelle." });
  }
  const premier = conversion.niveaux[0];
  if (!premier) throw new Error("exemple P.118 sans niveau");
  const { prefixe } = signee;
  const ecriture = "installation-exemple" as const;
  const rapportInitial = rapportDe(signee, new Map());
  const marquage: StudioExampleInstall = { exampleId: STUDIO_EXEMPLE_P118.exampleId, version: signee.version, empreinte: signee.empreinte, prefixe, complete: false, rapport: rapportInitial };
  const creation = await createStudioStudy(projectId, actorId, STUDIO_EXEMPLE_P118.nom, prefixe, { ecriture, nomVarianteInitiale: premier.nom, exampleInstall: marquage });
  const studyId = creation.study.id;
  const tetes: { niveau: ConversionNiveauP118; variantId: string; base: string }[] = [{ niveau: premier, variantId: creation.variant.id, base: creation.variant.headRevisionId }];
  for (const niveau of conversion.niveaux.slice(1)) {
    const v = await createStudioVariant(projectId, studyId, actorId, niveau.nom, idVariante(prefixe, niveau.niveauId), undefined, ecriture);
    tetes.push({ niveau, variantId: v.variant.id, base: v.variant.headRevisionId });
  }
  for (const t of tetes) {
    let base = t.base;
    for (const [k, commands] of lotsDeCommandes(t.niveau.commandes).entries()) {
      const r = await submitStudioCommands({ projectId, studyId, variantId: t.variantId }, actorId, { contractVersion: STUDIO_CONTRACT, requestId: idLot(prefixe, t.niveau.niveauId, k), baseRevisionId: base, commands }, ecriture);
      base = r.revision.id;
    }
  }
  // Dernier lot enregistré : l'installation est marquée complète (un échec ici laisse l'état « partielle » ; la reprise
  // rejoue tout sans rien réécrire, puis marque).
  await db.update(studioStudies).set({ exampleInstall: { ...marquage, complete: true } }).where(and(eq(studioStudies.id, studyId), eq(studioStudies.projectId, projectId)));
  const variantes = new Map(tetes.map((t) => [t.niveau.niveauId, t.variantId]));
  return { created: true, etude: await readStudioStudy(db, projectId, studyId, actorId, true), rapport: rapportDe(signee, variantes) };
}
