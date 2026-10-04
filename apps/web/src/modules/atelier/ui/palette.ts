/**
 * Palette `Ctrl/⌘ K` (L3a.1, cahier §5.8, fiche DA-05-03) : outils, objets, paramètres d'affichage et aides, avec
 * synonymes français et termes d'autres logiciels. Module pur : le composant affiche ces résultats et exécute
 * l'`action` retenue.
 *
 * - Les outils viennent de `registres.outils.rechercher(texte, "complet")` : la palette donne accès à **toutes**
 *   les commandes, quel que soit le niveau d'affichage de la barre (maquette : « Toutes les commandes : Ctrl K »).
 *   Leur rang est celui du registre ; chaque résultat dit comment il a été trouvé, l'action, les conditions
 *   d'activation, un exemple, et le motif si l'outil est inactivable maintenant.
 * - Objets : libellé ou identifiant, tous niveaux (la sélection change le niveau actif).
 * - Aides et paramètres : repères de l'interface (niveaux, calques — DA-05-03 : « level », « layer »,
 *   « niveau CAO » —, documents, problèmes, annuler, rétablir) et niveaux d'affichage.
 */
import type { EtatModele, IdObjet } from "@parcours/atelier-model";
import { normaliser, type Activation, type AideOutil, type ContexteAtelier, type DefinitionOutil, type FamilleOutil, type NiveauAffichage, type RegistreOutils } from "../socle";
import { libelleClasse, libelleObjet } from "./navigateur";

export const LIBELLES_FAMILLE: Readonly<Record<FamilleOutil, string>> = {
  creer: "Créer",
  modifier: "Modifier",
  connecter: "Connecter",
  analyser: "Analyser",
  documenter: "Documenter",
  partager: "Partager",
};

export const LIBELLES_NIVEAU: Readonly<Record<NiveauAffichage, string>> = { essentiel: "Essentiel", contextuel: "Contextuel", complet: "Complet" };

export const FILTRES_PALETTE = ["tout", "outils", "objets", "parametres", "aides"] as const;
export type FiltrePalette = (typeof FILTRES_PALETTE)[number];
export const LIBELLES_FILTRE: Readonly<Record<FiltrePalette, string>> = { tout: "Tout", outils: "Outils", objets: "Objets", parametres: "Paramètres", aides: "Aides" };

/** Ce que le composant fait quand on choisit un résultat. */
export type ActionPalette =
  | { readonly type: "outil"; readonly id: string }
  | { readonly type: "objet"; readonly id: IdObjet; readonly niveauId: IdObjet | null }
  | { readonly type: "niveau-affichage"; readonly niveau: NiveauAffichage }
  | { readonly type: "repere"; readonly repere: "niveaux" | "calques" | "objets" | "documents" | "problemes" | "inspecteur" }
  | { readonly type: "annuler" }
  | { readonly type: "retablir" }
  | { readonly type: "immersif" };

export interface ResultatPalette {
  /** Clé stable (`outil:creer.mur`, `objet:m1`…), sert d'identifiant d'option. */
  readonly cle: string;
  readonly categorie: Exclude<FiltrePalette, "tout">;
  readonly nom: string;
  /** Étiquette de droite : « Créer · outil », « Mur · objet »… */
  readonly etiquette: string;
  /** « Trouvé par le synonyme « push/pull » », vide sans recherche. */
  readonly via: string;
  readonly aide: AideOutil;
  readonly raccourci?: string;
  /** Motif d'indisponibilité, si l'action ne peut pas être exécutée maintenant. */
  readonly motif: string | null;
  readonly action: ActionPalette;
  /** Pour un outil : épinglé dans les favoris ? */
  readonly favori?: boolean;
}

interface EntreeFixe {
  readonly cle: string;
  readonly categorie: "parametres" | "aides";
  readonly nom: string;
  readonly synonymes: readonly string[];
  readonly aide: AideOutil;
  readonly raccourci?: string;
  readonly action: ActionPalette;
}

const UN_CALQUE_NIVEAU = "Un calque organise l'affichage ; un niveau est un étage du bâtiment (altitude, hauteur).";

