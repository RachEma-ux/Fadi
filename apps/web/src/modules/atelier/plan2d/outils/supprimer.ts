/**
 * Outil « Supprimer » (famille Modifier, L3b.0, D-045) : la sélection devient un lot de commandes `*.supprimer`,
 * une par commande de suppression du contrat (`mur.supprimer`, `ouverture.supprimer`, `esquisse.supprimer`…).
 *
 * Avant l'accord, l'aperçu surligne les objets et liste les conséquences : baies hébergées qui partent avec leur
 * mur (le réducteur les retire), cotations et étiquettes dont la référence deviendra « à réparer ». Entrée ou un
 * appui dans la zone de plan donnent l'accord ; Échap renonce sans rien écrire. La touche Suppr, hors outil actif
 * et sélection non vide, ouvre cet outil (`ui/AtelierInterface.tsx`).
 *
 * Non couverts (commande avec destination ou dissolution, hors de ce geste) : niveaux, calques, groupes — ils sont
 * listés comme ignorés.
 */
import { CLASSES_BAIE, type Commande, type EtatModele, type IdObjet, type ObjetModele } from "@parcours/atelier-model";
import type { ContexteAtelier, DefinitionOutil, ErreurLisible, EvenementPlan, FormeApercu, ReactionOutil, SessionOutil } from "../../socle";
import { libelleClasse } from "../../ui/navigateur";
import { activationSelection, commande, controler, definir, lisible } from "./commun";

/** Commande de suppression par classe (même table que les inverses du modèle, `commandes/inverses.ts`). */
export const SUPPRESSION_PAR_CLASSE: Readonly<Record<string, Commande["type"]>> = {
  mur: "mur.supprimer",
  porte: "ouverture.supprimer",
  fenetre: "ouverture.supprimer",
  ouverture: "ouverture.supprimer",
  dalle: "dalle.supprimer",
  toiture: "toiture.supprimer",
  escalier: "escalier.supprimer",
  piece: "piece.supprimer",
  espace: "espace.supprimer",
  zone: "zone.supprimer",
  poteau: "poteau.supprimer",
  solide: "solide.supprimer",
  "esquisse.ligne": "esquisse.supprimer",
  "esquisse.polyligne": "esquisse.supprimer",
  "esquisse.arc": "esquisse.supprimer",
  "esquisse.cercle": "esquisse.supprimer",
  "esquisse.rectangle": "esquisse.supprimer",
  "esquisse.polygone": "esquisse.supprimer",
  "esquisse.spline": "esquisse.supprimer",
  "esquisse.construction": "esquisse.supprimer",
  "esquisse.hachure": "esquisse.supprimer",
  cotation: "cotation.supprimer",
  texte: "texte.supprimer",
  etiquette: "etiquette.supprimer",
};

/** Ordre des commandes : annotations d'abord (pas de référence « à réparer » vers un objet supprimé avec elles), puis baies, puis le reste. */
const RANG: Readonly<Partial<Record<Commande["type"], number>>> = { "cotation.supprimer": 0, "texte.supprimer": 0, "etiquette.supprimer": 0, "ouverture.supprimer": 1 };

const estBaie = (o: ObjetModele | undefined): boolean => o !== undefined && (CLASSES_BAIE as readonly string[]).includes(o.classe);
const hote = (o: ObjetModele): string | undefined => (o.params as { murHoteId?: string }).murHoteId;
export const nom = (o: ObjetModele): string => `${libelleClasse(o.classe)} ${o.id}`;

/** Ce que la suppression de la sélection écrira et entraînera. */
export interface PlanSuppression {
  readonly commandes: readonly Commande[];
  /** Objets supprimés à la demande (cibles des commandes). */
  readonly cibles: readonly IdObjet[];
  /** Baies non sélectionnées, hébergées par un mur supprimé : elles partent avec lui. */
  readonly baiesEntrainees: readonly IdObjet[];
  /** Cotations et étiquettes conservées dont une référence vise un objet supprimé : elles seront « à réparer ». */
  readonly aReparer: readonly IdObjet[];
  /** Objets sélectionnés sans commande de suppression dans ce geste (niveau, calque, groupe, inconnu). */
  readonly ignores: readonly IdObjet[];
}

