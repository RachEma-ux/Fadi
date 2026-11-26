/**
 * Services que la Planche rend à une extension (protocole 1.0, lot 2) : lecture complète du modèle, opération
 * explicite, sélection. Module pur : la Planche lui prête son modèle par `AccesPlanche`, rien n'est dessiné ici.
 *
 * Règles (spécification du protocole, « Opération ») :
 *  - toute modification se fait dans une opération ; à la validation, l'ensemble est appliqué d'un bloc, en un seul pas
 *    d'annulation, sous le nom donné ;
 *  - une seule opération à la fois par extension : en ouvrir une seconde est une erreur nommée ;
 *  - une modification sans opération ouverte reçoit une opération automatique au nom de l'appel en cours, validée à la
 *    fin de cet appel ;
 *  - avant d'appliquer, la Planche vérifie que le dessin n'a pas changé depuis l'ouverture ; sinon l'opération est
 *    refusée, rien n'est appliqué, et l'extension en est prévenue par une erreur nommée.
 *
 * Tant qu'une opération est ouverte, l'extension lit son modèle de travail (elle voit ses propres changements) ;
 * l'utilisateur, lui, ne voit rien avant la validation.
 */
import { contexte, type Id, type Modele } from "./geometrie-libre.js";
import { FONCTIONS_MODIFICATION, jugerDemandeExtension, type ErreurProtocole, type FicheExtension, type FonctionModification } from "./protocole-extensions.js";
import { ErreurScript, creerFonctionsPlanche, type FonctionScript, type FonctionsPlanche } from "./scripts.js";

/** Ce que la Planche prête à une extension. Les lectures rendent l'état courant à chaque appel. */
export interface AccesPlanche {
  readonly modele: () => Modele;
  readonly selection: () => readonly Id[];
  /** Occurrence ouverte en édition ; `undefined` = racine. */
  readonly dans: () => Id | undefined;
  /** Applique un modèle de travail en un seul pas d'annulation nommé ; `false` si la Planche le refuse. */
  readonly appliquer: (travail: Modele, nom: string, crees: readonly Id[]) => boolean;
  readonly selectionner: (ids: readonly Id[]) => void;
}

/** Les fonctions de « modele.modifier » sont bien des fonctions d'un script personnel (contrôle de type). */
FONCTIONS_MODIFICATION satisfies readonly FonctionScript[];

export const MAX_NOM_OPERATION = 80;
/** Au-delà, « modele.lire » est refusé plutôt que de transmettre un modèle démesuré à l'espace isolé. */
export const MAX_ENTITES_LECTURE = 50_000;
export const MAX_SELECTION_EXTENSION = 10_000;

export interface FaceLue {
  readonly id: Id;
  /** Contour extérieur, en mètres. */
  readonly points: readonly (readonly [number, number, number])[];
  readonly trous: number;
  /** Aire en m². */
  readonly aire: number;
}
export interface AreteLue {
  readonly id: Id;
  readonly points: readonly (readonly [number, number, number])[];
  /** Longueur en mètres. */
  readonly longueur: number;
}
export interface ObjetLu {
  readonly id: Id;
  readonly nom: string;
  readonly genre: "groupe" | "composant";
}
/** Rendu par « modele.lire » : tout le contexte courant (la racine, ou l'objet ouvert en édition). */
export interface ModeleLu {
  readonly faces: readonly FaceLue[];
  readonly aretes: readonly AreteLue[];
  readonly objets: readonly ObjetLu[];
  /** Vrai pendant une opération ouverte : la lecture montre le modèle de travail de l'extension. */
  readonly enOperation: boolean;
}

export type ReponseService = { readonly ok: true; readonly resultat: unknown } | { readonly ok: false; readonly erreur: ErreurProtocole; readonly detail: string };

export interface ServicesExtension {
  /** Début d'un appel adressé à l'extension (commande ou événement) : `nom` nomme l'opération automatique éventuelle. */
  readonly debutAppel: (nom: string) => void;
  /**
   * Fin de l'appel. `reussi` faux (erreur, délai, arrêt) : l'opération en cours est abandonnée, quelle qu'elle soit.
   * `reussi` vrai : l'opération automatique est validée ; une opération explicite reste ouverte. Rend `false` si une
   * opération automatique n'a pas pu être appliquée (dessin changé entre-temps).
   */
  readonly finAppel: (reussi: boolean) => boolean;
  readonly servir: (nom: string, donnees: unknown) => ReponseService;
  /** Abandonne l'opération ouverte, sans rien appliquer (arrêt ou désinstallation de l'extension). */
  readonly abandonner: () => void;
  readonly operationOuverte: () => boolean;
}

interface Operation {
  readonly nom: string;
  readonly automatique: boolean;
  /** Modèle et contexte de la Planche à l'ouverture : comparés à la validation. */
  readonly base: Modele;
  readonly dans: Id | undefined;
  readonly travail: FonctionsPlanche;
  /** Sélection demandée pendant l'opération : posée à la validation seulement. */
  selection: readonly Id[] | null;
}

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const refus = (erreur: ErreurProtocole, detail = ""): ReponseService => ({ ok: false, erreur, detail });
const rendu = (resultat: unknown = null): ReponseService => ({ ok: true, resultat });