export const ENTREES_FIXES: readonly EntreeFixe[] = [
  {
    cle: "aide:niveaux",
    categorie: "aides",
    nom: "Niveaux (étages)",
    synonymes: ["niveau", "étage", "etage", "storey", "story", "floor"],
    aide: { action: "Ouvre la liste des niveaux du navigateur pour changer de niveau actif.", conditions: "Modèle chargé.", exemple: `Choisir « RDC » ; ${UN_CALQUE_NIVEAU}` },
    action: { type: "repere", repere: "niveaux" },
  },
  {
    cle: "aide:calques",
    categorie: "aides",
    nom: "Calques",
    synonymes: ["calque", "layer", "level", "niveau CAO", "couche"],
    aide: { action: "Ouvre les calques : calque actif, masquer ou afficher dans la vue (sans changer la révision).", conditions: "Modèle chargé.", exemple: UN_CALQUE_NIVEAU },
    action: { type: "repere", repere: "calques" },
  },
  {
    cle: "aide:objets",
    categorie: "aides",
    nom: "Objets par classe",
    synonymes: ["objets", "classes", "navigateur", "arborescence", "tree"],
    aide: { action: "Ouvre les objets du niveau actif groupés par classe ; un clic les sélectionne.", conditions: "Un niveau actif.", exemple: "Ouvrir « Murs », choisir « Façade P.118 »." },
    action: { type: "repere", repere: "objets" },
  },
  {
    cle: "aide:documents",
    categorie: "aides",
    nom: "Documents du projet",
    synonymes: ["documents", "catalogue", "plans", "exports", "feuilles"],
    aide: { action: "Ouvre le module Documents (catalogue du projet).", conditions: "Aucune.", exemple: "Retrouver un export du plan." },
    action: { type: "repere", repere: "documents" },
  },
  {
    cle: "aide:problemes",
    categorie: "aides",
    nom: "Modifications et problèmes",
    synonymes: ["journal", "historique", "problèmes", "erreurs", "conflits", "réserves", "Harmonie", "synchronisation", "history"],
    aide: { action: "Ouvre le panneau : journal, synchronisation, conflits, problèmes, réserves Harmonie.", conditions: "Aucune.", exemple: "Voir les modifications en attente d'envoi." },
    action: { type: "repere", repere: "problemes" },
  },
  {
    cle: "aide:inspecteur",
    categorie: "aides",
    nom: "Inspecteur",
    synonymes: ["propriétés", "proprietes", "paramètres de l'objet", "properties", "attributs"],
    aide: { action: "Ouvre l'inspecteur de l'objet sélectionné (propriétés typées avec unités).", conditions: "Un objet sélectionné.", exemple: "Changer l'épaisseur d'un mur, Entrée." },
    action: { type: "repere", repere: "inspecteur" },
  },
  {
    cle: "aide:annuler",
    categorie: "aides",
    nom: "Annuler",
    synonymes: ["undo", "défaire", "retour arrière"],
    aide: { action: "Annule votre dernière modification, par le serveur (journal).", conditions: "En ligne, aucune modification en attente d'envoi.", exemple: "Ctrl/⌘ Z après un mur tracé." },
    raccourci: "Ctrl+Z",
    action: { type: "annuler" },
  },
  {
    cle: "aide:retablir",
    categorie: "aides",
    nom: "Rétablir",
    synonymes: ["redo", "refaire"],
    aide: { action: "Rétablit votre dernière modification annulée, par le serveur.", conditions: "En ligne, aucune modification en attente d'envoi.", exemple: "Ctrl/⌘ Maj Z après une annulation." },
    raccourci: "Ctrl+Maj+Z",
    action: { type: "retablir" },
  },
  ...(["essentiel", "contextuel", "complet"] as const).map(
    (niveau): EntreeFixe => ({
      cle: `parametre:affichage-${niveau}`,
      categorie: "parametres",
      nom: `Niveau d'affichage : ${LIBELLES_NIVEAU[niveau]}`,
      synonymes: ["affichage", "interface", "mode", "niveau d'affichage", niveau],
      aide: {
        action: niveau === "essentiel" ? "Barre réduite aux outils essentiels." : niveau === "contextuel" ? "Ajoute les outils utilisables pour la sélection courante." : "Toutes les familles d'outils (Créer, Modifier, Connecter, Analyser, Documenter, Partager).",
        conditions: "Aucune ; réglage d'affichage, sans effet sur le modèle.",
        exemple: `Passer en ${LIBELLES_NIVEAU[niveau]}.`,
      },
      action: { type: "niveau-affichage", niveau },
    }),
  ),
  {
    cle: "parametre:immersif",
    categorie: "parametres",
    nom: "Plein cadre (masquer les panneaux)",
    synonymes: ["immersif", "plein écran", "focus", "zen", "cacher les panneaux"],
    aide: { action: "Agrandit la zone de travail en masquant navigateur, inspecteur et panneau ; réversible.", conditions: "Aucune.", exemple: "Activer, dessiner, puis désactiver." },
    action: { type: "immersif" },
  },
];

/** Comment un outil a été trouvé (même ordre de critères que `creerRegistre().rechercher`). */
export function trouvePar(outil: DefinitionOutil, texte: string): string {
  const q = normaliser(texte);
  if (!q) return "";
  if (normaliser(outil.libelle).includes(q)) return "";
  const syn = outil.synonymes.find((s) => normaliser(s).includes(q));
  if (syn) return `Trouvé par le synonyme « ${syn} »`;
  return "Trouvé dans l'aide";
}

/** Activation telle que le pilote la contrôlera (écriture permise, puis `activation`). */
export function activationOutil(outil: DefinitionOutil, ctx: ContexteAtelier): Activation {
  if (outil.ecrit && !ctx.ecriture.permise) return { ok: false, motif: ctx.ecriture.motif };
  try {
    return outil.activation(ctx);
  } catch (e) {
    return { ok: false, motif: `contrôle d'activation en échec : ${e instanceof Error ? e.message : String(e)}` };
  }
}

