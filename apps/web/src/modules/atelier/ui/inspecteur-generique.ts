/**
 * Inspecteur : champs d'un objet (L3a.1, fiche DA-05-12-f). Module pur.
 *
 * - Une classe avec un `DescripteurInspecteur` enregistré (architecture, documents) est décrite par lui.
 * - Sinon, **repli générique** depuis `ONTOLOGIE[classe]` d'`@parcours/atelier-model` : un champ par paramètre
 *   déclaré, avec unité et provenance. Un paramètre scalaire (longueur, angle, nombre, texte, booléen, énumération,
 *   couleur) est modifiable si une commande de modification de la classe existe dans le catalogue
 *   `atelier-commands/1` (`COMMANDE_MODIFICATION`) et si le paramètre n'est ni dérivé ni exclu de cette commande ;
 *   tout le reste (géométrie, identifiants, listes) est en lecture seule, résumé.
 *
 * Convention de valeur des champs (envoyée au chef de projet) : l'interface passe à `controler` / `commandes` un
 * `number` dans `champ.unite` pour `longueur` / `angle` / `aire` / `nombre`, une `string` pour `texte` / `choix`,
 * un `boolean` pour `booleen`, `null` pour un champ vidé (retirer un paramètre facultatif, D-024).
 */
import {
  CLASSES_ESQUISSE,
  LIBELLES_PROVENANCE,
  LIBELLES_STATUT,
  MOTIF_COULEUR,
  ONTOLOGIE,
  estClasseObjet,
  estNonEvaluee,
  type Commande,
  type DeclarationParametre,
  type ObjetModele,
  type Tracabilite,
  type TypeCommande,
} from "@parcours/atelier-model";
import type { ChampInspecteur, ErreurLisible } from "../socle";
import { lisible, nombreDe, texteCourt, texteValeur } from "./format";

/** Commande de modification par classe, et paramètres qu'elle n'accepte pas (contrat `atelier-commands/1`). */
interface ModificationClasse {
  readonly type: TypeCommande;
  readonly exclus: readonly string[];
  /** `esquisse.modifier` porte la classe dans ses paramètres. */
  readonly avecClasse?: boolean;
  /** Liste fermée des paramètres modifiables (sinon : tous sauf `exclus`). */
  readonly seulement?: readonly string[];
}

export const COMMANDE_MODIFICATION: Readonly<Partial<Record<string, ModificationClasse>>> = {
  niveau: { type: "niveau.modifier", exclus: [] },
  mur: { type: "mur.modifier", exclus: [] },
  porte: { type: "ouverture.modifier", exclus: ["murHoteId", "position"] },
  fenetre: { type: "ouverture.modifier", exclus: ["murHoteId", "position"] },
  ouverture: { type: "ouverture.modifier", exclus: ["murHoteId", "position"] },
  dalle: { type: "dalle.modifier", exclus: [] },
  toiture: { type: "toiture.modifier", exclus: [] },
  escalier: { type: "escalier.modifier", exclus: [] },
  poteau: { type: "poteau.modifier", exclus: [] },
  piece: { type: "piece.modifier", exclus: ["aireCalculee"] },
  espace: { type: "espace.modifier", exclus: [] },
  zone: { type: "zone.modifier", exclus: [] },
  solide: { type: "solide.modifier", exclus: [] },
  cotation: { type: "cotation.modifier", exclus: ["etat", "references"] },
  texte: { type: "texte.modifier", exclus: [] },
  etiquette: { type: "etiquette.modifier", exclus: [] },
  calque: { type: "calque.modifier", exclus: [], seulement: ["nom", "couleur", "remplissage", "visible", "verrouille"] },
  ...Object.fromEntries(CLASSES_ESQUISSE.map((c) => [c, { type: "esquisse.modifier", exclus: [], avecClasse: true } satisfies ModificationClasse])),
};

const NATURES_SCALAIRES: Readonly<Record<string, { type: ChampInspecteur["type"]; unite?: string }>> = {
  longueur: { type: "longueur", unite: "m" },
  "evaluable-longueur": { type: "longueur", unite: "m" },
  aire: { type: "aire", unite: "m²" },
  angle: { type: "angle", unite: "°" },
  "evaluable-angle": { type: "angle", unite: "°" },
  reel: { type: "nombre" },
  entier: { type: "nombre" },
  "evaluable-entier": { type: "nombre" },
  fraction: { type: "nombre" },
  texte: { type: "texte" },
  couleur: { type: "texte" },
  booleen: { type: "booleen" },
  enum: { type: "choix" },
};

const UNITE_GRANDEUR: Readonly<Record<string, "m" | "m²" | "°">> = { longueur: "m", "evaluable-longueur": "m", aire: "m²", angle: "°", "evaluable-angle": "°" };