export function creerServicesExtension(fiche: Pick<FicheExtension, "permissions">, acces: AccesPlanche): ServicesExtension {
  let operation: Operation | null = null;
  let appel: string | null = null;

  const fonctions = (modele: Modele, dans: Id | undefined): FonctionsPlanche => creerFonctionsPlanche(modele, { selection: acces.selection(), ...(dans !== undefined ? { dans } : {}) });
  /** Fonctions de lecture : sur le modèle de travail si une opération est ouverte, sinon sur le modèle de la Planche. */
  const vue = (): FonctionsPlanche => operation?.travail ?? fonctions(acces.modele(), acces.dans());

  const ouvrir = (nom: string, automatique: boolean): Operation => {
    const base = acces.modele();
    const dans = acces.dans();
    operation = { nom, automatique, base, dans, travail: fonctions(base, dans), selection: null };
    return operation;
  };

  const valider = (): ReponseService => {
    const op = operation;
    if (!op) return refus("operation_absente");
    operation = null;
    const travail = op.travail.modele();
    const crees = op.travail.crees();
    if (travail !== op.base) {
      // Le dessin ou le contexte d'édition a changé depuis l'ouverture : rien n'est appliqué.
      if (acces.modele() !== op.base || acces.dans() !== op.dans) return refus("operation_refusee", "le dessin a changé depuis l'ouverture de l'opération");
      if (!acces.appliquer(travail, op.nom, crees)) return refus("operation_refusee", "la Planche a refusé l'opération");
    }
    if (op.selection) acces.selectionner(op.selection.filter((id) => op.travail.existe(id)));
    return rendu({ crees });
  };

  const lire = (): ReponseService => {
    const f = vue();
    const m = f.modele();
    const dans = operation ? operation.dans : acces.dans();
    const c = contexte(m, dans);
    const faces = Object.keys(c.faces);
    const aretes = Object.keys(c.aretes);
    const objets = Object.values(c.occurrences);
    if (faces.length + aretes.length + objets.length > MAX_ENTITES_LECTURE) return refus("argument_invalide", `modèle de plus de ${MAX_ENTITES_LECTURE} entités`);
    const points = (id: Id) => f.api.points(id) as [number, number, number][];
    const lu: ModeleLu = {
      faces: faces.map((id) => ({ id, points: points(id), trous: c.faces[id]!.trous.length, aire: f.api.aire(id) as number })),
      aretes: aretes.map((id) => ({ id, points: points(id), longueur: f.api.longueur(id) as number })),
      objets: objets.map((occ) => ({ id: occ.id, nom: f.api.nom(occ.id) as string, genre: m.definitions[occ.definition]?.genre ?? "groupe" })),
      enOperation: operation !== null,
    };
    return rendu(lu);
  };

  const modifier = (donnees: unknown): ReponseService => {
    if (!estObjet(donnees) || typeof donnees["fonction"] !== "string" || !(FONCTIONS_MODIFICATION as readonly string[]).includes(donnees["fonction"])) return refus("argument_invalide", "fonction de dessin inconnue");
    const args = donnees["arguments"] ?? [];
    if (!Array.isArray(args) || args.length > 8) return refus("argument_invalide", "arguments : liste attendue");
    // Sans opération ouverte : opération automatique au nom de l'appel en cours, validée à la fin de l'appel.
    const op = operation ?? ouvrir(appel ?? "extension", true);
    try {
      return rendu(op.travail.api[donnees["fonction"] as FonctionModification](...(args as unknown[])) ?? null);
    } catch (e) {
      if (e instanceof ErreurScript) return refus(e.cle === "introuvable" ? "objet_introuvable" : "argument_invalide", e.message);
      // Refus du modèle lui-même (géométrie impossible) : l'opération reste ouverte, l'extension décide de la suite.
      return refus("argument_invalide", (e instanceof Error ? e.message : String(e)).slice(0, 500));
    }
  };

  const definirSelection = (donnees: unknown): ReponseService => {
    const ids = estObjet(donnees) ? donnees["ids"] : null;
    if (!Array.isArray(ids) || ids.length > MAX_SELECTION_EXTENSION || !ids.every((x): x is string => typeof x === "string")) return refus("argument_invalide", "ids : liste d'identifiants attendue");
    const f = vue();
    const absent = ids.find((id) => !f.existe(id));
    if (absent !== undefined) return refus("objet_introuvable", absent);
    const uniques = [...new Set(ids)];
    if (operation) operation.selection = uniques;
    else acces.selectionner(uniques);
    return rendu();
  };

  return {
    debutAppel: (nom) => {
      appel = nom;
    },
    finAppel: (reussi) => {
      appel = null;
      if (!operation) return true;
      if (!reussi) {
        operation = null;
        return true;
      }
      return operation.automatique ? valider().ok : true;
    },
    servir: (nom, donnees) => {
      const jugement = jugerDemandeExtension(fiche, nom);
      if (!jugement.ok) return refus(jugement.erreur, jugement.detail);
      switch (nom) {
        case "modele.lire":
          return lire();
        case "modele.modifier":
          return modifier(donnees);
        case "operation.ouvrir": {
          if (operation) return refus("operation_deja_ouverte", operation.nom);
          const n = estObjet(donnees) ? donnees["nom"] : null;
          if (typeof n !== "string" || n.trim().length === 0 || n.length > MAX_NOM_OPERATION) return refus("argument_invalide", `nom : texte de 1 à ${MAX_NOM_OPERATION} caractères attendu`);
          ouvrir(n.trim(), false);
          return rendu();
        }
        case "operation.valider":
          return valider();
        case "operation.abandonner":
          if (!operation) return refus("operation_absente");
          operation = null;
          return rendu();
        case "selection.lire": {
          const f = vue();
          return rendu(acces.selection().filter((id) => f.existe(id)));
        }
        case "selection.definir":
          return definirSelection(donnees);
        default:
          return refus("demande_inconnue", nom);
      }
    },
    abandonner: () => {
      operation = null;
    },
    operationOuverte: () => operation !== null,
  };
}
