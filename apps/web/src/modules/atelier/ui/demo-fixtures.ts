/**
 * Données de démonstration de l'interface (L3a.1) : petit modèle typé (deux niveaux, trois calques, murs, une porte,
 * une ligne d'esquisse, une hypothèse) et outils factices, pour les tests et le développement sans le 2D ni
 * l'intégration. **Jamais monté dans le produit** ; aucune valeur n'est une donnée de P.118 (R3) : ce sont des
 * valeurs de test.
 */
import { CATALOGUE_VIDE, pointLocal, type EtatModele, type ObjetModele } from "@parcours/atelier-model";
import { creerContexte, creerEtatInterface, creerSelection, type ContexteAtelier, type DefinitionOutil, type EtatInterface } from "../socle";

const trace = { provenance: "saisie", statut: "declaree" } as const;
const m = (value: number) => ({ value, unit: "m" as const });

const objets: ObjetModele[] = [
  { id: "n-rdc", classe: "niveau", ontologie: "building.architecture", ...trace, proprietes: [], params: { nom: "RDC", elevation: m(0), hauteur: m(3.2), ordre: 1 } },
  { id: "n-ss", classe: "niveau", ontologie: "building.architecture", ...trace, proprietes: [], params: { nom: "Sous-sol", elevation: m(-3.2), hauteur: m(3.2), ordre: 0 } },
  { id: "k-murs", classe: "calque", ontologie: "projet", ...trace, proprietes: [], params: { nom: "Murs", couleur: "#315b4b", visible: true, verrouille: false, ordre: 0 } },
  { id: "k-fige", classe: "calque", ontologie: "projet", ...trace, proprietes: [], params: { nom: "Figé", couleur: "#777777", visible: true, verrouille: true, ordre: 1 } },
  { id: "k-ss", classe: "calque", ontologie: "projet", ...trace, proprietes: [], params: { nom: "Sous-sol seul", couleur: "#123456", visible: true, verrouille: false, ordre: 2, niveauxPresence: ["n-ss"] } },
  {
    id: "m1",
    classe: "mur",
    ontologie: "building.architecture",
    provenance: "import",
    statut: "declaree",
    niveauId: "n-rdc",
    calqueId: "k-murs",
    proprietes: [{ nom: "import.lineRef", valeur: "axe", provenance: "import", statut: "declaree" }],
    params: { axe: { a: pointLocal(0, 0), b: pointLocal(5, 0) }, epaisseur: m(0.3), hauteur: m(3.2), alignement: "axe", typeId: "non-type", exterieur: true, nom: "Façade nord" },
    annotations: { alignement: { provenance: "import", statut: "a-verifier", note: "lineRef absent" } },
  },
  {
    id: "m2",
    classe: "mur",
    ontologie: "building.architecture",
    ...trace,
    niveauId: "n-rdc",
    calqueId: "k-murs",
    proprietes: [],
    params: { axe: { a: pointLocal(5, 0), b: pointLocal(5, 4) }, epaisseur: m(0.2), hauteur: m(3.2), alignement: { nonEvaluee: true, motif: "source sans alignement" }, typeId: "non-type", exterieur: false },
  },
  { id: "m3", classe: "mur", ontologie: "building.architecture", ...trace, niveauId: "n-ss", calqueId: "k-murs", proprietes: [], params: { axe: { a: pointLocal(0, 0), b: pointLocal(4, 0) }, epaisseur: m(0.25), hauteur: m(3.2), alignement: "axe", typeId: "non-type", exterieur: true, nom: "Mur enterré" } },
  {
    id: "p1",
    classe: "porte",
    ontologie: "building.architecture",
    ...trace,
    niveauId: "n-rdc",
    calqueId: "k-murs",
    proprietes: [],
    params: { murHoteId: "m1", position: { t: 0.5 }, largeur: m(0.9), hauteur: m(2.1), allege: m(0), repere: "P01", typeId: "non-type" },
  },
  { id: "l1", classe: "esquisse.ligne", ontologie: "drawing", ...trace, niveauId: "n-rdc", calqueId: "k-murs", proprietes: [], params: { a: pointLocal(0, 1), b: pointLocal(2, 1), nom: "Axe de test" } },
  { id: "h1", classe: "hypothese", ontologie: "projet", provenance: "import", statut: "a-confirmer", proprietes: [], params: { code: "H01", texte: "Hypothèse de test" } },
];

