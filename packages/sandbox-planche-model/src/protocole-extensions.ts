/**
 * Protocole des extensions de la Planche, version 1.0 — lot 1 (25 novembre 2026, proposition validée par le maître
 * d'ouvrage le même jour). Pur : ni React, ni DOM, ni Worker. Ce fichier range ce que le navigateur et, plus tard, le
 * serveur doivent juger de la même façon :
 *
 *  - le **paquet** d'une extension (`fadi-addon/1`) : une fiche, du code en texte, les pages de ses panneaux — jamais de
 *    code compilé ; validation stricte, motif nommé, aucun filtrage silencieux ;
 *  - la **fiche** : identité, version du protocole attendue, permissions demandées, commandes, outils, panneaux et
 *    abonnements déclarés (la Planche la lit sans exécuter le code) ;
 *  - la règle des **versions** : la Planche accepte la version courante et la précédente ;
 *  - les **messages** échangés avec l'espace isolé d'une extension (demande, réponse, événement) et leurs erreurs nommées.
 *
 * Les services eux-mêmes (modèle, opération, sélection, panneau, outil…) arrivent lot par lot ; ce lot ne connaît que
 * le journal (`journal.afficher`), pour que le canal soit éprouvé de bout en bout.
 */
import { CURSEURS_OUTIL, estCurseurOutil, type CurseurOutil } from "./outils/outil-extension.js";
import { MOTIF_ID_EXTENSION, MOTIF_VERSION_EXTENSION } from "./extensions-sandbox.js";

// ————————————————————————————————————————————————————————————— Constantes

export const FORMAT_PAQUET_EXTENSION = "fadi-addon/1";
/** Version du protocole que parle cette Planche : `majeur.mineur`. Le mineur augmente quand on ajoute, le majeur quand on retire. */
export const VERSION_PROTOCOLE = "1.3";

/** Bornes arrêtées le 25 novembre 2026 : caractères de code, caractères du paquet entier, durées par commande et par événement. */
export const BORNES_EXTENSION = {
  code: 200_000,
  paquet: 1_000_000,
  delaiCommandeMs: 5000,
  delaiEvenementMs: 1000,
  commandes: 40,
  outils: 20,
  panneaux: 10,
  pages: 40,
  libelle: 60,
  description: 240,
} as const;

/** Ce qu'une extension peut demander. Aucune permission de réseau n'existe en 1.0. */
export const PERMISSIONS_EXTENSION = ["modele.lire", "modele.modifier", "selection", "messages", "panneau", "outil", "evenements", "donnees", "fichiers"] as const;
export type PermissionExtension = (typeof PERMISSIONS_EXTENSION)[number];

/** Événements auxquels une extension peut s'abonner en 1.0 (trois familles : projet, modèle, sélection). */
export const EVENEMENTS_EXTENSION = ["projet.ouvert", "projet.enregistre", "modele.change", "selection.change"] as const;
export type EvenementExtension = (typeof EVENEMENTS_EXTENSION)[number];

// ————————————————————————————————————————————————————————————— Fiche et paquet

export interface TexteBilingue {
  readonly fr: string;
  readonly en: string;
}

/** Une commande ou un outil déclaré : la Planche crée l'entrée d'interface, l'extension ne l'ajoute jamais elle-même. */
export interface EntreeDeclaree {
  readonly id: string;
  readonly libelle: TexteBilingue;
  /** Nom d'une page du paquet (image) ; l'affichage arrive avec le lot des commandes. */
  readonly icone: string;
  /** Raccourci obligatoire (règle d'or de la Planche), forme « Alt+Maj+U ». */
  readonly raccourci: string;
  /** Outil seulement : curseur montré sur le dessin (défaut « croix ») ; l'outil peut le changer par sa description. */
  readonly curseur?: CurseurOutil;
}

export interface PanneauDeclare {
  readonly id: string;
  readonly titre: TexteBilingue;
  /** Nom de la page du paquet affichée dans le panneau. */
  readonly page: string;
  /** Icône du panneau dans la colonne de la Planche : un dessin SVG du paquet, propre à ce panneau (règle d'or). */
  readonly icone: string;
}