function correspondFixe(e: EntreeFixe, q: string): { rang: number; via: string } | null {
  if (!q) return { rang: 0, via: "" };
  const nom = normaliser(e.nom);
  if (nom.startsWith(q)) return { rang: 0, via: "" };
  if (nom.includes(q)) return { rang: 1, via: "" };
  const syn = e.synonymes.find((s) => normaliser(s).includes(q));
  if (syn) return { rang: 2, via: `Trouvé par le synonyme « ${syn} »` };
  if (normaliser(`${e.aide.action} ${e.aide.exemple}`).includes(q)) return { rang: 3, via: "Trouvé dans l'aide" };
  return null;
}

export interface OptionsPalette {
  readonly texte: string;
  readonly filtre: FiltrePalette;
  readonly outils: RegistreOutils;
  readonly ctx: ContexteAtelier;
  readonly etat: EtatModele | null;
  readonly favoris: readonly string[];
  /** Nombre maximal d'objets listés (le reste est annoncé, jamais omis en silence). */
  readonly maxObjets?: number;
}

export interface ResultatsPalette {
  readonly resultats: readonly ResultatPalette[];
  /** Objets correspondants non listés au-delà de `maxObjets`. */
  readonly objetsNonListes: number;
}

export function resultatsPalette(o: OptionsPalette): ResultatsPalette {
  const q = normaliser(o.texte);
  const veut = (c: Exclude<FiltrePalette, "tout">) => o.filtre === "tout" || o.filtre === c;
  const resultats: ResultatPalette[] = [];

  if (veut("outils")) {
    for (const def of o.outils.rechercher(o.texte, "complet")) {
      const a = activationOutil(def, o.ctx);
      resultats.push({
        cle: `outil:${def.id}`,
        categorie: "outils",
        nom: def.libelle,
        etiquette: `${LIBELLES_FAMILLE[def.famille]} · outil`,
        via: trouvePar(def, o.texte),
        aide: def.aide,
        ...(def.raccourci ? { raccourci: def.raccourci } : {}),
        motif: a.ok ? null : a.motif,
        action: { type: "outil", id: def.id },
        favori: o.favoris.includes(def.id),
      });
    }
  }

  const fixes = ENTREES_FIXES.filter((e) => veut(e.categorie))
    .map((e) => [e, correspondFixe(e, q)] as const)
    .filter((x): x is readonly [EntreeFixe, { rang: number; via: string }] => x[1] !== null)
    .sort((a, b) => a[1].rang - b[1].rang);
  // DA-05-03 : sur « niveau » seul, « Niveaux (étages) » passe avant « Calques » (ordre de déclaration conservé).
  for (const [e, m] of fixes) {
    resultats.push({
      cle: e.cle,
      categorie: e.categorie,
      nom: e.nom,
      etiquette: e.categorie === "aides" ? "aide" : "paramètre d'affichage",
      via: m.via,
      aide: e.aide,
      ...(e.raccourci ? { raccourci: e.raccourci } : {}),
      motif: null,
      action: e.action,
    });
  }

  let objetsNonListes = 0;
  if (veut("objets") && q && o.etat) {
    const max = o.maxObjets ?? 30;
    const trouves = Object.values(o.etat.objets)
      .map((obj) => ({ obj, libelle: libelleObjet(obj) }))
      .filter(({ obj, libelle }) => normaliser(libelle).includes(q) || normaliser(obj.id).includes(q))
      .sort((a, b) => Number(!normaliser(a.libelle).startsWith(q)) - Number(!normaliser(b.libelle).startsWith(q)) || a.libelle.localeCompare(b.libelle, "fr", { numeric: true }));
    objetsNonListes = Math.max(0, trouves.length - max);
    for (const { obj, libelle } of trouves.slice(0, max)) {
      const niveau = obj.niveauId ? o.etat.objets[obj.niveauId] : undefined;
      const nomNiveau = niveau ? libelleObjet(niveau) : null;
      resultats.push({
        cle: `objet:${obj.id}`,
        categorie: "objets",
        nom: libelle,
        etiquette: `${libelleClasse(obj.classe)} · objet`,
        via: "",
        aide: { action: "Sélectionne l'objet et l'ouvre dans l'inspecteur.", conditions: nomNiveau ? `Niveau ${nomNiveau} (devient le niveau actif).` : "Objet de projet (sans niveau).", exemple: obj.id },
        motif: null,
        action: { type: "objet", id: obj.id, niveauId: obj.niveauId ?? null },
      });
    }
  }
  return { resultats, objetsNonListes };
}

/** Indice suivant dans la liste des résultats (↑ / ↓, bouclage). */
export function deplacerActif(actif: number, nombre: number, sens: 1 | -1): number {
  if (nombre <= 0) return -1;
  if (actif < 0) return sens === 1 ? 0 : nombre - 1;
  return (actif + sens + nombre) % nombre;
}
