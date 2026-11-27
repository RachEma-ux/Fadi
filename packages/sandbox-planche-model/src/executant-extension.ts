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
 *
 * Lot 2 — demandes à la Planche. Chacune rend une promesse : la réponse arrive par message, le traitement s'écrit donc
 * `async` et attend (`await`). Une promesse rejetée porte l'erreur nommée du protocole (`e.name`, par exemple
 * « permission_refusee », « operation_deja_ouverte », « operation_refusee »).
 *   planche.demander(nom, donnees)        demande quelconque de la table du protocole
 *   planche.modele.lire()                 { faces, aretes, objets, enOperation } du contexte courant, en mètres
 *   planche.modele.<fonction>(...)        ligne, rectangle, boite, pousser, deplacer, copier, tourner, grouper,
 *                                         composant, effacer — mêmes arguments que dans un script personnel
 *   planche.operation.ouvrir(nom)         ouvre l'opération (un seul pas d'annulation, sous ce nom)
 *   planche.operation.valider()           applique l'ensemble ; rend { crees }
 *   planche.operation.abandonner()        n'applique rien
 *   planche.selection.lire() / .definir(ids)
 * Une modification faite sans opération ouverte reçoit une opération automatique, validée à la fin du traitement.
 *
 * Lot 3 — commandes, avis, saisies. La Planche lance une commande déclarée dans la fiche par la demande
 * « commande.<id> », avec `{ langue }` (« fr » ou « en ») ; l'extension la traite par `planche.sur("commande.<id>", …)`.
 *   planche.message.afficher(texte, genre)   avis au-dessus de la barre d'état ; genre « info » (défaut) ou « alerte »
 *   planche.saisie.demander(titre, champs)   fenêtre de saisie ; rend { <id> : valeur… }, ou `null` si elle est annulée.
 *                                            Le temps passé devant la fenêtre ne compte pas dans le délai de la commande.
 *
 * Lot 6 (permission « outil ») — voir `outils/outil-extension.ts` :
 *   planche.outil.sur(outil, evenement, fn)    traite un événement de l'outil ; `fn` rend la description à dessiner
 *
 * Lot 4 (permission « panneau ») — voir `panneaux-extensions.ts` :
 *   planche.panneau.sur(panneau, action, fn)   traite une action appelée par la page du panneau
 *   planche.panneau.envoyer(panneau, donnees)  envoie des données à la page ; faux si le panneau est fermé
 *   planche.panneau.ouvrir(panneau)            ouvre le panneau dans la colonne
 *
 * Protocole 1.1 (plans reçus, DXF) :
 *   planche.modele.lire({ portee: "monde" })    faces et arêtes de tout le modèle, en coordonnées du modèle, avec
 *                                               chemin d'occurrences et balise ; chaque arête dit sa courbe
 *   planche.modele.lignes([[a, b], …])          plusieurs segments en une seule opération
 *   planche.modele.arc(depart, milieu, fin, cotes)   arc par trois points
 *   planche.modele.cercle(centre, rayon, normale, cotes)
 *   planche.balises.creer(nom, couleur)         rend l'identifiant (celui de la balise du même nom si elle existe)
 *   planche.fichiers.ouvrir(types, { flux: true })   { nom, taille, lire(debut, longueur), texte() }, ou `null`
 *   planche.fichiers.ouvrir(types, { archiver: true }) (1.2) { nom, texte, archive }, archivé tel quel en base
 *   planche.fichiers.enregistrer(nom, texte)    au-delà de 1 000 000 caractères, envoyé par morceaux sans rien changer
 *                                               pour l'extension
 *
 * Protocole 1.3 (précision et trame) :
 *   planche.unites.lire()                       rend aussi la précision réelle du projet (`decimales`), les pas
 *                                               d'accrochage (`pasLongueur` en m, `pasAngle` en degrés, ou null) et
 *                                               le format de cote (`formatCote`)
 *   planche.cotes.creer(a, b, position, direction, balise)   cote linéaire entre deux points du monde ; rend
 *                                               l'identifiant ; avec une balise, cachée quand la balise l'est
 *   planche.textes.creer(ancre, position, texte, balise)     texte avec repère ; rend l'identifiant
 *   planche.modele.lire()                       dit aussi `dans` : l'objet ouvert en édition, ou null à la racine
 *   planche.objets.verrouiller(ids, verrou)     verrouille (vrai) ou déverrouille (faux) des groupes et composants
 *   planche.annotations.lire()                  { cotes, textes } : cotes linéaires et textes avec repère du dessin
 *   planche.annotations.effacer(ids)            efface des cotes et des textes
 *   événements de souris d'un outil : `vise`, le point visé avant accrochage sur le plan de travail, ou null
 * Protocole 1.4 (surfaces réglementaires) :
 *   planche.geometrie.coupe(hauteur, objets, sansBalises)  coupe horizontale des solides à la hauteur z (m), tout le modèle ou
 *                                               les objets nommés : { polygones, aire (union), solides (balise
 *                                               et aire de chacun), ecartes (non solides, avec le motif), facesLibres }
 *   planche.geometrie.projection(objets, sansBalises)  projection au sol des solides, même résultat ;
 *                                               `sansBalises` : balises dont les solides ne comptent pas
 *   planche.geometrie.union(polygones)          union de polygones { exterieur, trous } en [x, y] : { polygones, aire }
 *   planche.niveaux.lire()                      { niveaux : [{ id, nom, altitude, hauteur }] du plus haut au plus bas, referenceNGF :
 *                                               altitude NGF du ±0,00, ou null si elle n'est pas renseignée }
 */
import { FONCTIONS_MODIFICATION, type FicheExtension, type MessageProtocole, VERSION_PROTOCOLE, demandeProtocole, lireMessageProtocole, refusProtocole, reponseProtocole } from "./protocole-extensions.js";
import { MAX_LONGUEUR_LIGNE_JOURNAL } from "./scripts.js";
import { BORNES_FICHIER } from "./fichiers-extensions.js";

export type ErreurDemarrageExtension = { readonly genre: "import" } | { readonly genre: "syntaxe" | "execution"; readonly texte: string };

export interface ExecutantExtension {
  /** Lit et lance le code de l'extension, une fois. `null` = démarrée. */
  readonly demarrer: () => ErreurDemarrageExtension | null;
  /** Traite un message venu de la Planche ; un message illisible est ignoré. */
  readonly recevoir: (brut: unknown) => void;
}

const MOTIF_NOM = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9-]*){0,3}$/;
/** Demandes simultanées en attente de réponse, par extension. */
export const MAX_DEMANDES_EN_ATTENTE = 200;
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
  /** Fonctions différées par `planche.minuterie.dans`, par numéro de minuterie. */
  const minuteries = new Map<number, (donneesRecues: unknown) => unknown>();
  let numero = 0;
  let demarree = false;
  /** Demandes adressées à la Planche, en attente de leur réponse. */
  const attentes = new Map<number, { readonly tenir: (v: unknown) => void; readonly rejeter: (e: Error) => void }>();

  const demander = (nom: unknown, donneesEnvoyees: unknown = null): Promise<unknown> =>
    new Promise((tenir, rejeter) => {
      if (typeof nom !== "string" || !MOTIF_NOM.test(nom)) throw new TypeError("planche.demander : nom de demande mal formé");
      if (attentes.size >= MAX_DEMANDES_EN_ATTENTE) throw new RangeError("planche.demander : trop de demandes en attente");
      const id = ++numero;
      attentes.set(id, { tenir, rejeter });
      poster(demandeProtocole(id, nom, donnees(donneesEnvoyees)));
    });

  const modele: Record<string, (...a: unknown[]) => Promise<unknown>> = { lire: (options?: unknown) => demander("modele.lire", options === undefined ? null : options) };
  for (const fonction of FONCTIONS_MODIFICATION) modele[fonction] = (...args) => demander("modele.modifier", { fonction, arguments: args });

  const api = Object.freeze({
    demander,
    modele: Object.freeze(modele),
    operation: Object.freeze({
      ouvrir: (nom: unknown) => demander("operation.ouvrir", { nom }),
      valider: () => demander("operation.valider"),
      abandonner: () => demander("operation.abandonner"),
    }),
    selection: Object.freeze({
      lire: () => demander("selection.lire"),
      definir: (ids: unknown) => demander("selection.definir", { ids }),
    }),
    message: Object.freeze({
      afficher: (texte: unknown, genre: unknown = "info") => demander("message.afficher", { texte, genre }),
    }),
    matieres: Object.freeze({
      lire: () => demander("matieres.lire"),
      appliquer: (ids: unknown, matiere: unknown = null) => demander("matieres.appliquer", { ids: typeof ids === "string" ? [ids] : ids, matiere }),
    }),
    balises: Object.freeze({
      lire: () => demander("balises.lire"),
      appliquer: (ids: unknown, balise: unknown = null) => demander("balises.appliquer", { ids: typeof ids === "string" ? [ids] : ids, balise }),
      creer: (nom: unknown, couleur?: unknown) => demander("balises.creer", couleur === undefined ? { nom } : { nom, couleur }),
    }),
    cotes: Object.freeze({
      creer: (a: unknown, b: unknown, position: unknown, direction?: unknown, balise?: unknown) =>
        demander("cotes.creer", { a, b, position, ...(direction === undefined ? {} : { direction }), ...(balise === undefined ? {} : { balise }) }),
    }),
    textes: Object.freeze({
      creer: (ancre: unknown, position: unknown, texte: unknown, balise?: unknown) => demander("textes.creer", { ancre, position, texte, ...(balise === undefined ? {} : { balise }) }),
    }),
    annotations: Object.freeze({
      lire: () => demander("annotations.lire"),
      effacer: (ids: unknown) => demander("annotations.effacer", { ids: typeof ids === "string" ? [ids] : ids }),
    }),
    objets: Object.freeze({
      verrouiller: (ids: unknown, verrou: unknown = true) => demander("objets.verrouiller", { ids: typeof ids === "string" ? [ids] : ids, verrou }),
    }),
    niveaux: Object.freeze({
      lire: () => demander("niveaux.lire"),
    }),
    geometrie: Object.freeze({
      coupe: (hauteur: unknown, objets?: unknown, sansBalises?: unknown) => demander("geometrie.coupe", { hauteur, ...(objets === undefined || objets === null ? {} : { objets: typeof objets === "string" ? [objets] : objets }), ...(sansBalises === undefined ? {} : { sansBalises }) }),
      projection: (objets?: unknown, sansBalises?: unknown) => demander("geometrie.projection", { ...(objets === undefined || objets === null ? {} : { objets: typeof objets === "string" ? [objets] : objets }), ...(sansBalises === undefined ? {} : { sansBalises }) }),
      union: (polygones: unknown) => demander("geometrie.union", { polygones }),
    }),
    unites: Object.freeze({
      lire: () => demander("unites.lire"),
      formater: (valeur: unknown, genre: unknown = "longueur") => demander("unites.formater", { valeur, genre }),
    }),
    minuterie: Object.freeze({
      /** Action différée : `fonction` est appelée une fois, après `delaiMs` ; rend le numéro de la minuterie. */
      dans: async (delaiMs: unknown, fonction: unknown): Promise<number> => {
        if (typeof fonction !== "function") throw new TypeError("planche.minuterie.dans : fonction attendue");
        const id = (await demander("minuterie.armer", { delaiMs })) as number;
        minuteries.set(id, fonction as (d: unknown) => unknown);
        return id;
      },
      annuler: (id: unknown) => {
        if (typeof id === "number") minuteries.delete(id);
        return demander("minuterie.annuler", { id });
      },
    }),
    donnees: Object.freeze({
      lire: (cible: unknown, cle?: unknown) => demander("donnees.lire", cle === undefined ? { cible } : { cible, cle }),
      ecrire: (cible: unknown, cle: unknown, valeur: unknown) => demander("donnees.ecrire", { cible, cle, valeur }),
      effacer: (cible: unknown, cle?: unknown) => demander("donnees.effacer", cle === undefined ? { cible } : { cible, cle }),
    }),
    saisie: Object.freeze({
      demander: (titre: unknown, champs: unknown) => demander("saisie.demander", { titre, champs }),
    }),
    fichiers: Object.freeze({
      /**
       * Fichier texte choisi par l'utilisateur : `{ nom, texte }`, ou `null` s'il renonce. (1.1) Avec `{ flux: true }` :
       * `{ nom, taille, lire(debut, longueur), texte() }`, le texte restant dans la Planche jusqu'à la fin de la commande.
       */
      ouvrir: async (types?: unknown, options?: unknown): Promise<unknown> => {
        const liste = types === undefined || types === null ? {} : { types: typeof types === "string" ? [types] : types };
        const flux = !!options && typeof options === "object" && (options as { flux?: unknown }).flux === true;
        // (1.2) `{ archiver: true }` : la Planche range le fichier tel quel en base et rend `archive` (ou `archiveRefus`).
        const archiver = !!options && typeof options === "object" && (options as { archiver?: unknown }).archiver === true;
        if (archiver) return demander("fichiers.ouvrir", { ...liste, archiver: true, ...(flux ? { flux: true } : {}) });
        if (!flux) return demander("fichiers.ouvrir", liste);
        const f = (await demander("fichiers.ouvrir", { ...liste, flux: true })) as { nom: string; taille: number; jeton: number } | null;
        if (!f) return null;
        const lire = (debut: unknown = 0, longueur: unknown = BORNES_FICHIER.morceau) => demander("fichiers.lire", { jeton: f.jeton, debut, longueur });
        return Object.freeze({
          nom: f.nom,
          taille: f.taille,
          lire,
          /** Le texte entier, lu morceau par morceau. */
          texte: async (): Promise<string> => {
            const morceaux: string[] = [];
            for (let debut = 0; debut < f.taille; debut += BORNES_FICHIER.morceau) morceaux.push((await lire(debut)) as string);
            return morceaux.join("");
          },
        });
      },
      /** Propose à l'utilisateur d'enregistrer un fichier texte : `true`, ou `false` s'il renonce. */
      enregistrer: async (nom: unknown, texte: unknown): Promise<unknown> => {
        if (typeof texte !== "string" || texte.length <= BORNES_FICHIER.caracteres) return demander("fichiers.enregistrer", { nom, texte });
        // (1.1) Texte long : préparé par morceaux, puis enregistré par son jeton.
        const jeton = await demander("fichiers.preparer");
        for (let debut = 0; debut < texte.length; debut += BORNES_FICHIER.morceau) await demander("fichiers.ajouter", { jeton, texte: texte.slice(debut, debut + BORNES_FICHIER.morceau) });
        return demander("fichiers.enregistrer", { nom, jeton });
      },
    }),
    panneau: Object.freeze({
      /** Envoie des données à la page du panneau ; rend faux si le panneau n'est pas ouvert. */
      envoyer: (panneau: unknown, donneesEnvoyees: unknown = null) => demander("panneau.envoyer", { panneau, donnees: donneesEnvoyees }),
      /** Ouvre le panneau dans la colonne de la Planche. */
      ouvrir: (panneau: unknown) => demander("panneau.ouvrir", { panneau }),
      /** Traite une action nommée, appelée par la page du panneau (`fadi.action`). */
      sur: (panneau: unknown, action: unknown, fonction: unknown): void => {
        const nom = `panneau.${String(panneau)}.${String(action)}`;
        if (!MOTIF_NOM.test(nom)) throw new TypeError("planche.panneau.sur : panneau ou action mal nommé");
        if (typeof fonction !== "function") throw new TypeError("planche.panneau.sur : fonction attendue");
        traitements.set(nom, fonction as (d: unknown) => unknown);
      },
    }),
    outil: Object.freeze({
      /**
       * Traite un événement de l'outil (activation, deplacement, clic, saisie…) ; la fonction rend la description que
       * la Planche dessine, ou rien pour garder la précédente.
       */
      sur: (outil: unknown, evenement: unknown, fonction: unknown): void => {
        const nom = `outil.${String(outil)}.${String(evenement)}`;
        if (!MOTIF_NOM.test(nom)) throw new TypeError("planche.outil.sur : outil ou événement mal nommé");
        if (typeof fonction !== "function") throw new TypeError("planche.outil.sur : fonction attendue");
        traitements.set(nom, fonction as (d: unknown) => unknown);
      },
    }),
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
      if (!m || !demarree) return;
      if (m.sorte === "reponse") {
        // Réponse de la Planche à une demande de l'extension ; celles du journal n'attendent rien.
        const attente = attentes.get(m.id);
        if (!attente) return;
        attentes.delete(m.id);
        if (m.ok) attente.tenir(m.resultat);
        else attente.rejeter(Object.assign(new Error(m.erreur!.detail || m.erreur!.nom), { name: m.erreur!.nom }));
        return;
      }
      // Échéance d'une minuterie : la fonction donnée à `planche.minuterie.dans`, appelée une seule fois.
      const echeance = m.nom === "minuterie.echeance" ? (m.donnees as { id?: unknown } | null)?.id : undefined;
      const differee = typeof echeance === "number" ? minuteries.get(echeance) : undefined;
      if (typeof echeance === "number") minuteries.delete(echeance);
      const traitement = differee ?? traitements.get(m.nom);
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
      const rendre = (valeur: unknown): void => {
        let resultat: unknown;
        try {
          resultat = donnees(valeur);
        } catch {
          poster(refusProtocole(m.id, "argument_invalide", "résultat non transmissible : des données seulement"));
          return;
        }
        poster(reponseProtocole(m.id, m.sorte === "evenement" ? null : resultat));
      };
      // Traitement `async` (il attend des réponses de la Planche) : la fin de la promesse clôt l'appel.
      if (brutResultat !== null && typeof brutResultat === "object" && typeof (brutResultat as { then?: unknown }).then === "function") {
        (brutResultat as PromiseLike<unknown>).then(rendre, (e: unknown) => poster(refusProtocole(m.id, "echec_extension", `${e instanceof Error && e.name !== "Error" ? `${e.name} : ` : ""}${texteDe(e)}`.slice(0, 500))));
        return;
      }
      rendre(brutResultat);
    },
  };
}