export interface FicheExtension {
  readonly id: string;
  readonly nom: TexteBilingue;
  readonly description: TexteBilingue;
  readonly version: string;
  readonly auteur: string;
  readonly protocole: string;
  readonly permissions: readonly PermissionExtension[];
  readonly commandes: readonly EntreeDeclaree[];
  readonly outils: readonly EntreeDeclaree[];
  readonly panneaux: readonly PanneauDeclare[];
  readonly abonnements: readonly EvenementExtension[];
}

export interface PaquetExtension {
  readonly format: typeof FORMAT_PAQUET_EXTENSION;
  readonly fiche: FicheExtension;
  /** Code JavaScript de l'extension, en texte. */
  readonly code: string;
  /** Pages et ressources des panneaux, en texte (nom de fichier → contenu). */
  readonly pages: Readonly<Record<string, string>>;
}

export type MotifRefusPaquet = "forme_invalide" | "hors_bornes" | "version_non_prise_en_charge";
export type ValidationPaquet = { readonly ok: true; readonly paquet: PaquetExtension } | { readonly ok: false; readonly erreur: MotifRefusPaquet; readonly detail: string };

/** Commence par une lettre : l'identifiant devient un segment de nom de message (« commande.<id> »), voir `MOTIF_NOM_MESSAGE`. */
const MOTIF_ID_ENTREE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MOTIF_PAGE = /^[a-z0-9][a-z0-9._-]{0,59}$/;
const MOTIF_RACCOURCI = /^(?:(?:Ctrl|Alt|Maj)\+){0,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/;
const MOTIF_PROTOCOLE = /^(\d{1,3})\.(\d{1,3})$/;
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]/;

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const clesHors = (o: Record<string, unknown>, admises: readonly string[]): string | null => Object.keys(o).find((k) => !admises.includes(k)) ?? null;

class Refus extends Error {
  constructor(readonly motif: MotifRefusPaquet, detail: string) {
    super(detail);
  }
}
const refuser = (detail: string, motif: MotifRefusPaquet = "forme_invalide"): never => {
  throw new Refus(motif, detail);
};

function texte(v: unknown, quoi: string, max: number): string {
  if (typeof v !== "string" || v.trim().length === 0) return refuser(`${quoi} : texte non vide attendu`);
  if (v.length > max) return refuser(`${quoi} : ${max} caractères au plus`, "hors_bornes");
  if (CONTROLE.test(v) || /[\n\t]/.test(v)) return refuser(`${quoi} : caractère de contrôle refusé`);
  return v;
}

function bilingue(v: unknown, quoi: string, max: number): TexteBilingue {
  if (!estObjet(v)) return refuser(`${quoi} : { fr, en } attendu`);
  const hors = clesHors(v, ["fr", "en"]);
  if (hors) return refuser(`${quoi} : champ inconnu « ${hors} »`);
  return { fr: texte(v["fr"], `${quoi}.fr`, max), en: texte(v["en"], `${quoi}.en`, max) };
}

function liste(v: unknown, quoi: string, max: number): readonly unknown[] {
  if (!Array.isArray(v)) return refuser(`${quoi} : liste attendue`);
  if (v.length > max) return refuser(`${quoi} : ${max} éléments au plus`, "hors_bornes");
  return v;
}

function sansDoublon(ids: readonly string[], quoi: string): void {
  const vus = new Set<string>();
  for (const id of ids) {
    if (vus.has(id)) refuser(`${quoi} : « ${id} » déclaré deux fois`);
    vus.add(id);
  }
}

function entree(v: unknown, quoi: string, pages: Readonly<Record<string, string>>): EntreeDeclaree {
  if (!estObjet(v)) return refuser(`${quoi} : objet attendu`);
  const hors = clesHors(v, quoi === "outil" ? ["id", "libelle", "icone", "raccourci", "curseur"] : ["id", "libelle", "icone", "raccourci"]);
  if (hors) return refuser(`${quoi} : champ inconnu « ${hors} »`);
  const id = v["id"];
  if (typeof id !== "string" || !MOTIF_ID_ENTREE.test(id) || id.length > 40) return refuser(`${quoi} : identifiant mal formé`);
  const icone = v["icone"];
  if (typeof icone !== "string" || !Object.prototype.hasOwnProperty.call(pages, icone)) return refuser(`${quoi} « ${id} » : icône absente du paquet`);
  const raccourci = v["raccourci"];
  if (typeof raccourci !== "string" || !MOTIF_RACCOURCI.test(raccourci)) return refuser(`${quoi} « ${id} » : raccourci obligatoire, de la forme « Alt+Maj+U »`);
  const curseur = v["curseur"];
  if (curseur !== undefined && !estCurseurOutil(curseur)) return refuser(`${quoi} « ${id} » : curseur inconnu (${CURSEURS_OUTIL.join(", ")})`);
  return { id, libelle: bilingue(v["libelle"], `${quoi} « ${id} » : libellé`, BORNES_EXTENSION.libelle), icone, raccourci, ...(curseur !== undefined ? { curseur } : {}) };
}

