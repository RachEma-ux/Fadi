/**
 * Persistance du modèle typé de l'Atelier (`@parcours/atelier-model`, contrat `modele-atelier/1`) dans les tables
 * `atelier_*` (cahier des charges §5.5). Lecture complète ou par niveau, écriture par différentiel (seules les
 * entrées changées sont réécrites, à partir du même instantané différentiel qui sert d'inverse), remplacement
 * complet à l'import. Le modèle en mémoire est l'état sur lequel les réducteurs purs s'exécutent ; la base n'est
 * jamais modifiée par une route hors du service de commandes (R9).
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Calque, Definition, Groupe, ModeleAtelier, Niveau, OccurrenceQuelconque, Probleme, Reference, Relation } from "@parcours/atelier-model";
import { differentiel, modeleVide } from "@parcours/atelier-model";
import type { db } from "../db/client.js";
import { atelierCalques, atelierDefinitions, atelierGroupes, atelierNiveaux, atelierObjets, atelierProblemes, atelierReferences, atelierRelations, atelierSite } from "../db/schema.js";

export type Querier = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ModeleCharge {
  etat: ModeleAtelier;
  nativeId: string;
}

const site = (row: typeof atelierSite.$inferSelect): ModeleAtelier["site"] => ({
  parcelle: (row.parcelle as ModeleAtelier["site"]["parcelle"]) ?? null,
  emprise: (row.emprise as ModeleAtelier["site"]["emprise"]) ?? null,
  hypotheses: row.hypotheses as ModeleAtelier["site"]["hypotheses"],
  sources: row.sources as ModeleAtelier["site"]["sources"],
  structure: (row.structure as ModeleAtelier["site"]["structure"]) ?? null,
});

/** `null` quand le projet n'a pas de modèle typé (pas de ligne `atelier_site`). */
export async function chargerModele(q: Querier, projectId: string): Promise<ModeleCharge | null> {
  const siteRow = (await q.select().from(atelierSite).where(eq(atelierSite.projectId, projectId)).limit(1))[0];
  if (!siteRow) return null;
  const [niveaux, objets, relations, definitions, calques, groupes, references, problemes] = await Promise.all([
    q.select().from(atelierNiveaux).where(eq(atelierNiveaux.projectId, projectId)),
    q.select().from(atelierObjets).where(eq(atelierObjets.projectId, projectId)),
    q.select().from(atelierRelations).where(eq(atelierRelations.projectId, projectId)),
    q.select().from(atelierDefinitions).where(eq(atelierDefinitions.projectId, projectId)),
    q.select().from(atelierCalques).where(eq(atelierCalques.projectId, projectId)),
    q.select().from(atelierGroupes).where(eq(atelierGroupes.projectId, projectId)),
    q.select().from(atelierReferences).where(eq(atelierReferences.projectId, projectId)),
    q.select().from(atelierProblemes).where(eq(atelierProblemes.projectId, projectId)),
  ]);
  const etat: ModeleAtelier = {
    ...modeleVide(),
    niveaux: Object.fromEntries(niveaux.map((n): [string, Niveau] => [n.id, { id: n.id, nom: n.nom, elevation: n.elevation, hauteur: n.hauteur, ordre: n.ordre }])),
    objets: Object.fromEntries(
      objets.map((o): [string, OccurrenceQuelconque] => [
        o.id,
        { id: o.id, classe: o.classe, niveauId: o.niveauId, definitionId: o.definitionId, calqueId: o.calqueId, groupeId: o.groupeId, phase: o.phase, params: o.params, proprietes: o.proprietes, ...(o.verrouille ? { verrouille: true } : {}) } as unknown as OccurrenceQuelconque,
      ]),
    ),
    relations: Object.fromEntries(relations.map((r): [string, Relation] => [r.id, { id: r.id, kind: r.kind as Relation["kind"], sourceId: r.sourceId, targetId: r.targetId, params: r.params }])),
    definitions: Object.fromEntries(definitions.map((d): [string, Definition] => [d.id, { id: d.id, classe: d.classe as Definition["classe"], nom: d.nom, params: d.params, version: d.version }])),
    calques: Object.fromEntries(calques.map((c): [string, Calque] => [c.id, { id: c.id, nom: c.nom, couleur: c.couleur, remplissage: c.remplissage, visible: c.visible, verrouille: c.verrouille, ordre: c.ordre, ...(c.parentId ? { parentId: c.parentId } : {}), ...(c.gele ? { gele: true } : {}), ...(c.proprietes && Object.keys(c.proprietes).length ? { proprietes: c.proprietes as NonNullable<Calque["proprietes"]> } : {}) }])),
    groupes: Object.fromEntries(groupes.map((g): [string, Groupe] => [g.id, { id: g.id, nom: g.nom, ...(g.verrouille ? { verrouille: true as const } : {}), ...(g.proprietes && Object.keys(g.proprietes).length ? { proprietes: g.proprietes as NonNullable<Groupe["proprietes"]> } : {}) }])),
    references: Object.fromEntries(references.map((r): [string, Reference] => [r.id, { id: r.id, proprietaireId: r.proprietaireId, objetId: r.objetId, caracteristique: r.caracteristique, etat: r.etat as Reference["etat"], propositions: r.propositions as Reference["propositions"] }])),
    problemes: Object.fromEntries(problemes.map((p): [string, Probleme] => [p.id, { id: p.id, type: p.type as Probleme["type"], objetId: p.objetId, message: p.message }])),
    site: site(siteRow),
    proprietes: siteRow.proprietes as ModeleAtelier["proprietes"],
  };
  return { etat, nativeId: siteRow.nativeId };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ligneObjet = (projectId: string, o: OccurrenceQuelconque, modelRevision: number) => ({
  projectId,
  id: o.id,
  classe: o.classe,
  niveauId: o.niveauId,
  definitionId: o.definitionId,
  calqueId: o.calqueId,
  groupeId: o.groupeId,
  phase: o.phase,
  params: o.params as unknown as Record<string, unknown>,
  proprietes: o.proprietes as unknown as Record<string, unknown>,
  modelRevision,
  verrouille: o.verrouille === true,
});

/** Remplace tout le modèle typé d'un projet (import) ; `modelRevision` est estampillée sur les objets. */
export async function remplacerModele(tx: Tx, projectId: string, etat: ModeleAtelier, nativeId: string, modelRevision: number): Promise<void> {
  for (const table of [atelierNiveaux, atelierObjets, atelierRelations, atelierDefinitions, atelierCalques, atelierGroupes, atelierReferences, atelierProblemes]) {
    await tx.delete(table).where(eq(table.projectId, projectId));
  }
  await tx.delete(atelierSite).where(eq(atelierSite.projectId, projectId));
  await tx.insert(atelierSite).values({
    projectId,
    parcelle: etat.site.parcelle as unknown as Record<string, unknown> | null,
    emprise: etat.site.emprise as unknown as Record<string, unknown> | null,
    hypotheses: etat.site.hypotheses,
    sources: etat.site.sources,
    structure: etat.site.structure,
    proprietes: etat.proprietes as unknown as Record<string, unknown>,
    nativeId,
    updatedAt: new Date(),
  });
  const lots = <T>(rows: T[], n = 500): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
    return out;
  };
  const niveaux = Object.values(etat.niveaux).map((n) => ({ projectId, id: n.id, nom: n.nom, elevation: n.elevation, hauteur: n.hauteur, ordre: n.ordre }));
  for (const lot of lots(niveaux)) await tx.insert(atelierNiveaux).values(lot);
  for (const lot of lots(Object.values(etat.objets).map((o) => ligneObjet(projectId, o, modelRevision)))) await tx.insert(atelierObjets).values(lot);
  for (const lot of lots(Object.values(etat.relations).map((r) => ({ projectId, id: r.id, kind: r.kind, sourceId: r.sourceId, targetId: r.targetId, params: r.params })))) await tx.insert(atelierRelations).values(lot);
  for (const lot of lots(Object.values(etat.definitions).map((d) => ({ projectId, id: d.id, classe: d.classe, nom: d.nom, params: d.params, version: d.version })))) await tx.insert(atelierDefinitions).values(lot);
  for (const lot of lots(Object.values(etat.calques).map((c) => ({ projectId, id: c.id, nom: c.nom, couleur: c.couleur, remplissage: c.remplissage, visible: c.visible, verrouille: c.verrouille, ordre: c.ordre, parentId: c.parentId ?? null, gele: !!c.gele, proprietes: c.proprietes ?? null })))) await tx.insert(atelierCalques).values(lot);
  for (const lot of lots(Object.values(etat.groupes).map((g) => ({ projectId, id: g.id, nom: g.nom, verrouille: g.verrouille === true, proprietes: g.proprietes ?? null })))) await tx.insert(atelierGroupes).values(lot);
  for (const lot of lots(Object.values(etat.references).map((r) => ({ projectId, id: r.id, proprietaireId: r.proprietaireId, objetId: r.objetId, caracteristique: r.caracteristique, etat: r.etat, propositions: r.propositions })))) await tx.insert(atelierReferences).values(lot);
  for (const lot of lots(Object.values(etat.problemes).map((p) => ({ projectId, id: p.id, type: p.type, objetId: p.objetId, message: p.message })))) await tx.insert(atelierProblemes).values(lot);
}

