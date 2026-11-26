/**
 * Protocole des extensions, lot 1 : ce qui tourne **dans** l'espace isolé d'une extension (un Web Worker par extension,
 * `apps/web/.../planche/extension-planche.worker.ts`). Pur : ni DOM, ni Worker — le canal est une fonction `poster`.
 *
 * Contrairement à un script personnel, exécuté une fois puis jeté, une extension reste en vie pendant la séance
 * (décision du maître d'ouvrage du 25 novembre 2026). Son code est lu **une fois** ; il déclare ce qu'il sait traiter
 * par `planche.sur(nom, fonction)`, puis la Planche lui adresse des demandes et des événements. Le délai par événement
 * est tenu de l'extérieur, par l'hôte (`hote-extensions.ts`), qui arrête l'espace isolé s'il ne répond pas.
 *
 * Objet `planche` offert au code en 1.0, lot 1 :
 *   planche.protocole            version du protocole
 *   planche.extension            { id, version } de la fiche
 *   planche.sur(nom, fonction)   traite une demande ou un événement de la Planche (une fonction par nom)
 *   planche.afficher(...valeurs) écrit une ligne au journal de l'extension
 */
import { type FicheExtension, type MessageProtocole, VERSION_PROTOCOLE, demandeProtocole, lireMessageProtocole, refusProtocole, reponseProtocole } from "./protocole-extensions.js";
import { MAX_LONGUEUR_LIGNE_JOURNAL } from "./scripts.js";

export type ErreurDemarrageExtension = { readonly genre: "import" } | { readonly genre: "syntaxe" | "execution"; readonly texte: string };

export interface ExecutantExtension {
  /** Lit et lance le code de l'extension, une fois. `null` = démarrée. */
  readonly demarrer: () => ErreurDemarrageExtension | null;
  /** Traite un message venu de la Planche ; un message illisible est ignoré. */
  readonly recevoir: (brut: unknown) => void;
}

const MOTIF_NOM = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9-]*){0,3}$/;
const texteDe = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 500);

function ecrire(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Copie transmissible d'un résultat (données seulement) ; `undefined` vaut `null`. Lève si la valeur n'est pas des données. */
function donnees(v: unknown): unknown {
  if (v === undefined) return null;
  const texte = JSON.stringify(v) as string | undefined;
  if (texte === undefined) throw new TypeError("valeur non transmissible");
  return JSON.parse(texte) as unknown;
}

export function creerExecutantExtension(
  extension: { readonly fiche: Pick<FicheExtension, "id" | "version">; readonly code: string },
  poster: (m: MessageProtocole) => void,
  options: { readonly avantExecution?: () => void } = {},
): ExecutantExtension {
  const traitements = new Map<string, (donneesRecues: unknown) => unknown>();
  let numero = 0;
  let demarree = false;

  const api = Object.freeze({
    protocole: VERSION_PROTOCOLE,
    extension: Object.freeze({ id: extension.fiche.id, version: extension.fiche.version }),
    sur: (nom: unknown, fonction: unknown): void => {
      if (typeof nom !== "string" || !MOTIF_NOM.test(nom)) throw new TypeError("planche.sur : nom de demande ou d'événement mal formé");
      if (typeof fonction !== "function") throw new TypeError("planche.sur : fonction attendue");
      traitements.set(nom, fonction as (d: unknown) => unknown);
    },
    afficher: (...valeurs: unknown[]): void => {
      poster(demandeProtocole(++numero, "journal.afficher", { ligne: valeurs.map(ecrire).join(" ").slice(0, MAX_LONGUEUR_LIGNE_JOURNAL) }));
    },
  });

  return {
    demarrer: () => {
      if (demarree) return null;
      // `import(...)` chargerait du code d'ailleurs : le mot est refusé partout, comme pour un script personnel.
      if (/\bimport\b/.test(extension.code)) return { genre: "import" };
      let fn: (planche: unknown) => unknown;
      try {
        fn = new Function("planche", `"use strict";\n${extension.code}`) as (planche: unknown) => unknown;
      } catch (e) {
        return { genre: "syntaxe", texte: texteDe(e) };
      }
      options.avantExecution?.();
      try {
        fn(api);
      } catch (e) {
        return { genre: "execution", texte: texteDe(e) };
      }
      demarree = true;
      return null;
    },
    recevoir: (brut) => {
      const m = lireMessageProtocole(brut);
      // Les réponses de la Planche aux demandes sans retour de ce lot (journal) n'appellent rien.
      if (!m || m.sorte === "reponse" || !demarree) return;
      const traitement = traitements.get(m.nom);
      if (!traitement) {
        // Un événement sans traitement est simplement accusé ; une demande sans traitement est une erreur nommée.
        poster(m.sorte === "evenement" ? reponseProtocole(m.id) : refusProtocole(m.id, "demande_inconnue", m.nom));
        return;
      }
      let brutResultat: unknown;
      try {
        brutResultat = traitement(m.donnees);
      } catch (e) {
        poster(refusProtocole(m.id, "echec_extension", texteDe(e)));
        return;
      }
      let resultat: unknown;
      try {
        resultat = donnees(brutResultat);
      } catch {
        poster(refusProtocole(m.id, "argument_invalide", "résultat non transmissible : des données seulement"));
        return;
      }
      poster(reponseProtocole(m.id, m.sorte === "evenement" ? null : resultat));
    },
  };
}