/** Jugement d'une version de protocole attendue par une extension, face à celle de cette Planche. */
export type JugementVersion = "acceptee" | "trop_recente" | "trop_ancienne" | "mal_formee";

/** La Planche accepte sa version majeure et la précédente ; un mineur plus récent que le sien est refusé (fonctions absentes). */
export function jugerVersionProtocole(attendue: string, courante: string = VERSION_PROTOCOLE): JugementVersion {
  const a = MOTIF_PROTOCOLE.exec(attendue);
  const c = MOTIF_PROTOCOLE.exec(courante);
  if (!a || !c) return "mal_formee";
  const [am, an, cm, cn] = [Number(a[1]), Number(a[2]), Number(c[1]), Number(c[2])];
  if (am > cm || (am === cm && an > cn)) return "trop_recente";
  if (am < cm - 1 || am < 1) return "trop_ancienne";
  return "acceptee";
}

/**
 * Valide un paquet d'extension lu d'un fichier `.fadi-addon.json` (déjà analysé en JSON). Forme stricte : tout champ
 * inconnu, absent ou hors bornes est un refus motivé. Rien n'est exécuté ; le code n'est que mesuré.
 */
export function validerPaquetExtension(v: unknown): ValidationPaquet {
  try {
    if (!estObjet(v)) return refuser("paquet : objet attendu");
    const hors = clesHors(v, ["format", "fiche", "code", "pages"]);
    if (hors) return refuser(`paquet : champ inconnu « ${hors} »`);
    if (v["format"] !== FORMAT_PAQUET_EXTENSION) return refuser(`paquet : format « ${FORMAT_PAQUET_EXTENSION} » attendu`, "version_non_prise_en_charge");

    const code = v["code"];
    if (typeof code !== "string" || code.trim().length === 0) return refuser("code : texte non vide attendu");
    if (code.length > BORNES_EXTENSION.code) return refuser(`code : ${BORNES_EXTENSION.code} caractères au plus`, "hors_bornes");
    if (CONTROLE.test(code)) return refuser("code : caractère de contrôle refusé");

    const pagesBrutes = v["pages"];
    if (!estObjet(pagesBrutes)) return refuser("pages : objet attendu (nom de fichier → texte)");
    const nomsPages = Object.keys(pagesBrutes);
    if (nomsPages.length > BORNES_EXTENSION.pages) return refuser(`pages : ${BORNES_EXTENSION.pages} fichiers au plus`, "hors_bornes");
    const pages: Record<string, string> = {};
    let taille = code.length;
    for (const nom of nomsPages) {
      if (!MOTIF_PAGE.test(nom)) return refuser(`pages : nom de fichier mal formé « ${nom} »`);
      const contenu = pagesBrutes[nom];
      if (typeof contenu !== "string") return refuser(`pages : « ${nom} » doit être un texte`);
      taille += contenu.length;
      pages[nom] = contenu;
    }
    if (taille > BORNES_EXTENSION.paquet) return refuser(`paquet : ${BORNES_EXTENSION.paquet} caractères au plus, code et pages réunis`, "hors_bornes");

    const f = v["fiche"];
    if (!estObjet(f)) return refuser("fiche : objet attendu");
    const horsFiche = clesHors(f, ["id", "nom", "description", "version", "auteur", "protocole", "permissions", "commandes", "outils", "panneaux", "abonnements"]);
    if (horsFiche) return refuser(`fiche : champ inconnu « ${horsFiche} »`);
    const id = f["id"];
    if (typeof id !== "string" || !MOTIF_ID_EXTENSION.test(id)) return refuser("fiche : identifiant mal formé (minuscules, chiffres, tirets)");
    const version = f["version"];
    if (typeof version !== "string" || !MOTIF_VERSION_EXTENSION.test(version)) return refuser("fiche : version de la forme 1.2.0 attendue");
    const protocole = f["protocole"];
    if (typeof protocole !== "string") return refuser("fiche : version du protocole attendue");
    const jugement = jugerVersionProtocole(protocole);
    if (jugement === "mal_formee") return refuser("fiche : version du protocole de la forme 1.0 attendue");
    if (jugement !== "acceptee") return refuser(`fiche : protocole ${protocole} non pris en charge par cette Planche (${VERSION_PROTOCOLE})`, "version_non_prise_en_charge");

    const permissions = liste(f["permissions"], "permissions", PERMISSIONS_EXTENSION.length).map((p) =>
      typeof p === "string" && (PERMISSIONS_EXTENSION as readonly string[]).includes(p) ? (p as PermissionExtension) : refuser(`permissions : « ${String(p)} » inconnue`),
    );
    sansDoublon(permissions, "permissions");
    const abonnements = liste(f["abonnements"], "abonnements", EVENEMENTS_EXTENSION.length).map((e) =>
      typeof e === "string" && (EVENEMENTS_EXTENSION as readonly string[]).includes(e) ? (e as EvenementExtension) : refuser(`abonnements : « ${String(e)} » inconnu`),
    );
    sansDoublon(abonnements, "abonnements");
    const commandes = liste(f["commandes"], "commandes", BORNES_EXTENSION.commandes).map((c) => entree(c, "commande", pages));
    const outils = liste(f["outils"], "outils", BORNES_EXTENSION.outils).map((o) => entree(o, "outil", pages));
    sansDoublon([...commandes, ...outils].map((x) => x.id), "commandes et outils");
    sansDoublon([...commandes, ...outils].map((x) => x.raccourci), "raccourcis");
    // Règle d'or de la Planche : chaque commande et chaque outil a sa propre icône, jamais partagée.
    sansDoublon([...commandes, ...outils].map((x) => x.icone), "icônes");
    const panneaux = liste(f["panneaux"], "panneaux", BORNES_EXTENSION.panneaux).map((p): PanneauDeclare => {
      if (!estObjet(p)) return refuser("panneau : objet attendu");
      const horsP = clesHors(p, ["id", "titre", "page", "icone"]);
      if (horsP) return refuser(`panneau : champ inconnu « ${horsP} »`);
      const pid = p["id"];
      if (typeof pid !== "string" || !MOTIF_ID_ENTREE.test(pid) || pid.length > 40) return refuser("panneau : identifiant mal formé");
      const page = p["page"];
      if (typeof page !== "string" || !Object.prototype.hasOwnProperty.call(pages, page)) return refuser(`panneau « ${pid} » : page absente du paquet`);
      const icone = p["icone"];
      if (typeof icone !== "string" || !Object.prototype.hasOwnProperty.call(pages, icone)) return refuser(`panneau « ${pid} » : icône absente du paquet`);
      return { id: pid, titre: bilingue(p["titre"], `panneau « ${pid} » : titre`, BORNES_EXTENSION.libelle), page, icone };
    });
    sansDoublon(panneaux.map((p) => p.id), "panneaux");
    // Un panneau a lui aussi sa propre icône, jamais celle d'une commande, d'un outil ou d'un autre panneau.
    sansDoublon([...commandes, ...outils, ...panneaux].map((x) => x.icone), "icônes");

    // Une déclaration sans la permission qui la porte est une incohérence de la fiche, pas une demande implicite.
    if (outils.length > 0 && !permissions.includes("outil")) return refuser("fiche : un outil est déclaré sans la permission « outil »");
    if (panneaux.length > 0 && !permissions.includes("panneau")) return refuser("fiche : un panneau est déclaré sans la permission « panneau »");
    if (abonnements.length > 0 && !permissions.includes("evenements")) return refuser("fiche : un abonnement est déclaré sans la permission « evenements »");

    const fiche: FicheExtension = {
      id,
      nom: bilingue(f["nom"], "nom", BORNES_EXTENSION.libelle),
      description: bilingue(f["description"], "description", BORNES_EXTENSION.description),
      version,
      auteur: texte(f["auteur"], "auteur", BORNES_EXTENSION.libelle),
      protocole,
      permissions,
      commandes,
      outils,
      panneaux,
      abonnements,
    };
    return { ok: true, paquet: { format: FORMAT_PAQUET_EXTENSION, fiche, code, pages } };
  } catch (e) {
    if (e instanceof Refus) return { ok: false, erreur: e.motif, detail: e.message };
    throw e;
  }
}