export const ETAT_DEMO: EtatModele = {
  projetId: "demo",
  revision: 7,
  empreinte: "demo-empreinte",
  versionOntologie: 1,
  objets: Object.fromEntries(objets.map((o) => [o.id, o])),
  relations: [],
  catalogue: CATALOGUE_VIDE,
  proprietesProjet: [],
  supprimes: [],
};

export const outilDemo = (id: string, libelle: string, extra: Partial<DefinitionOutil> = {}): DefinitionOutil => ({
  id,
  libelle,
  famille: "creer",
  niveau: "essentiel",
  synonymes: [],
  fiches: [],
  aide: { action: `${libelle} (démonstration)`, conditions: "un niveau actif", exemple: "" },
  vues: ["plan"],
  ecrit: true,
  activation: () => ({ ok: true }),
  commencer: () => ({ traiter: () => ({ action: "continuer" }), apercu: () => ({ formes: [], champs: [], consigne: "", erreurs: [] }), abandonner: () => {} }),
  ...extra,
});

/** Outils factices couvrant familles, niveaux, synonymes, raccourcis et un outil inactivable. */
export const OUTILS_DEMO: readonly DefinitionOutil[] = [
  outilDemo("creer.mur", "Mur", { raccourci: "M", synonymes: ["wall", "cloison"], fiches: ["DA-07-01"] }),
  outilDemo("creer.porte", "Porte", { raccourci: "P", synonymes: ["door"] }),
  outilDemo("modifier.deplacer", "Déplacer", { famille: "modifier", raccourci: "D", synonymes: ["move"], niveau: "contextuel", activation: (ctx) => (ctx.selection.lire().ids.length ? { ok: true } : { ok: false, motif: "sélectionner au moins un objet" }) }),
  outilDemo("modifier.decaler", "Décaler", { famille: "modifier", synonymes: ["offset"], niveau: "complet" }),
  outilDemo("modifier.pousser", "Pousser / tirer", { famille: "modifier", synonymes: ["push/pull"], niveau: "complet", vues: ["3d"], activation: () => ({ ok: false, motif: "vue 3D au lot 3b" }) }),
  outilDemo("analyser.metre", "Mètre", { famille: "analyser", ecrit: false, raccourci: "Maj+M", synonymes: ["mesurer", "measure"] }),
];

export interface ContexteDemo {
  readonly ctx: ContexteAtelier;
  readonly vue: EtatInterface;
  readonly appels: string[];
}

/** Contexte sur `ETAT_DEMO` : `essayer` applique le vrai réducteur ; `valider` enregistre l'appel. */
export function contexteDemo(options: { ecriture?: ContexteAtelier["ecriture"]; etat?: EtatModele | null } = {}): ContexteDemo {
  const etat = options.etat === undefined ? ETAT_DEMO : options.etat;
  const appels: string[] = [];
  const vue = creerEtatInterface({ niveauActifId: "n-rdc", calqueActifId: "k-murs" });
  const ctx = creerContexte({
    projetId: "demo",
    bus: {
      etatLocal: () => etat,
      etatConfirme: () => etat,
      entrees: () => [],
      joignabilite: () => "en-ligne",
      rafraichir: async () => true,
      executer: async (label: string) => {
        appels.push(label);
        return etat ? { ok: true as const, requestId: "r", etat } : { ok: false as const, erreurs: [] };
      },
    },
    client: {
      annuler: async () => ({ statut: "injoignable" as const, message: "réseau" }),
      retablir: async () => ({ statut: "injoignable" as const, message: "réseau" }),
    },
    selection: creerSelection(),
    vue,
    ecriture: options.ecriture ?? { permise: true },
    genererId: () => "demo",
  });
  return { ctx, vue, appels };
}
