/**
 * Étude exemple de Studio pour le projet P.118 (« Escalier B et mezzanine ») : une étude « Exemple Studio — P.118 »,
 * une variante par niveau du plan de l'exemple (nommée d'après le niveau), chaque variante peuplée par le CONTRAT DE
 * COMMANDES (`createStudioStudy`, `createStudioVariant`, `submitStudioCommands` : même orchestration, mêmes révisions
 * append-only, INV-010 / A.5-01 ; aucune révision insérée ici). Les commandes viennent du convertisseur pur
 * `@parcours/atelier-model/studio-exemples` (plans `floorDesign` de l'exemple, repère local du plan ; le repère
 * cadastral n'est jamais lu) ; ce qu'il ne sait pas représenter est déclaré dans son rapport, renvoyé tel quel.
 *
 * Droits (choix documenté) : le projet importé de l'exemple est la RÉFÉRENCE PROTÉGÉE (`example_mode = 'reference'`) ;
 * l'installation est une écriture SYSTÈME du contenu de l'exemple, permise au seul propriétaire (`installation-exemple`
 * de `lib/studio-commands.ts` : propriétaire, verrou d'édition d'un autre compte respecté, protection de la référence non
 * opposée à cette seule écriture). Toute autre écriture Studio dans la référence reste refusée (403
 * `reference-protegee`) : l'étude installée y est lisible, pas modifiable.
 *
 * Idempotence : identifiants de requête stables (étude, variante de chaque niveau, chaque lot de 500 commandes au
 * plus) ; une installation interrompue reprend où elle s'est arrêtée (chaque création ou lot déjà enregistré est
 * rejoué tel quel par le serveur) ; une étude complète est renvoyée sans rien écrire.
 */
import { and, eq } from "drizzle-orm";
import { STUDIO_CONTRACT } from "@parcours/atelier-model";
import { convertirExempleP118, lotsDeCommandes, type ConversionExempleP118, type ConversionNiveauP118 } from "@parcours/atelier-model/studio-exemples";
import { db } from "../db/client.js";
import { studioRevisions, studioStudies, studioVariants } from "../db/schema.js";
import { exampleNativeModel } from "../data/parcours.js";
import { loadProjectAccess } from "./owned-project.js";
import { assertAccess, createStudioStudy, createStudioVariant, readStudioStudy, StudioRequestError, submitStudioCommands, type StudioStudyRead } from "./studio-commands.js";

export const STUDIO_EXEMPLE_P118 = Object.freeze({
  /** Exemple importable P.118 (`POST /examples/p118-exemple-complet/import`). */
  exampleId: "p118-exemple-complet",
  nom: "Exemple Studio — P.118",
  /** Préfixe des identifiants de requête (étude, variantes, lots). */
  requete: "exemple-studio-p118",
});

/** Le projet vient-il de l'exemple P.118 (provenance conservée par l'import et par les copies) ? */
export function estProjetExempleP118(sourceExampleId: string | null | undefined): boolean {
  return sourceExampleId === STUDIO_EXEMPLE_P118.exampleId && exampleNativeModel(STUDIO_EXEMPLE_P118.exampleId) !== null;
}

let memo: ConversionExempleP118 | null = null;
/** Conversion des plans de l'exemple (pure, déterministe), calculée une fois par processus. */
export function conversionExempleP118(): ConversionExempleP118 {
  if (!memo) {
    const modele = exampleNativeModel(STUDIO_EXEMPLE_P118.exampleId);
    if (!modele) throw new Error("exemple P.118 sans modèle natif");
    memo = convertirExempleP118({ levels: modele.domains["levels"], floorDesign: modele.domains["floorDesign"] });
  }
  return memo;
}

const idVariante = (n: ConversionNiveauP118) => `${STUDIO_EXEMPLE_P118.requete}:${n.niveauId}`;
const idLot = (n: ConversionNiveauP118, k: number) => `${STUDIO_EXEMPLE_P118.requete}:${n.niveauId}:${k + 1}`;

/** Rapport de conversion par niveau : comptes, éléments déclarés absents, refus motivés, conventions graphiques. */
export interface RapportExempleStudio {
  niveaux: { niveauId: string; nom: string; elevation: number; variantId: string | null; comptes: ConversionNiveauP118["comptes"]; rapport: ConversionNiveauP118["rapport"] }[];
}
export interface StudioExempleInstalle {
  /** Vrai si cet appel a créé l'étude (même partiellement reprise) ; faux si elle existait déjà, complète. */
  created: boolean;
  etude: StudioStudyRead;
  rapport: RapportExempleStudio;
}

