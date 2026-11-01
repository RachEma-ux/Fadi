/**
 * Portées étroites — contrôle en base d'une attribution (Issue #262, reliquat de la phase 2 ;
 * `docs/workstreams/organisations-participation/portees-etroites.md`). La règle pure est dans `@parcours/domain-model`
 * (`problemeIdentifiantPortee`, `capaciteDansPortee`) ; ici, l'élément désigné doit exister dans CE projet : une étude,
 * une variante d'une de ses études, une révision d'une de ses variantes, une famille du catalogue Documents ou un document
 * identifié (dessin enregistré, paquet Studio, dossier Studio ; les documents produits sont désignés par leur `kind`).
 * Un identifiant étranger au projet est refusé (422) : une attribution ne peut jamais viser la ressource d'un autre projet.
 */
import { and, eq } from "drizzle-orm";
import { FAMILLES_DOCUMENTS, familleDocument, problemeIdentifiantPortee, type TypePortee } from "@parcours/domain-model";
import { drawingExports, studioDossiers, studioPublications, studioRevisions, studioStudies, studioVariants } from "../db/schema.js";
import type { Querier } from "./step-rows.js";

/** Motif du refus, ou null si l'élément désigné existe dans le projet. */
export async function porteeInconnue(q: Querier, projectId: string, scopeType: TypePortee, scopeId: string | null): Promise<string | null> {
  const forme = problemeIdentifiantPortee(scopeType, scopeId);
  if (forme) return forme;
  if (scopeType === "projet") return null;
  const id = scopeId!.trim();
  const absent = "Élément de portée introuvable dans ce projet.";
  switch (scopeType) {
    case "etude": {
      const [s] = await q.select({ id: studioStudies.id }).from(studioStudies).where(and(eq(studioStudies.id, id), eq(studioStudies.projectId, projectId))).limit(1);
      return s ? null : absent;
    }
    case "variante": {
      const [v] = await q.select({ id: studioVariants.id }).from(studioVariants).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
        .where(and(eq(studioVariants.id, id), eq(studioStudies.projectId, projectId))).limit(1);
      return v ? null : absent;
    }
    case "revision": {
      const [r] = await q.select({ id: studioRevisions.id }).from(studioRevisions).innerJoin(studioVariants, eq(studioVariants.id, studioRevisions.variantId))
        .innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId)).where(and(eq(studioRevisions.id, id), eq(studioStudies.projectId, projectId))).limit(1);
      return r ? null : absent;
    }
    case "documents": {
      if (FAMILLES_DOCUMENTS.includes(id)) return null;
      const famille = familleDocument(id);
      const ref = id.slice(id.indexOf(":") + 1);
      if (famille === "dessins") {
        const [d] = await q.select({ id: drawingExports.id }).from(drawingExports).where(and(eq(drawingExports.id, ref), eq(drawingExports.projectId, projectId))).limit(1);
        return d ? null : absent;
      }
      if (famille === "studio") {
        const [p] = await q.select({ id: studioPublications.id }).from(studioPublications).where(and(eq(studioPublications.id, ref), eq(studioPublications.projectId, projectId))).limit(1);
        return p ? null : absent;
      }
      if (famille === "studio-dossier") {
        const [d] = await q.select({ id: studioDossiers.id }).from(studioDossiers).innerJoin(studioStudies, eq(studioStudies.id, studioDossiers.studyId))
          .where(and(eq(studioDossiers.id, ref), eq(studioStudies.projectId, projectId))).limit(1);
        return d ? null : absent;
      }
      // Documents produits (tableaux, Atelier, Harmonie, bilan, exemple) : désignés par leur `kind`, sans identifiant de
      // projet ; la forme suffit (un document absent du projet n'est simplement jamais servi).
      return famille ? null : absent;
    }
  }
}