const NOMS_PARAMETRES: Readonly<Record<string, string>> = {
  epaisseur: "Épaisseur",
  hauteur: "Hauteur",
  largeur: "Largeur",
  profondeur: "Profondeur",
  allege: "Allège",
  elevation: "Altitude",
  ordre: "Ordre",
  nom: "Nom",
  code: "Code",
  typeId: "Type",
  exterieur: "Extérieur",
  alignement: "Alignement",
  niveauHaut: "Niveau haut",
  decalageBase: "Décalage de base",
  murHoteId: "Mur hôte",
  repere: "Repère",
  couleur: "Couleur",
  remplissage: "Remplissage",
  visible: "Visible (projet)",
  verrouille: "Verrouillé",
  aireDeclaree: "Aire déclarée",
  aireCalculee: "Aire calculée",
  axe: "Axe",
  contour: "Contour",
  trous: "Trous",
  polygones: "Polygones",
  texte: "Texte",
  rayon: "Rayon",
  angle: "Angle",
};

export function libelleParametre(nom: string): string {
  return NOMS_PARAMETRES[nom] ?? nom.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function texteTracabilite(t: Tracabilite | undefined): string | undefined {
  if (!t) return undefined;
  const source = t.sourceId ? ` · source ${t.sourceId}` : "";
  const note = t.note ? ` · ${t.note}` : "";
  return `provenance ${LIBELLES_PROVENANCE[t.provenance] ?? t.provenance} · statut ${LIBELLES_STATUT[t.statut] ?? t.statut}${source}${note}`;
}

/** Valeur saisie (convention ci-dessus) → valeur du paramètre dans la commande. */
function versParametre(decl: DeclarationParametre, valeur: unknown): unknown {
  if (valeur === null) return null;
  const unite = UNITE_GRANDEUR[decl.nature];
  if (unite && typeof valeur === "number") return { value: valeur, unit: unite };
  return valeur;
}

/** Contrôle avant envoi d'une valeur saisie pour un paramètre déclaré ; `null` = conforme. */
export function controlerParametre(decl: DeclarationParametre, valeur: unknown, libelleObjet: string): ErreurLisible | null {
  const lib = `${libelleObjet}, paramètre « ${libelleParametre(decl.nom)} »`;
  if (valeur === null || valeur === undefined || valeur === "") {
    return decl.obligatoire ? lisible(lib, "valeur obligatoire", "saisir une valeur") : null;
  }
  const scalaire = NATURES_SCALAIRES[decl.nature];
  if (!scalaire) return lisible(lib, "paramètre non modifiable dans l'inspecteur", "utiliser l'outil de la zone de travail");
  switch (scalaire.type) {
    case "longueur":
    case "aire":
    case "angle":
    case "nombre": {
      if (typeof valeur !== "number" || !Number.isFinite(valeur)) return lisible(lib, "nombre attendu", "saisir un nombre");
      if (decl.signe === ">0" && !(valeur > 0)) return lisible(lib, "la valeur doit être strictement positive", "saisir une valeur supérieure à 0");
      if (decl.signe === ">=0" && !(valeur >= 0)) return lisible(lib, "la valeur ne peut pas être négative", "saisir une valeur positive ou nulle");
      if ((decl.nature === "entier" || decl.nature === "evaluable-entier") && !Number.isInteger(valeur)) return lisible(lib, "nombre entier attendu", "saisir un entier, par exemple 2");
      if (decl.nature === "fraction" && (valeur < 0 || valeur > 1)) return lisible(lib, "fraction entre 0 et 1 attendue", "saisir une valeur entre 0 et 1");
      return null;
    }
    case "booleen":
      return typeof valeur === "boolean" ? null : lisible(lib, "oui ou non attendu", "choisir oui ou non");
    case "choix":
      return typeof valeur === "string" && (decl.valeurs ?? []).includes(valeur) ? null : lisible(lib, `valeur « ${String(valeur)} » hors de la liste`, `choisir parmi : ${(decl.valeurs ?? []).join(", ")}`);
    default: {
      if (typeof valeur !== "string") return lisible(lib, "texte attendu", "saisir un texte");
      if (decl.obligatoire && valeur.trim() === "") return lisible(lib, "texte vide", "saisir un texte non vide");
      if (decl.nature === "couleur" && !MOTIF_COULEUR.test(valeur)) return lisible(lib, `couleur « ${valeur} » mal formée`, "saisir une couleur #rrggbb, par exemple #315b4b");
      return null;
    }
  }
}

/** La commande de modification d'un paramètre, si elle existe pour la classe ; `null` sinon (lecture seule). */
export function commandeModification(objet: ObjetModele, nom: string, valeurParametre: unknown): Commande | null {
  const m = COMMANDE_MODIFICATION[objet.classe];
  if (!m || m.exclus.includes(nom) || (m.seulement && !m.seulement.includes(nom))) return null;
  const params = m.avecClasse ? { classe: objet.classe, modifications: { [nom]: valeurParametre } } : { modifications: { [nom]: valeurParametre } };
  return { type: m.type, params, cibles: [objet.id] } as unknown as Commande;
}

const egales = (a: unknown, b: unknown): boolean => {
  const na = nombreDe(a);
  const nb = nombreDe(b);
  if (na !== null || nb !== null) return na === nb;
  return a === b || ((a === undefined || a === null) && (b === undefined || b === null));
};

/** Vrai si la saisie ne change rien (aucune commande n'est alors émise). */
export function valeurInchangee(champ: Pick<ChampInspecteur, "valeur">, saisie: unknown): boolean {
  if (estNonEvaluee(champ.valeur)) return saisie === null;
  return egales(champ.valeur, saisie);
}

const estPoint = (v: unknown): v is { x: number; y: number } => typeof v === "object" && v !== null && typeof (v as { x?: unknown }).x === "number" && typeof (v as { y?: unknown }).y === "number";
const textePoint = (p: { x: number; y: number }) => `(${texteCourt(p.x)} ; ${texteCourt(p.y)})`;

/** Résumé lisible d'un paramètre non scalaire (point, segment, liste, position de baie). */
export function resumeParametre(v: unknown): string {
  if (estPoint(v)) return `${textePoint(v)} m`;
  if (typeof v === "object" && v !== null && estPoint((v as { a?: unknown }).a) && estPoint((v as { b?: unknown }).b)) {
    const s = v as { a: { x: number; y: number }; b: { x: number; y: number } };
    return `${textePoint(s.a)} → ${textePoint(s.b)} m`;
  }
  if (typeof v === "object" && v !== null && typeof (v as { t?: unknown }).t === "number") return `t = ${texteCourt((v as { t: number }).t, 4)}`;
  if (Array.isArray(v)) return `${v.length} élément(s)`;
  return texteValeur(v);
}

/** Champs du repli générique d'un objet, depuis `ONTOLOGIE[classe]`. */
export function champsGeneriques(objet: ObjetModele, libelleObjet = objet.id): ChampInspecteur[] {
  if (!estClasseObjet(objet.classe)) return [];
  const desc = ONTOLOGIE[objet.classe];
  const params = objet.params as unknown as Record<string, unknown>;
  const tracObjet = texteTracabilite(objet);
  return desc.parametres.map((decl): ChampInspecteur => {
    const brut = params[decl.nom];
    const scalaire = NATURES_SCALAIRES[decl.nature];
    const modifiable = !!scalaire && !decl.derive && commandeModification(objet, decl.nom, null) !== null;
    const annotation = objet.annotations?.[decl.nom];
    const provenance = decl.derive ? `calculée${annotation ? ` · ${texteTracabilite(annotation)}` : ""}` : (texteTracabilite(annotation) ?? tracObjet);
    const unite = scalaire?.unite;
    const valeur = scalaire ? (estNonEvaluee(brut) ? brut : (nombreDe(brut) ?? brut)) : brut === undefined ? undefined : resumeParametre(brut);
    return {
      cle: decl.nom,
      libelle: libelleParametre(decl.nom),
      type: scalaire?.type ?? "texte",
      ...(unite ? { unite } : {}),
      valeur,
      ...(decl.valeurs ? { choix: decl.valeurs.map((v) => ({ valeur: v, libelle: v })) } : {}),
      lectureSeule: !modifiable,
      ...(provenance ? { provenance } : {}),
      controler: (v: unknown) => (modifiable ? controlerParametre(decl, v, libelleObjet) : lisible(libelleObjet, `« ${libelleParametre(decl.nom)} » est en lecture seule`, "utiliser l'outil adapté de la zone de travail")),
      commandes: (v: unknown) => {
        if (!modifiable) return [];
        const c = commandeModification(objet, decl.nom, versParametre(decl, v));
        return c ? [c] : [];
      },
    };
  });
}

/** En-tête de l'inspecteur : identité de l'objet, en lecture seule. */
export function enTeteObjet(objet: ObjetModele): readonly { readonly libelle: string; readonly valeur: string }[] {
  const desc = estClasseObjet(objet.classe) ? ONTOLOGIE[objet.classe] : null;
  const lignes = [
    { libelle: "Identifiant", valeur: objet.id },
    { libelle: "Classe", valeur: desc ? `${desc.libelle} (${desc.ontologie})` : objet.classe },
    { libelle: "Classe IFC", valeur: desc?.ifc ? desc.ifc.entite + (desc.ifc.typePredefini ? ` ${desc.ifc.typePredefini}` : "") : "aucune correspondance (lot 6)" },
  ];
  if (objet.definitionId) lignes.push({ libelle: "Définition", valeur: objet.definitionId });
  return lignes;
}

/** Propriétés typées de l'objet (DA-06-07), en lecture seule au lot 3a (modification : `propriete.definir`, L3a.3). */
export function proprietesObjet(objet: ObjetModele): readonly { readonly nom: string; readonly valeur: string; readonly provenance: string }[] {
  return objet.proprietes.map((p) => ({ nom: p.nom, valeur: texteValeur(p.valeur, p.unite), provenance: texteTracabilite(p) ?? "" }));
}
