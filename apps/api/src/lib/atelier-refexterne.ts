/**
 * Références externes (DA-05-11), côté serveur : ce que le modèle ne peut pas savoir seul.
 *
 * - `controlerRattachements` : avant qu'un lot contenant `refexterne.rattacher` soit appliqué, vérifie que l'auteur
 *   lit le projet source (sinon 404, un projet inaccessible est inconnu), que la publication épinglée existe dans ce
 *   projet avec la révision et l'empreinte annoncées, que le niveau source existe dans la version publiée, et
 *   qu'aucune chaîne de références (publications épinglées, de proche en proche) ne revient au projet (409
 *   « référence circulaire »).
 * - `etatReferences` : pour chaque référence du modèle, son état (à jour, publication plus récente, inaccessible)
 *   et sa représentation en traits dans le repère du projet, calculée depuis l'instantané publié épinglé.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  REFERENCE_EXTERNE,
  representationReferenceExterne,
  type Commande,
  type ModeleAtelier,
  type ParamsReferenceExterne,
} from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { atelierPublications, atelierVersions } from "../db/schema.js";
import { loadProjectAccess } from "./owned-project.js";

type Lecteur = Pick<typeof db, "select">;

export interface RefusReference {
  status: number;
  reponse: Record<string, unknown>;
}

const conflit = (motif: string, message: string, chemin = "params"): RefusReference => ({ status: 409, reponse: { erreur: "conflit", motif, message, conflits: [{ chemin, motif: message }] } });

async function publicationAvecModele(lecteur: Lecteur, projetId: string, publicationId: string) {
  const pub = (await lecteur.select().from(atelierPublications).where(and(eq(atelierPublications.projectId, projetId), eq(atelierPublications.id, publicationId))).limit(1))[0];
  if (!pub) return null;
  const v = (await lecteur.select({ modele: atelierVersions.modele }).from(atelierVersions).where(eq(atelierVersions.id, pub.versionId)).limit(1))[0];
  return v ? { pub, modele: v.modele as unknown as ModeleAtelier } : null;
}

const refsDe = (etat: ModeleAtelier) =>
  Object.values(etat.definitions)
    .filter((d) => d.classe === REFERENCE_EXTERNE)
    .map((d) => ({ id: d.id, nom: d.nom, version: d.version, params: d.params as unknown as ParamsReferenceExterne }));

/** Vrai si, en suivant les publications épinglées depuis `depart`, on revient à `projetId` (profondeur ≤ 16). */
async function chaineRevientA(lecteur: Lecteur, projetId: string, depart: ModeleAtelier): Promise<boolean> {
  const vus = new Set<string>();
  let frontiere = refsDe(depart).map((r) => r.params);
  for (let profondeur = 0; profondeur < 16 && frontiere.length; profondeur++) {
    const suivante: ParamsReferenceExterne[] = [];
    for (const p of frontiere) {
      if (p.projetSourceId === projetId) return true;
      const cle = `${p.projetSourceId}|${p.publicationId}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      const s = await publicationAvecModele(lecteur, p.projetSourceId, p.publicationId);
      if (s) suivante.push(...refsDe(s.modele).map((r) => r.params));
    }
    frontiere = suivante;
  }
  return false;
}

export async function controlerRattachements(lecteur: Lecteur, projetId: string, auteurId: string, commandes: readonly Commande[]): Promise<RefusReference | null> {
  for (const c of commandes) {
    if (c.type !== "refexterne.rattacher") continue;
    const p = c.params as Partial<ParamsReferenceExterne>;
    // Une mise à jour partielle (sans source) reprend la source déjà épinglée : le modèle refuse tout changement de source.
    if (typeof p.projetSourceId !== "string" || typeof p.publicationId !== "string") return { status: 400, reponse: { erreur: "invalide", details: [{ chemin: "params", message: "projetSourceId et publicationId requis" }] } };
    if (p.projetSourceId === projetId) return conflit("reference-circulaire", "Un projet ne peut pas se référencer lui-même.", "projetSourceId");
    const source = await loadProjectAccess(p.projetSourceId, auteurId);
    if (!source) return { status: 404, reponse: { erreur: "source-inconnue", message: "Projet source inconnu." } };
    const s = await publicationAvecModele(lecteur, source.id, p.publicationId);
    if (!s) return { status: 404, reponse: { erreur: "publication-inconnue", message: "Publication source inconnue." } };
    if (p.revisionSource !== s.pub.revision || p.empreinteSource !== s.pub.empreinte) return conflit("publication-differente", "La révision ou l'empreinte annoncées ne correspondent pas à la publication.", "empreinteSource");
    if (typeof p.niveauSourceId !== "string" || !s.modele.niveaux[p.niveauSourceId]) return conflit("niveau-source-inconnu", "Ce niveau n'existe pas dans la publication source.", "niveauSourceId");
    if (await chaineRevientA(lecteur, projetId, s.modele)) return conflit("reference-circulaire", "Cette publication référence déjà ce projet (directement ou par une chaîne) : référence circulaire refusée.", "projetSourceId");
  }
  return null;
}

export interface EtatReference {
  id: string;
  nom: string;
  params: ParamsReferenceExterne;
  etat: "a-jour" | "plus-recente" | "inaccessible";
  source: { nom: string } | null;
  derniere: { id: string; nom: string; revision: number; empreinte: string; createdAt: string } | null;
  representation: ReturnType<typeof representationReferenceExterne> | null;
}

export async function etatReferences(auteurId: string, etat: ModeleAtelier, avecTraits: boolean): Promise<EtatReference[]> {
  const refs = refsDe(etat);
  const sortie: EtatReference[] = [];
  for (const r of refs) {
    const source = await loadProjectAccess(r.params.projetSourceId, auteurId);
    const epinglee = source ? await publicationAvecModele(db, source.id, r.params.publicationId) : null;
    if (!source || !epinglee) {
      sortie.push({ id: r.id, nom: r.nom, params: r.params, etat: "inaccessible", source: null, derniere: null, representation: null });
      continue;
    }
    const derniere = (await db.select().from(atelierPublications).where(eq(atelierPublications.projectId, source.id)).orderBy(desc(atelierPublications.revision), desc(atelierPublications.createdAt)).limit(1))[0]!;
    sortie.push({
      id: r.id,
      nom: r.nom,
      params: r.params,
      etat: derniere.revision > r.params.revisionSource ? "plus-recente" : "a-jour",
      source: { nom: source.name },
      derniere: { id: derniere.id, nom: derniere.nom, revision: derniere.revision, empreinte: derniere.empreinte, createdAt: derniere.createdAt.toISOString() },
      representation: avecTraits ? representationReferenceExterne(epinglee.modele, r.params) : null,
    });
  }
  return sortie;
}

export async function modelesPourMiseAJour(auteurId: string, p: ParamsReferenceExterne) {
  const source = await loadProjectAccess(p.projetSourceId, auteurId);
  if (!source) return null;
  const epinglee = await publicationAvecModele(db, source.id, p.publicationId);
  const derniere = (await db.select({ id: atelierPublications.id }).from(atelierPublications).where(eq(atelierPublications.projectId, source.id)).orderBy(desc(atelierPublications.revision), desc(atelierPublications.createdAt)).limit(1))[0];
  const neuve = derniere ? await publicationAvecModele(db, source.id, derniere.id) : null;
  return epinglee && neuve ? { epinglee, neuve } : null;
}
