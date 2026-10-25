/**
 * Séparation des responsabilités — auto-contrôle (lot OP-AUTOCONTROLE, décision OP-6 du 2026-10-25). Règle pure :
 * aucune base, aucun DOM ; les données sont relues par `auto-controle-db.ts`, sous la transaction de l'approbation.
 *
 * Une approbation est un **auto-contrôle** quand l'approbateur a produit le dossier qu'il approuve :
 *   - il est l'auteur d'au moins une révision du **périmètre** du dossier ;
 *   - ou il a soumis le dossier (auteur du dernier évènement `soumettre` du journal de la publication).
 *
 * Périmètre : pour chaque source du manifeste (variante principale et variantes coordonnées), les révisions remontées
 * par `parent_revision_id` depuis la révision figée, jusqu'à une révision déjà approuvée (exclue) ou jusqu'à la racine.
 * Les révisions techniques d'initialisation (`study-initialization`, `variant-initialization`) sont parcourues mais pas
 * comptées : le code les crée avec un document vide (`newStudioDocument`, `studio-commands.ts`) — leur auteur n'a rien
 * produit. Une dérivation (`variant-derivation`) est comptée : son auteur a choisi de recopier un contenu dans le dossier.
 *
 * Décision (OP-6) : rien n'est bloqué par défaut. L'option du compte « Auto-contrôle » (`users.self_control_allowed`,
 * TRUE par défaut) autorise l'approbation, alors marquée ; désactivée, l'approbation d'un dossier produit est refusée.
 * Aucun seuil : une seule révision suffit à signaler. Le diffuseur n'est pas concerné (seule l'approbation l'est).
 */

export type SourceRevision = "authenticated-session" | "study-initialization" | "variant-initialization" | "variant-derivation";

export interface RevisionAuteur {
  id: string;
  parentRevisionId: string | null;
  authorId: string;
  source: SourceRevision | string;
}

/** Sources techniques à document vide, jamais comptées comme une production. */
export const SOURCES_TECHNIQUES: ReadonlySet<string> = new Set(["study-initialization", "variant-initialization"]);

export const estProduction = (r: Pick<RevisionAuteur, "source">): boolean => !SOURCES_TECHNIQUES.has(r.source);

/**
 * Révisions du périmètre, dans l'ordre de la remontée (révision figée d'abord), sans doublon. Une révision absente de
 * `revisions` arrête la remontée de sa branche (rien n'est inventé) ; une boucle éventuelle est coupée.
 */
export function perimetreRevisions(revisions: ReadonlyMap<string, RevisionAuteur>, departs: readonly string[], approuvees: ReadonlySet<string>): RevisionAuteur[] {
  const vues = new Set<string>();
  const out: RevisionAuteur[] = [];
  for (const depart of departs) {
    let id: string | null = depart;
    while (id !== null && !vues.has(id) && !approuvees.has(id)) {
      vues.add(id);
      const r = revisions.get(id);
      if (!r) break;
      out.push(r);
      id = r.parentRevisionId;
    }
  }
  return out;
}

export interface EntreeAutoControle {
  approbateurId: string;
  /** Révisions du périmètre (`perimetreRevisions`). */
  perimetre: readonly RevisionAuteur[];
  /** Auteur du dernier évènement `soumettre` de la publication, s'il y en a un. */
  dernierSoumetteurId: string | null;
  /** Option « Auto-contrôle » du compte de l'approbateur (TRUE par défaut). */
  autoControleAutorise: boolean;
}

export interface ResultatAutoControle {
  autoControle: boolean;
  /** Révisions du périmètre dont l'approbateur est l'auteur (initialisations vides exclues). */
  revisionsAuteur: number;
  soumisParLui: boolean;
  decision: "autorise" | "refuse";
}

export function evaluerAutoControle(e: EntreeAutoControle): ResultatAutoControle {
  const revisionsAuteur = e.perimetre.filter((r) => r.authorId === e.approbateurId && estProduction(r)).length;
  const soumisParLui = e.dernierSoumetteurId !== null && e.dernierSoumetteurId === e.approbateurId;
  const autoControle = revisionsAuteur > 0 || soumisParLui;
  return { autoControle, revisionsAuteur, soumisParLui, decision: autoControle && !e.autoControleAutorise ? "refuse" : "autorise" };
}

/** Message du refus 422 `self_approval_forbidden` (français, traduit à l'affichage par l'interface). */
export function messageRefusAutoControle(r: Pick<ResultatAutoControle, "revisionsAuteur" | "soumisParLui">): string {
  const motifs = [
    r.revisionsAuteur > 0 ? `vous avez produit ${r.revisionsAuteur} révision(s) de ce dossier` : null,
    r.soumisParLui ? "vous l'avez soumis" : null,
  ].filter((m): m is string => m !== null);
  return `Approbation refusée : ${motifs.join(" et ")}, et l'auto-contrôle n'est pas autorisé pour votre compte. Demandez à un autre approbateur du projet.`;
}