// ————————————————————————————————————————————————————————————— Messages

/** Erreurs nommées du protocole (stables : les extensions les testent par leur nom). Textes français, langue source. */
export const ERREURS_PROTOCOLE = {
  permission_refusee: "Permission refusée : l'extension n'a pas demandé « {permission} ».",
  objet_introuvable: "Objet introuvable.",
  argument_invalide: "Argument invalide.",
  operation_deja_ouverte: "Une opération est déjà ouverte.",
  operation_absente: "Aucune opération n'est ouverte.",
  operation_refusee: "Opération refusée : rien n'a été appliqué.",
  delai_depasse: "Délai dépassé : l'extension a été arrêtée.",
  version_non_prise_en_charge: "Version du protocole non prise en charge.",
  demande_inconnue: "Demande inconnue : « {nom} ».",
  echec_extension: "L'extension s'est arrêtée sur une erreur.",
} as const;
export type ErreurProtocole = keyof typeof ERREURS_PROTOCOLE;
const estErreurProtocole = (v: unknown): v is ErreurProtocole => typeof v === "string" && Object.prototype.hasOwnProperty.call(ERREURS_PROTOCOLE, v);

export interface DemandeProtocole {
  readonly protocole: string;
  readonly sorte: "demande";
  readonly id: number;
  readonly nom: string;
  readonly donnees: unknown;
}
export interface ReponseProtocole {
  readonly protocole: string;
  readonly sorte: "reponse";
  /** Numéro de la demande, ou de l'événement dont la fin est accusée. */
  readonly id: number;
  readonly ok: boolean;
  readonly resultat: unknown;
  readonly erreur: { readonly nom: ErreurProtocole; readonly detail: string } | null;
}
export interface EvenementProtocole {
  readonly protocole: string;
  readonly sorte: "evenement";
  readonly id: number;
  readonly nom: string;
  readonly donnees: unknown;
}
export type MessageProtocole = DemandeProtocole | ReponseProtocole | EvenementProtocole;