async function etudeExistante(projectId: string): Promise<{ id: string } | null> {
  const [s] = await db.select({ id: studioStudies.id }).from(studioStudies)
    .where(and(eq(studioStudies.projectId, projectId), eq(studioStudies.creationRequestId, STUDIO_EXEMPLE_P118.requete))).limit(1);
  return s ?? null;
}
/** Complète : le dernier lot du dernier niveau est enregistré dans une variante de l'étude. */
async function complete(studyId: string, conversion: ConversionExempleP118): Promise<boolean> {
  const dernier = conversion.niveaux[conversion.niveaux.length - 1];
  if (!dernier) return true;
  const lots = lotsDeCommandes(dernier.commandes).length;
  if (!lots) return true;
  const [r] = await db.select({ id: studioRevisions.id }).from(studioRevisions)
    .innerJoin(studioVariants, eq(studioVariants.id, studioRevisions.variantId))
    .where(and(eq(studioVariants.studyId, studyId), eq(studioRevisions.requestId, idLot(dernier, lots - 1)))).limit(1);
  return !!r;
}

function rapportDe(conversion: ConversionExempleP118, variantes: Map<string, string>): RapportExempleStudio {
  return { niveaux: conversion.niveaux.map((n) => ({ niveauId: n.niveauId, nom: n.nom, elevation: n.elevation, variantId: variantes.get(n.niveauId) ?? null, comptes: n.comptes, rapport: n.rapport })) };
}

/**
 * Installe (ou reprend, ou renvoie) l'étude exemple du projet. 404 sans accès, 403 hors propriétaire, 423 pendant
 * l'édition réservée par un autre compte, 409 `exemple_indisponible` si le projet ne vient pas de l'exemple P.118.
 */
export async function installerExempleStudio(projectId: string, actorId: string): Promise<StudioExempleInstalle> {
  const access = assertAccess(await loadProjectAccess(projectId, actorId), actorId, "owner");
  assertAccess(access, actorId, "write");
  if (!estProjetExempleP118(access.sourceExampleId)) {
    throw new StudioRequestError(409, { error: "exemple_indisponible", message: "L'étude exemple de Studio n'existe que pour un projet issu de l'exemple P.118." });
  }
  const conversion = conversionExempleP118();
  const premier = conversion.niveaux[0];
  if (!premier) throw new Error("exemple P.118 sans niveau");
  const existante = await etudeExistante(projectId);
  if (existante && await complete(existante.id, conversion)) {
    const etude = await readStudioStudy(db, projectId, existante.id, actorId, true);
    return { created: false, etude, rapport: rapportDe(conversion, variantesParNiveau(etude, conversion)) };
  }
  const ecriture = "installation-exemple" as const;
  const creation = await createStudioStudy(projectId, actorId, STUDIO_EXEMPLE_P118.nom, STUDIO_EXEMPLE_P118.requete, { ecriture, nomVarianteInitiale: premier.nom });
  const studyId = creation.study.id;
  const tetes: { niveau: ConversionNiveauP118; variantId: string; base: string }[] = [{ niveau: premier, variantId: creation.variant.id, base: creation.variant.headRevisionId }];
  for (const niveau of conversion.niveaux.slice(1)) {
    const v = await createStudioVariant(projectId, studyId, actorId, niveau.nom, idVariante(niveau), undefined, ecriture);
    tetes.push({ niveau, variantId: v.variant.id, base: v.variant.headRevisionId });
  }
  for (const t of tetes) {
    let base = t.base;
    for (const [k, commands] of lotsDeCommandes(t.niveau.commandes).entries()) {
      const r = await submitStudioCommands({ projectId, studyId, variantId: t.variantId }, actorId, { contractVersion: STUDIO_CONTRACT, requestId: idLot(t.niveau, k), baseRevisionId: base, commands }, ecriture);
      base = r.revision.id;
    }
  }
  const etude = await readStudioStudy(db, projectId, studyId, actorId, true);
  return { created: true, etude, rapport: rapportDe(conversion, new Map(tetes.map((t) => [t.niveau.niveauId, t.variantId]))) };
}

/** Variante de chaque niveau d'une étude existante : par nom, dans l'ordre de création (variante initiale d'abord). */
function variantesParNiveau(etude: StudioStudyRead, conversion: ConversionExempleP118): Map<string, string> {
  const m = new Map<string, string>();
  conversion.niveaux.forEach((n, i) => { const v = etude.variants[i]; if (v) m.set(n.niveauId, v.id); });
  return m;
}
