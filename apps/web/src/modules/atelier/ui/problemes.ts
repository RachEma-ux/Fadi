/**
 * Panneau des modifications et problèmes (L3a.1, fiches DA-21-06, DA-17-16). Module pur.
 *
 * Sources (D-031 : `/problemes` ne produit encore que `reference` et `document`) :
 * - journal validé : `client.lireJournal` (serveur) ; lots locaux : `bus.entrees()` (en attente, envoyés, en
 *   conflit), affichés **au-dessus** des entrées validées ;
 * - problèmes : `client.lireProblemes`, groupés par catégorie ;
 * - conflits : le bus (`sourceConflits`), affichés par `ConflictPanel` ;
 * - réserves Harmonie : bilan du bâtiment (`api.getDesignReview` → `analysis.issues`), lecture seule, lien vers
 *   l'étape 10 ; un bilan périmé est annoncé comme tel (R11).
 */
import type { EntreeJournal, ProblemeAtelier } from "../../../lib/api/atelier-commandes";
import type { DesignReviewView } from "../../../lib/api/harmonie";
import type { EntreeFile } from "../bus";

export type EtatLigneJournal = "local" | "envoi" | "conflit" | "synchronise";

export const LIBELLES_ETAT_JOURNAL: Readonly<Record<EtatLigneJournal, string>> = {
  local: "local",
  envoi: "envoi en cours",
  conflit: "conflit",
  synchronise: "synchronisé",
};

export interface LigneJournal {
  readonly cle: string;
  /** « r+12 » pour une entrée validée, « — » pour un lot local. */
  readonly revision: string;
  readonly libelle: string;
  readonly types: readonly string[];
  readonly objetIds: readonly string[];
  readonly etat: EtatLigneJournal;
  readonly detail: string;
}

const date = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
};

/** Lots locaux (ordre de la file) puis entrées validées (plus récente d'abord). */
export function lignesJournal(locales: readonly EntreeFile[], validees: readonly EntreeJournal[], max = 50): LigneJournal[] {
  const lignes: LigneJournal[] = [...locales]
    .sort((a, b) => a.ordre - b.ordre)
    .map((e) => ({
      cle: `local:${e.requestId}`,
      revision: "—",
      libelle: e.enveloppe.label,
      types: [...new Set(e.enveloppe.commands.map((c) => c.type))],
      objetIds: [],
      etat: e.etat === "en-conflit" ? "conflit" : e.etat === "envoyee" ? "envoi" : "local",
      detail: [`fondé sur la révision ${e.enveloppe.baseRevision}`, e.tentatives > 0 ? `${e.tentatives} envoi(s)` : "", e.derniereErreur ?? ""].filter(Boolean).join(" · "),
    }));
  const tri = [...validees].sort((a, b) => b.revision - a.revision);
  for (const e of tri.slice(0, max)) {
    lignes.push({
      cle: `journal:${e.journalId}`,
      revision: `r${e.revision}`,
      libelle: e.label || e.types.join(", ") || "Modification",
      types: e.types,
      objetIds: e.objetIds,
      etat: "synchronise",
      detail: [e.inverseDe ? "annulation ou rétablissement" : "", e.auteur ? `par ${e.auteur}` : "", date(e.creeLe), e.objetIds.length ? `${e.objetIds.length} objet(s)` : ""].filter(Boolean).join(" · "),
    });
  }
  return lignes;
}

export const LIBELLES_CATEGORIE: Readonly<Record<string, string>> = {
  reference: "Références à réparer",
  document: "Documents à recalculer",
  conflit: "Conflits",
  harmonie: "Réserves Harmonie",
  autre: "Autres problèmes",
};

export interface GroupeProblemes {
  readonly categorie: string;
  readonly libelle: string;
  readonly problemes: readonly ProblemeAtelier[];
}

const ORDRE_GRAVITE: Readonly<Record<string, number>> = { erreur: 0, avertissement: 1, information: 2 };
const ORDRE_CATEGORIE = ["reference", "document", "conflit", "harmonie", "autre"];

export function groupesProblemes(problemes: readonly ProblemeAtelier[]): GroupeProblemes[] {
  const par = new Map<string, ProblemeAtelier[]>();
  for (const p of problemes) {
    const c = ORDRE_CATEGORIE.includes(p.categorie) ? p.categorie : "autre";
    const l = par.get(c) ?? [];
    l.push(p);
    par.set(c, l);
  }
  return ORDRE_CATEGORIE.filter((c) => par.has(c)).map((c) => ({
    categorie: c,
    libelle: LIBELLES_CATEGORIE[c] ?? c,
    problemes: (par.get(c) ?? []).sort((a, b) => (ORDRE_GRAVITE[a.gravite] ?? 3) - (ORDRE_GRAVITE[b.gravite] ?? 3)),
  }));
}

export interface ReserveHarmonie {
  readonly id: string;
  readonly titre: string;
  readonly priorite: string;
  readonly detail: string;
  readonly etape: number;
  readonly refs: readonly string[];
}

export interface ReservesHarmonie {
  readonly reserves: readonly ReserveHarmonie[];
  /** Le bilan a été calculé sur un modèle antérieur (R11 : affiché, jamais présenté comme actuel). */
  readonly perime: boolean;
  readonly calculeLe: string;
}

export function reservesHarmonie(vue: Pick<DesignReviewView, "analysis"> | null | undefined): ReservesHarmonie {
  const a = vue?.analysis;
  if (!a) return { reserves: [], perime: false, calculeLe: "" };
  return {
    reserves: (a.issues ?? []).map((i) => ({ id: i.id, titre: i.title, priorite: i.priority, detail: i.body, etape: i.step, refs: i.refs ?? [] })),
    perime: a.stale === true,
    calculeLe: date(a.generatedAt),
  };
}

export interface ResumePanneau {
  readonly harmonie: number;
  readonly references: number;
  readonly documents: number;
  readonly autres: number;
  readonly conflits: number;
  readonly enAttente: number;
}

export function resumePanneau(problemes: readonly ProblemeAtelier[], reserves: number, conflits: number, enAttente: number): ResumePanneau {
  const n = (c: string) => problemes.filter((p) => p.categorie === c).length;
  return {
    harmonie: reserves + n("harmonie"),
    references: n("reference"),
    documents: n("document"),
    autres: problemes.length - n("reference") - n("document") - n("harmonie") - n("conflit"),
    conflits: conflits + n("conflit"),
    enAttente,
  };
}