const MOTIF_NOM_MESSAGE = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9-]*){0,3}$/;
const estNumero = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export const demandeProtocole = (id: number, nom: string, donnees: unknown = null): DemandeProtocole => ({ protocole: VERSION_PROTOCOLE, sorte: "demande", id, nom, donnees });
export const evenementProtocole = (id: number, nom: string, donnees: unknown = null): EvenementProtocole => ({ protocole: VERSION_PROTOCOLE, sorte: "evenement", id, nom, donnees });
export const reponseProtocole = (id: number, resultat: unknown = null): ReponseProtocole => ({ protocole: VERSION_PROTOCOLE, sorte: "reponse", id, ok: true, resultat, erreur: null });
export const refusProtocole = (id: number, nom: ErreurProtocole, detail = ""): ReponseProtocole => ({ protocole: VERSION_PROTOCOLE, sorte: "reponse", id, ok: false, resultat: null, erreur: { nom, detail } });

/** Relit un message reçu de l'autre côté du canal : forme stricte ; `null` = message illisible (jamais interprété). */
export function lireMessageProtocole(v: unknown): MessageProtocole | null {
  if (!estObjet(v) || typeof v["protocole"] !== "string" || jugerVersionProtocole(v["protocole"]) !== "acceptee" || !estNumero(v["id"])) return null;
  const { protocole, id } = v as { protocole: string; id: number };
  if (v["sorte"] === "demande" || v["sorte"] === "evenement") {
    const nom = v["nom"];
    if (typeof nom !== "string" || nom.length > 80 || !MOTIF_NOM_MESSAGE.test(nom)) return null;
    return { protocole, sorte: v["sorte"], id, nom, donnees: v["donnees"] ?? null };
  }
  if (v["sorte"] === "reponse") {
    if (v["ok"] === true) return { protocole, sorte: "reponse", id, ok: true, resultat: v["resultat"] ?? null, erreur: null };
    const e = v["erreur"];
    if (v["ok"] !== false || !estObjet(e) || !estErreurProtocole(e["nom"]) || typeof e["detail"] !== "string") return null;
    return { protocole, sorte: "reponse", id, ok: false, resultat: null, erreur: { nom: e["nom"], detail: e["detail"].slice(0, 500) } };
  }
  return null;
}

// ————————————————————————————————————————————————————————————— Demandes d'une extension à la Planche

