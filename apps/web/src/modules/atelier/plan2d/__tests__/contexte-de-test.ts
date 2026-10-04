/**
 * Banc d'essai de `plan2d` sans DOM ni bus : un `ContexteAtelier` dont `essayer` et `valider` appliquent le vrai
 * réducteur (`appliquerLot`) sur un état local, des registres où `installer` a tout enregistré, un pilote.
 */
import { appliquerLot, CONTRAT_COMMANDES, etatVide, pointLocal, VERSION_ONTOLOGIE, type Commande, type EtatModele } from "@parcours/atelier-model";
import { creerEtatInterface, creerPilote, creerRegistres, creerSelection, erreurLisible, type Accrochage, type ContexteAtelier, type EvenementPlan, type Modificateurs, type ResultatValidation } from "../../socle";
import { installer } from "../installer";
import { DESSINATEUR_REPLI } from "../repli";

export const P = pointLocal;
export const m = (value: number) => ({ value, unit: "m" as const });
export const deg = (value: number) => ({ value, unit: "°" as const });

const AUCUN: Accrochage = { type: "aucun", libelle: "" };
export const SANS: Modificateurs = { maj: false, ctrl: false, alt: false };

export const cmd = (type: Commande["type"], params: unknown, cibles: readonly string[] = []): Commande => ({ type, params, cibles }) as unknown as Commande;

function lot(etat: EtatModele, commands: readonly Commande[]) {
  return appliquerLot(etat, { contract: CONTRAT_COMMANDES, requestId: `t-${Math.random()}`, label: "Test", baseRevision: etat.revision, commands });
}

/** Projet de test : niveau `rdc`, calque `C1` (et `CV` verrouillé), plus les commandes données. */
export function etatDeTest(...commandes: Commande[]): EtatModele {
  const r = lot(etatVide("p", VERSION_ONTOLOGIE), [
    cmd("niveau.creer", { id: "rdc", nom: "Rez", elevation: m(0), hauteur: m(3), ordre: 0 }),
    cmd("calque.creer", { id: "C1", nom: "Esquisse", couleur: "#336699", visible: true, verrouille: false, ordre: 0 }),
    cmd("calque.creer", { id: "CV", nom: "Verrouillé", couleur: "#999999", visible: true, verrouille: true, ordre: 1 }),
    ...commandes,
  ]);
  if (!r.ok) throw new Error(`état de test refusé : ${JSON.stringify(r.erreurs, null, 1)}`);
  return r.etat;
}

export interface Banc {
  readonly ctx: ContexteAtelier;
  readonly registres: ReturnType<typeof creerRegistres>;
  readonly pilote: ReturnType<typeof creerPilote>;
  readonly vue: ReturnType<typeof creerEtatInterface>;
  /** Lots validés (label, commandes). */
  readonly valides: { label: string; commandes: readonly Commande[] }[];
  etat(): EtatModele;
  /** Envoie une suite d'évènements au pilote, dans l'ordre. */
  jouer(...e: EvenementPlan[]): Promise<void>;
}

export function banc(etatInitial: EtatModele = etatDeTest(), options: { repli?: boolean; calque?: string } = {}): Banc {
  let etat = etatInitial;
  let n = 0;
  const ecouteurs = new Set<() => void>();
  const valides: { label: string; commandes: readonly Commande[] }[] = [];
  const vue = creerEtatInterface({ niveauActifId: "rdc", calqueActifId: options.calque ?? "C1" });
  const selection = creerSelection();
  const essayer = (commandes: readonly Commande[]): ResultatValidation => {
    const r = lot(etat, commandes);
    return r.ok ? { ok: true, etat: r.etat } : { ok: false, erreurs: r.erreurs.map(erreurLisible) };
  };
  const ctx: ContexteAtelier = {
    projetId: "p",
    etat: () => etat,
    abonnerEtat: (e) => {
      ecouteurs.add(e);
      return () => ecouteurs.delete(e);
    },
    niveauActif: () => vue.lire().niveauActifId,
    calqueActif: () => vue.lire().calqueActifId,
    selection,
    ecriture: { permise: true },
    async valider(label, commandes) {
      const r = essayer(commandes);
      if (r.ok) {
        etat = r.etat;
        valides.push({ label, commandes });
        for (const e of [...ecouteurs]) e();
      }
      return r;
    },
    essayer,
    annuler: async () => ({ ok: false, erreurs: [] }),
    retablir: async () => ({ ok: false, erreurs: [] }),
    nouvelId: (prefixe) => `${prefixe}-${++n}`,
  };
  const registres = creerRegistres();
  installer(registres);
  if (options.repli) registres.dessinateurs.enregistrer(DESSINATEUR_REPLI);
  const pilote = creerPilote(registres.outils, ctx, vue);
  return {
    ctx,
    registres,
    pilote,
    vue,
    valides,
    etat: () => etat,
    async jouer(...evts) {
      for (const e of evts) await pilote.traiter(e);
    },
  };
}

/** Évènements de pointeur en mètres (déjà accrochés). */
export const appui = (x: number, y: number, mods: Partial<Modificateurs> = {}, objet: string | null = null): EvenementPlan => ({ type: "appui", point: P(x, y), accrochage: AUCUN, modificateurs: { ...SANS, ...mods }, objetSousPointeur: objet });
export const survol = (x: number, y: number, mods: Partial<Modificateurs> = {}, objet: string | null = null): EvenementPlan => ({ type: "survol", point: P(x, y), accrochage: AUCUN, modificateurs: { ...SANS, ...mods }, objetSousPointeur: objet });
export const glisse = (x: number, y: number): EvenementPlan => ({ type: "glisse", point: P(x, y), accrochage: AUCUN, modificateurs: SANS, objetSousPointeur: null });
export const relache = (x: number, y: number, mods: Partial<Modificateurs> = {}): EvenementPlan => ({ type: "relache", point: P(x, y), accrochage: AUCUN, modificateurs: { ...SANS, ...mods }, objetSousPointeur: null });
export const saisie = (champ: string, valeur: number): EvenementPlan => ({ type: "saisie", champ, valeur });
export const touche = (t: string): EvenementPlan => ({ type: "touche", touche: t, modificateurs: SANS });

/** Dernier objet créé d'une classe. */
export function dernier(etat: EtatModele, classe: string) {
  const o = Object.values(etat.objets).filter((x) => x.classe === classe);
  return o.at(-1);
}
