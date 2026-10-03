/**
 * Serveur factice des tests du bus : même réducteur que l'API (`appliquerLot`), règle stricte de révision
 * (D-015, 409 détaillé), idempotence par `requestId` (réponse enregistrée renvoyée, T06), journal.
 * Pannes simulables : coupure, réponse perdue après validation, refus forcé.
 */
import { appliquerLot, etatVide, longueur, pointLocal, VERSION_ONTOLOGIE, type Commande, type EnveloppeCommandes, type EtatModele } from "@parcours/atelier-model";
import type { EntreeJournal, ResultatEcriture } from "../../../../lib/api/atelier-commandes";
import type { TransportAtelier } from "../bus";

export const P = pointLocal;

export function cmd(type: string, params: unknown, cibles: readonly string[] = []): Commande {
  return { type, params, cibles } as unknown as Commande;
}

export const ligne = (id: string, x = 0): Commande => cmd("esquisse.ligne", { id, niveauId: "rdc", calqueId: "C1", a: P(x, 0), b: P(x + 1, 0) });
export const renommerCalque = (nom: string): Commande => cmd("calque.modifier", { modifications: { nom } }, ["C1"]);

/** Projet de départ : niveau `rdc`, calque `C1` (révision 1). */
export function projetInitial(): EtatModele {
  const vide = etatVide("p", VERSION_ONTOLOGIE);
  const r = appliquerLot(vide, {
    requestId: "init",
    baseRevision: 0,
    contract: "atelier-commands/1",
    label: "Initialisation",
    commands: [
      cmd("niveau.creer", { id: "rdc", nom: "Rez", elevation: longueur(0), hauteur: longueur(3), ordre: 0 }),
      cmd("calque.creer", { id: "C1", nom: "Esquisses", couleur: "#336699", visible: true, verrouille: false, ordre: 0 }),
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.etat;
}

export class ServeurFactice {
  etat: EtatModele = projetInitial();
  readonly envois: EnveloppeCommandes[] = [];
  readonly journal: EntreeJournal[] = [];
  private readonly reponses = new Map<string, ResultatEcriture>();
  /** Coupure : aucune requête n'aboutit. */
  coupure = false;
  /** Nombre de prochaines écritures validées dont la réponse se perd (coupure après validation). */
  reponsesPerdues = 0;
  /** Refus forcé (400) d'un lot dont le libellé correspond. */
  refuserLibelle: string | null = null;
  private compteur = 0;

  readonly transport: TransportAtelier = {
    lireModele: async () => {
      if (this.coupure) throw new TypeError("Failed to fetch");
      return structuredClone(this.etat);
    },
    lireJournal: async (_p, apres) => {
      if (this.coupure) throw new TypeError("Failed to fetch");
      return { revisionCourante: this.etat.revision, entrees: this.journal.filter((e) => e.revision > apres) };
    },
    envoyerCommandes: async (_p, env) => {
      this.envois.push(structuredClone(env));
      if (this.coupure) return { statut: "injoignable", message: "Failed to fetch" };
      const deja = this.reponses.get(env.requestId);
      if (deja) return deja;
      const r = this.appliquer(env);
      if (r.statut === "accepte" && this.reponsesPerdues > 0) {
        this.reponsesPerdues--;
        return { statut: "injoignable", message: "réponse perdue" };
      }
      return r;
    },
  };

  private appliquer(env: EnveloppeCommandes): ResultatEcriture {
    if (env.baseRevision !== this.etat.revision) {
      const ids = [...new Set(env.commands.flatMap((c) => [...c.cibles]))];
      return {
        statut: "conflit",
        http: 409,
        conflit: {
          erreur: "conflit",
          baseRevision: env.baseRevision,
          revisionCourante: this.etat.revision,
          conflits: ids.map((objetId) => ({ objetId, motif: "modifié depuis la révision de base", etatServeur: structuredClone(this.etat.objets[objetId] ?? null) })),
        },
      };
    }
    if (this.refuserLibelle !== null && env.label === this.refuserLibelle) {
      return { statut: "invalide", http: 400, message: "invalide", details: [{ chemin: "commands[0]", objet: "Lot", cause: "refus forcé", action: "corriger", message: "Lot : refus forcé. Action : corriger." }] };
    }
    const r = appliquerLot(this.etat, env);
    if (!r.ok) return { statut: "invalide", http: 400, message: "invalide", details: r.erreurs };
    this.etat = r.etat;
    const journalId = `j${++this.compteur}`;
    this.journal.push({
      journalId,
      requestId: env.requestId,
      revision: r.etat.revision,
      baseRevision: env.baseRevision,
      label: env.label,
      types: env.commands.map((c) => c.type),
      objetIds: [...r.effets.objetsCrees, ...r.effets.objetsModifies],
      inverseDe: null,
      creeLe: "2026-10-04T00:00:00.000Z",
    });
    const rep: ResultatEcriture = {
      statut: "accepte",
      reponse: { revision: r.etat.revision, applique: env.commands.map((c) => ({ type: c.type, objetIds: [] })), effets: { vues: r.effets.vues, documents: r.effets.documents, problemes: r.effets.problemes, propositions: r.effets.propositions, remplacements: r.effets.remplacements }, journalId },
    };
    this.reponses.set(env.requestId, rep);
    return rep;
  }

  /** Écriture d'un autre compte (révision distante). */
  autreCompte(label: string, commands: readonly Commande[]): void {
    const r = this.appliquer({ requestId: `autre-${++this.compteur}`, baseRevision: this.etat.revision, contract: "atelier-commands/1", label, commands });
    if (r.statut !== "accepte") throw new Error(`écriture distante refusée : ${JSON.stringify(r)}`);
  }
}