/**
 * Demandes qu'une extension peut adresser à la Planche, avec la permission exigée (`null` : aucune). Lot 1 : le
 * journal ; lot 2 : lecture du modèle, opération, sélection (`services-extensions.ts`) ; lot 3 : avis et saisie
 * (`saisies-extensions.ts`). Chaque lot suivant complète
 * cette table, et rien d'autre n'est accepté. Protocole 1.1 (cas 3, lot 1, plans DXF) : `balises.creer`, lecture d'un
 * fichier en flux (`fichiers.lire`) et enregistrement par morceaux (`fichiers.preparer`, `fichiers.ajouter`). Une
 * version mineure ne fait qu'ajouter : une extension qui attend « 1.0 » garde exactement ce qu'elle avait.
 * Protocole 1.3 (cas 3, lot 2, précision et trame) : `cotes.creer` (cote linéaire), `textes.creer` (texte avec
 * repère), `objets.verrouiller`, `annotations.lire` et `annotations.effacer` (cotes et textes) ; `unites.lire` rend la précision réelle du projet et ses pas d'accrochage ; les
 * événements de souris d'un outil portent aussi le point visé (`vise`).
 */
export const DEMANDES_EXTENSION: Readonly<Record<string, PermissionExtension | null>> = {
  "journal.afficher": null,
  "modele.lire": "modele.lire",
  "modele.modifier": "modele.modifier",
  "operation.ouvrir": "modele.modifier",
  "operation.valider": "modele.modifier",
  "operation.abandonner": "modele.modifier",
  "selection.lire": "selection",
  "selection.definir": "selection",
  "message.afficher": "messages",
  "saisie.demander": "messages",
  "donnees.lire": "donnees",
  "donnees.ecrire": "donnees",
  "donnees.effacer": "donnees",
  "matieres.lire": "modele.lire",
  "matieres.appliquer": "modele.modifier",
  "balises.lire": "modele.lire",
  "balises.appliquer": "modele.modifier",
  "balises.creer": "modele.modifier",
  "cotes.creer": "modele.modifier",
  "textes.creer": "modele.modifier",
  "objets.verrouiller": "modele.modifier",
  "annotations.lire": "modele.lire",
  "annotations.effacer": "modele.modifier",
  "unites.lire": null,
  "unites.formater": null,
  "minuterie.armer": "evenements",
  "minuterie.annuler": "evenements",
  "fichiers.ouvrir": "fichiers",
  "fichiers.enregistrer": "fichiers",
  "fichiers.lire": "fichiers",
  "fichiers.preparer": "fichiers",
  "fichiers.ajouter": "fichiers",
  "panneau.envoyer": "panneau",
  "panneau.ouvrir": "panneau",
};

/** Fonctions de dessin admises par « modele.modifier » en 1.0 : celles d'un script personnel, à l'identique. */
export const FONCTIONS_MODIFICATION_SCRIPT = ["ligne", "rectangle", "boite", "pousser", "deplacer", "copier", "tourner", "grouper", "composant", "effacer"] as const;
/**
 * Fonctions ajoutées en 1.1 pour les plans reçus (DXF) : plusieurs segments en une opération, arc par trois points,
 * cercle. Propres aux extensions (un script personnel ne les a pas).
 */
export const FONCTIONS_MODIFICATION_1_1 = ["lignes", "arc", "cercle"] as const;
export const FONCTIONS_MODIFICATION = [...FONCTIONS_MODIFICATION_SCRIPT, ...FONCTIONS_MODIFICATION_1_1] as const;
export type FonctionModification = (typeof FONCTIONS_MODIFICATION)[number];

/** Juge une demande d'extension : inconnue, refusée faute de permission, ou admise. */
export function jugerDemandeExtension(fiche: Pick<FicheExtension, "permissions">, nom: string): { readonly ok: true } | { readonly ok: false; readonly erreur: "demande_inconnue" | "permission_refusee"; readonly detail: string } {
  if (!Object.prototype.hasOwnProperty.call(DEMANDES_EXTENSION, nom)) return { ok: false, erreur: "demande_inconnue", detail: nom };
  const permission = DEMANDES_EXTENSION[nom] ?? null;
  if (permission !== null && !fiche.permissions.includes(permission)) return { ok: false, erreur: "permission_refusee", detail: permission };
  return { ok: true };
}
