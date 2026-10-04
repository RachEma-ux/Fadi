/**
 * Banc d'essai du module « documents » sans DOM ni bus (sur le modèle de `plan2d/__tests__/contexte-de-test.ts`) :
 * contexte dont `essayer` / `valider` appliquent le vrai réducteur (`appliquerLot`), registres où le module est
 * installé avec des effets d'export espions, pilote du socle.
 */
import { appliquerLot, CONTRAT_COMMANDES, etatVide, pointLocal, VERSION_ONTOLOGIE, type Commande, type EtatModele } from "@parcours/atelier-model";
import { creerEtatInterface, creerPilote, creerRegistres, creerSelection, erreurLisible, type Accrochage, type ContexteAtelier, type EvenementPlan, type Modificateurs, type ResultatValidation } from "../../socle";
import { installerAvec } from "../installer";
import type { EffetsExport, EnregistrementExport } from "../outils/exports";
import { DESSINATEUR_TEST } from "./repli-test";

export const P = pointLocal;
export const m = (value: number) => ({ value, unit: "m" as const });
export const cmd = (type: Commande["type"], params: unknown, cibles: readonly string[] = []): Commande => ({ type, params, cibles }) as unknown as Commande;

const AUCUN: Accrochage = { type: "aucun", libelle: "" };
const SANS: Modificateurs = { maj: false, ctrl: false, alt: false };

export function lot(etat: EtatModele, commands: readonly Commande[]) {
  return appliquerLot(etat, { contract: CONTRAT_COMMANDES, requestId: `t-${Math.random()}`, label: "Test", baseRevision: etat.revision, commands });
}

/** Projet de test : niveaux `rdc` (et `r1`), calques `C1` « Cotations », `C2` « Murs & cloisons », plus les commandes. */
export function etatDeTest(...commandes: Commande[]): EtatModele {
  const r = lot(etatVide("p", VERSION_ONTOLOGIE), [
    cmd("niveau.creer", { id: "rdc", nom: "Rez", elevation: m(0), hauteur: m(3), ordre: 0 }),
    cmd("niveau.creer", { id: "r1", nom: "Étage 1", elevation: m(3), hauteur: m(3), ordre: 1 }),
    cmd("calque.creer", { id: "C1", nom: "Cotations", couleur: "#336699", visible: true, verrouille: false, ordre: 0 }),
    cmd("calque.creer", { id: "C2", nom: "Murs & cloisons", couleur: "#aa0000", visible: true, verrouille: false, ordre: 1 }),
    ...commandes,
  ]);
  if (!r.ok) throw new Error(`état de test refusé : ${JSON.stringify(r.erreurs, null, 1)}`);
  return r.etat;
}

export interface EffetsEspions extends EffetsExport {
  readonly telecharges: { nom: string; contenu: Blob }[];
  readonly enregistres: EnregistrementExport[];
  readonly impressions: string[];
}

export function effetsEspions(): EffetsEspions {
  const telecharges: { nom: string; contenu: Blob }[] = [];
  const enregistres: EnregistrementExport[] = [];
  const impressions: string[] = [];
  return {
    telecharges,
    enregistres,
    impressions,
    telecharger: (nom, contenu) => void telecharges.push({ nom, contenu }),
    rasteriser: async (_svg, l, h) => new Blob([`png ${l}x${h}`], { type: "image/png" }),
    imprimer: (html) => (impressions.push(html), true),
    enregistrer: async (_p, e) => void enregistres.push(e),
    maintenant: () => new Date("2026-10-04T12:00:00Z"),
  };
}

export function banc(etatInitial: EtatModele = etatDeTest(), options: { ecriture?: boolean } = {}) {
  let etat = etatInitial;
  let n = 0;
  const ecouteurs = new Set<() => void>();
  const valides: { label: string; commandes: readonly Commande[] }[] = [];
  const essais: (readonly Commande[])[] = [];
  const vue = creerEtatInterface({ niveauActifId: "rdc", calqueActifId: "C1" });
  const essayer = (commandes: readonly Commande[]): ResultatValidation => {
    essais.push(commandes);
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
    calquesMasques: () => vue.lire().calquesMasques,
    selection: creerSelection(),
    ecriture: options.ecriture === false ? { permise: false, motif: "lecture seule" } : { permise: true },
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
  const effets = effetsEspions();
  const registres = creerRegistres();
  installerAvec({ effets })(registres);
  registres.dessinateurs.enregistrer(DESSINATEUR_TEST);
  const pilote = creerPilote(registres.outils, ctx, vue);
  return {
    ctx,
    registres,
    pilote,
    vue,
    valides,
    essais,
    effets,
    etat: () => etat,
    async jouer(...evts: EvenementPlan[]) {
      for (const e of evts) await pilote.traiter(e);
    },
  };
}

export const appui = (x: number, y: number): EvenementPlan => ({ type: "appui", point: P(x, y), accrochage: AUCUN, modificateurs: SANS, objetSousPointeur: null });
export const survol = (x: number, y: number): EvenementPlan => ({ type: "survol", point: P(x, y), accrochage: AUCUN, modificateurs: SANS, objetSousPointeur: null });
export const saisie = (champ: string, valeur: number): EvenementPlan => ({ type: "saisie", champ, valeur });
export const texte = (t: string): EvenementPlan => ({ type: "saisie-texte", champ: "texte", texte: t });
export const touche = (t: string): EvenementPlan => ({ type: "touche", touche: t, modificateurs: SANS });

export function dernier(etat: EtatModele, classe: string) {
  return Object.values(etat.objets).filter((x) => x.classe === classe).at(-1);
}