export function planSuppression(etat: EtatModele, ids: readonly IdObjet[]): PlanSuppression {
  const objets = ids.map((id) => etat.objets[id]).filter((o): o is ObjetModele => o !== undefined);
  const ignores = objets.filter((o) => !SUPPRESSION_PAR_CLASSE[o.classe]).map((o) => o.id);
  const retenus = objets.filter((o) => SUPPRESSION_PAR_CLASSE[o.classe]);
  const murs = new Set(retenus.filter((o) => o.classe === "mur").map((o) => o.id));
  // Une baie sélectionnée dont le mur est aussi supprimé part avec lui : la cibler deux fois ferait refuser le lot.
  const cibles = retenus.filter((o) => !(estBaie(o) && murs.has(hote(o) ?? "")));
  const parType = new Map<Commande["type"], IdObjet[]>();
  for (const o of cibles) {
    const t = SUPPRESSION_PAR_CLASSE[o.classe] as Commande["type"];
    parType.set(t, [...(parType.get(t) ?? []), o.id]);
  }
  const commandes = [...parType.entries()].sort(([a], [b]) => (RANG[a] ?? 2) - (RANG[b] ?? 2)).map(([t, c]) => commande(t, {}, c));
  const partent = new Set(retenus.map((o) => o.id));
  const baiesEntrainees: IdObjet[] = [];
  for (const o of Object.values(etat.objets)) if (estBaie(o) && murs.has(hote(o) ?? "") && !partent.has(o.id)) baiesEntrainees.push(o.id);
  for (const id of baiesEntrainees) partent.add(id);
  const aReparer: IdObjet[] = [];
  for (const o of Object.values(etat.objets)) {
    if (partent.has(o.id)) continue;
    const p = o.params as { references?: readonly { objetId: IdObjet }[]; objetId?: IdObjet };
    const vise = o.classe === "cotation" ? (p.references ?? []).some((r) => partent.has(r.objetId)) : o.classe === "etiquette" && p.objetId !== undefined && partent.has(p.objetId);
    if (vise) aReparer.push(o.id);
  }
  return { commandes, cibles: cibles.map((o) => o.id), baiesEntrainees, aReparer, ignores };
}

const liste = (etat: EtatModele, ids: readonly IdObjet[]) => ids.map((id) => (etat.objets[id] ? nom(etat.objets[id]) : id)).join(", ");

/** Consigne lue avant l'accord : quoi, ce qui suit, comment confirmer. */
export function consigneSuppression(etat: EtatModele, p: PlanSuppression): string {
  if (p.cibles.length === 0) return "Rien à supprimer dans la sélection. Échap pour quitter.";
  const parties = [`Supprimer ${p.cibles.length} objet(s) : ${liste(etat, p.cibles)}.`];
  if (p.baiesEntrainees.length > 0) parties.push(`Baies hébergées supprimées avec leur mur : ${liste(etat, p.baiesEntrainees)}.`);
  if (p.aReparer.length > 0) parties.push(`Références à réparer ensuite : ${liste(etat, p.aReparer)}.`);
  if (p.ignores.length > 0) parties.push(`Ignorés (niveau, calque ou groupe : passer par le navigateur) : ${liste(etat, p.ignores)}.`);
  parties.push("Entrée ou clic pour confirmer, Échap pour renoncer.");
  return parties.join(" ");
}

function sessionSupprimer(ctx: ContexteAtelier): SessionOutil {
  const ids = ctx.selection.lire().ids;
  let erreurs: readonly ErreurLisible[] = [];
  const plan = (): PlanSuppression | null => {
    const etat = ctx.etat();
    return etat ? planSuppression(etat, ids) : null;
  };
  const accord = (): ReactionOutil => {
    const p = plan();
    if (!p || p.commandes.length === 0) {
      erreurs = [lisible("Suppression", "aucun objet supprimable dans la sélection", "sélectionner des objets du plan, ou Échap")];
      return { action: "continuer" };
    }
    const ko = controler(ctx, p.commandes);
    if (ko.length > 0) {
      erreurs = ko;
      return { action: "continuer" };
    }
    erreurs = [];
    return { action: "valider", label: p.cibles.length === 1 ? `Supprimer ${liste(ctx.etat() as EtatModele, p.cibles)}` : `Supprimer ${p.cibles.length} objets`, commandes: p.commandes, terminer: true };
  };
  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      if (evt.type === "appui") return accord();
      if (evt.type === "touche") {
        if (evt.touche === "Enter") return accord();
        if (evt.touche === "Escape") return { action: "terminer" };
      }
      return { action: "continuer" };
    },
    apercu() {
      const etat = ctx.etat();
      const p = plan();
      if (!etat || !p) return { formes: [], champs: [], consigne: "Le modèle n'est pas chargé.", erreurs };
      const formes: FormeApercu[] = [{ forme: "surligner", ids: [...p.cibles, ...p.baiesEntrainees], style: "erreur" }];
      if (p.aReparer.length > 0) formes.push({ forme: "surligner", ids: p.aReparer, style: "fantome" });
      return { formes, champs: [], consigne: consigneSuppression(etat, p), erreurs };
    },
    abandonner() {
      erreurs = [];
    },
  };
}

export function outilSupprimer(): DefinitionOutil {
  return definir({
    id: "modifier.supprimer",
    libelle: "Supprimer",
    famille: "modifier",
    niveau: "essentiel",
    synonymes: ["effacer", "delete", "erase", "suppr", "retirer", "enlever"],
    fiches: ["DA-01-02", "DA-01-03", "DA-01-04", "DA-01-05", "DA-01-09", "DA-01-10", "DA-01-11", "DA-02-13", "DA-03-13", "DA-07-01", "DA-07-02", "DA-07-03", "DA-07-04", "DA-07-06", "DA-07-15", "DA-07-16", "DA-07-17", "DA-15-02", "DA-15-04"],
    aide: {
      action: "Supprime la sélection après avoir listé les baies hébergées et les références qui deviendront « à réparer ».",
      conditions: "Une sélection non vide ; projet modifiable.",
      exemple: "Sélectionnez un mur, touche Suppr, lisez la liste, Entrée.",
    },
    activation: activationSelection,
    commencer: sessionSupprimer,
  });
}