/** Écrit en base la différence entre deux états : upsert des entrées modifiées ou créées, suppression des retirées. */
export async function persisterDifferentiel(tx: Tx, projectId: string, avant: ModeleAtelier, apres: ModeleAtelier, modelRevision: number): Promise<void> {
  const diff = differentiel(avant, apres);
  const touchees = (cle: keyof typeof diff.avant): string[] => [...new Set([...Object.keys(diff.avant[cle] ?? {}), ...(diff.crees[cle] ?? [])])];
  const sync = async <T extends { id: string }>(cle: keyof typeof diff.avant, table: typeof atelierNiveaux | typeof atelierObjets | typeof atelierRelations | typeof atelierDefinitions | typeof atelierCalques | typeof atelierGroupes | typeof atelierReferences | typeof atelierProblemes, apresTable: Record<string, T>, ligne: (v: T) => Record<string, unknown>) => {
    const ids = touchees(cle);
    if (ids.length === 0) return;
    const aSupprimer = ids.filter((id) => !apresTable[id]);
    const aEcrire = ids.filter((id) => apresTable[id]).map((id) => ligne(apresTable[id]!));
    if (aSupprimer.length) await tx.delete(table).where(and(eq(table.projectId, projectId), inArray(table.id, aSupprimer)));
    for (const row of aEcrire) {
      const { projectId: _p, id: _i, ...set } = row as { projectId: string; id: string } & Record<string, unknown>;
      void _p;
      void _i;
      await tx
        .insert(table)
        .values(row as never)
        .onConflictDoUpdate({ target: [table.projectId, table.id], set: set as never });
    }
  };
  await sync("niveaux", atelierNiveaux, apres.niveaux, (n) => ({ projectId, id: n.id, nom: n.nom, elevation: n.elevation, hauteur: n.hauteur, ordre: n.ordre }));
  await sync("objets", atelierObjets, apres.objets, (o) => ligneObjet(projectId, o, modelRevision));
  await sync("relations", atelierRelations, apres.relations, (r) => ({ projectId, id: r.id, kind: r.kind, sourceId: r.sourceId, targetId: r.targetId, params: r.params }));
  await sync("definitions", atelierDefinitions, apres.definitions, (d) => ({ projectId, id: d.id, classe: d.classe, nom: d.nom, params: d.params, version: d.version }));
  await sync("calques", atelierCalques, apres.calques, (c) => ({ projectId, id: c.id, nom: c.nom, couleur: c.couleur, remplissage: c.remplissage, visible: c.visible, verrouille: c.verrouille, ordre: c.ordre, parentId: c.parentId ?? null, gele: !!c.gele, proprietes: c.proprietes ?? null }));
  await sync("groupes", atelierGroupes, apres.groupes, (g) => ({ projectId, id: g.id, nom: g.nom, verrouille: g.verrouille === true, proprietes: g.proprietes ?? null }));
  await sync("references", atelierReferences, apres.references, (r) => ({ projectId, id: r.id, proprietaireId: r.proprietaireId, objetId: r.objetId, caracteristique: r.caracteristique, etat: r.etat, propositions: r.propositions }));
  await sync("problemes", atelierProblemes, apres.problemes, (p) => ({ projectId, id: p.id, type: p.type, objetId: p.objetId, message: p.message }));
  if (diff.site || diff.proprietes) {
    await tx
      .update(atelierSite)
      .set({
        parcelle: apres.site.parcelle as unknown as Record<string, unknown> | null,
        emprise: apres.site.emprise as unknown as Record<string, unknown> | null,
        hypotheses: apres.site.hypotheses,
        sources: apres.site.sources,
        structure: apres.site.structure,
        proprietes: apres.proprietes as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(atelierSite.projectId, projectId));
  } else {
    await tx.update(atelierSite).set({ updatedAt: new Date() }).where(eq(atelierSite.projectId, projectId));
  }
}

/** Crée un modèle typé vide pour un projet qui n'en a pas (rien n'est inventé : aucun niveau, aucun calque). */
export async function creerModeleVide(tx: Tx, projectId: string, nativeId: string): Promise<ModeleCharge> {
  await tx.insert(atelierSite).values({ projectId, parcelle: null, emprise: null, hypotheses: [], sources: [], structure: null, proprietes: {}, nativeId, updatedAt: new Date() }).onConflictDoNothing();
  return { etat: modeleVide(), nativeId };
}
