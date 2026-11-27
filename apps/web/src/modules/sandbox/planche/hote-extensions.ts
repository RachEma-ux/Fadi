/**
 * Hôte d'une extension de la Planche (protocole 1.0, lot 1) : tient l'espace isolé d'une extension
 * (`extension-planche.worker.ts`) pendant la séance et lui parle par messages.
 *
 *  - l'espace isolé démarre au premier appel, pas avant (une extension installée mais inemployée ne coûte rien) ;
 *  - les appels passent un par un ; chacun a sa limite de temps — 5 s pour une demande (commande), 1 s pour un
 *    événement (décision du 25 novembre 2026). Au dépassement, l'espace isolé est arrêté, l'appel rend « delai », et
 *    l'extension redémarre au prochain appel ;
 *  - tout message reçu est relu (`lireMessageProtocole`) ; une demande de l'extension n'est servie que si elle figure à
 *    la table du protocole et que la fiche porte la permission (`jugerDemandeExtension`) ;
 *  - lot 2 : avec un accès à la Planche (`acces`), l'hôte sert la lecture du modèle, les opérations et la sélection
 *    (`creerServicesExtension`). Une opération automatique est validée à la fin de l'appel ; un appel qui échoue, dépasse
 *    son délai ou est arrêté abandonne l'opération en cours — rien n'est appliqué à moitié.
 *
 *  - lot 3 : avis et saisie (permission « messages »). L'hôte relit la demande et la confie à la Planche (`surAvis`,
 *    `saisir`) ; pendant qu'une fenêtre de saisie est ouverte, le délai de la commande est suspendu — le temps de
 *    l'utilisateur n'est pas celui de l'extension. La fin de l'appel, quelle qu'elle soit, referme la fenêtre.
 *
 *  - protocole 1.2 : archivage. Un fichier ouvert avec `archiver: true` est confié à `archiver` (la Planche le range
 *    tel quel en base) avant d'être rendu ; le délai reste suspendu pendant l'envoi. L'extension reçoit l'archive, ou
 *    son absence avec le motif, et ne parle jamais au serveur elle-même.
 *
 *  - lot 4 : panneau (permission « panneau »). L'extension envoie des données à la page de son panneau ou l'ouvre ;
 *    une action de la page est une demande comme une commande (`appeler("demande", "panneau.<id>.<action>", …)`).
 *
 * Aucune interface ici : la Planche fournit l'accès au modèle, l'affichage des avis et la fenêtre de saisie.
 */
import {
  BORNES_EXTENSION, BORNES_MINUTERIE, BORNES_SAISIE, MAX_LIGNES_JOURNAL, MAX_LONGUEUR_LIGNE_JOURNAL, BORNES_FICHIER, creerReserveFichiers, creerServicesExtension, demandeProtocole, evenementProtocole, jugerDemandeExtension,
  lireAvisExtension, lireDelaiMinuterie, lireDemandeEnregistrement, lireDemandeOuverture, lireDemandeSaisie, lireEnvoiPanneau, fichierArchive, lireFichierChoisi, lireMessageProtocole, refusProtocole, reponseProtocole, type AccesPlanche, type AvisExtension, type DemandeEnregistrement, type DemandeOuverture, type DemandeSaisie, type FichierLu, type IssueArchive,
  type ErreurDemarrageExtension, type ErreurProtocole, type MessageProtocole, type PaquetExtension, type ValeursSaisie,
} from "@parcours/sandbox-planche-model";
import type { DemarrageExtension, DemarrageRendu } from "./extension-planche.worker";

export type IssueAppelExtension =
  | { readonly genre: "fini"; readonly resultat: unknown }
  /** L'extension a répondu par une erreur nommée du protocole. */
  | { readonly genre: "erreur"; readonly nom: ErreurProtocole; readonly detail: string }
  /** Le code de l'extension n'a pas pu démarrer (mot « import », syntaxe, erreur au chargement). */
  | { readonly genre: "demarrage"; readonly erreur: ErreurDemarrageExtension }
  /** Arrêtée d'office après le délai. */
  | { readonly genre: "delai" }
  /** L'espace isolé n'a pas pu être créé, ou a rendu une réponse illisible. */
  | { readonly genre: "panne" }
  /** Arrêtée à la demande pendant l'appel (désinstallation, fermeture de la Planche). */
  | { readonly genre: "arrete" };

/** Ce que l'hôte attend d'un Worker (injecté dans les tests). */
export interface WorkerExtension {
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  postMessage(m: MessageProtocole | DemarrageExtension): void;
  terminate(): void;
}

export interface HoteExtension {
  /**
   * Adresse une demande (commande) ou un événement à l'extension ; la démarre au besoin. `libelle` nomme l'opération
   * automatique éventuelle dans l'historique (défaut : le nom de l'appel).
   * `delaiMs` remplace le délai de la sorte d'appel : un événement d'outil (lot 6) est une demande — il rend la
   * description de l'outil — bornée à 1 s.
   */
  readonly appeler: (sorte: "demande" | "evenement", nom: string, donnees?: unknown, libelle?: string, marque?: unknown, delaiMs?: number) => Promise<IssueAppelExtension>;
  /** Arrête l'espace isolé ; l'appel en cours et ceux qui attendaient rendent « arrete ». Un appel fait ensuite la redémarre. */
  readonly arreter: () => void;
  readonly enMarche: () => boolean;
}

export interface OptionsHoteExtension {
  readonly creer?: () => WorkerExtension;
  readonly delaiCommandeMs?: number;
  readonly delaiEvenementMs?: number;
  /** Ligne écrite par l'extension (`planche.afficher`). */
  readonly surJournal?: (ligne: string) => void;
  /** Ce que la Planche prête à l'extension (modèle, sélection). Absent : seules les demandes sans modèle sont servies. */
  readonly acces?: AccesPlanche;
  /** Issue d'une échéance de minuterie (lot 7) : la Planche prévient l'utilisateur si l'extension a été arrêtée. */
  readonly surEcheance?: (issue: IssueAppelExtension) => void;
  /** Nom, dans l'historique, du pas que fait une échéance qui modifie le dessin (défaut : le nom de l'événement). */
  readonly libelleEcheance?: string;
  /** Avis demandé par l'extension (`message.afficher`). Absent : la demande est refusée. */
  readonly surAvis?: (avis: AvisExtension) => void;
  /**
   * Fenêtre de saisie demandée par l'extension (`saisie.demander`) : `reponse` rend les valeurs, ou `null` si
   * l'utilisateur annule ; `fermer` la retire quand l'appel prend fin avant la réponse. Absent : la demande est refusée.
   */
  readonly saisir?: (demande: DemandeSaisie) => { readonly reponse: Promise<ValeursSaisie | null>; readonly fermer: () => void };
  /**
   * Fichiers (lot 7, permission « fichiers ») : la Planche montre la fenêtre et l'utilisateur choisit. `ouvrir` rend le
   * fichier choisi (`{ nom, texte }`, relu ici avant d'atteindre l'extension) ou `null` ; `enregistrer` rend vrai si
   * l'utilisateur a accepté. Comme la saisie : pendant une commande, une fenêtre à la fois, délai suspendu. Absent : les
   * demandes sont refusées.
   */
  readonly fichiers?: {
    readonly ouvrir: (demande: DemandeOuverture) => { readonly reponse: Promise<unknown>; readonly fermer: () => void };
    readonly enregistrer: (demande: DemandeEnregistrement) => { readonly reponse: Promise<boolean>; readonly fermer: () => void };
    /** (1.2) Range tel quel en base le fichier choisi ; absent : l'extension reçoit `archive: null` et son motif. */
    /** `octets` : le fichier tel qu'il a été lu sur le disque, quand la fenêtre les rend (sinon le texte encodé en UTF-8). */
    readonly archiver?: (fichier: FichierLu, octets?: Uint8Array) => Promise<IssueArchive>;
  };
  /**
   * Panneau (lot 4, permission « panneau ») : `envoyer` remet des données à la page du panneau et rend faux s'il n'est
   * pas ouvert ; `ouvrir` l'ouvre dans la colonne. L'identifiant est déjà relu : c'est un panneau de la fiche. Absent :
   * les demandes sont refusées.
   */
  readonly panneau?: {
    readonly envoyer: (panneau: string, donnees: unknown) => boolean;
    readonly ouvrir: (panneau: string) => boolean;
  };
}

const creerWorkerExtension = (): WorkerExtension => new Worker(new URL("./extension-planche.worker.ts", import.meta.url), { type: "module", name: "fadi-planche-extension" }) as unknown as WorkerExtension;

const lireDemarrage = (v: unknown): DemarrageRendu | null => {
  if (!v || typeof v !== "object" || typeof (v as { demarre?: unknown }).demarre !== "boolean") return null;
  const r = v as DemarrageRendu;
  if (r.demarre) return { demarre: true, erreur: null };
  const e = r.erreur as { genre?: unknown; texte?: unknown } | null;
  if (e?.genre === "import") return { demarre: false, erreur: { genre: "import" } };
  if ((e?.genre === "syntaxe" || e?.genre === "execution") && typeof e.texte === "string") return { demarre: false, erreur: { genre: e.genre, texte: e.texte.slice(0, 500) } };
  return null;
};

export function creerHoteExtension(paquet: PaquetExtension, o: OptionsHoteExtension = {}): HoteExtension {
  const delais = { demande: o.delaiCommandeMs ?? BORNES_EXTENSION.delaiCommandeMs, evenement: o.delaiEvenementMs ?? BORNES_EXTENSION.delaiEvenementMs };
  let w: WorkerExtension | null = null;
  let numero = 0;
  let lignes = 0;
  /** Appel en cours : au plus un, les autres attendent dans `file`. */
  const services = o.acces ? creerServicesExtension(paquet.fiche, o.acces) : null;
  /** Minuteries armées par l'extension (lot 7) : numéro → minuterie du navigateur ; perdues à l'arrêt de l'espace isolé. */
  const minuteries = new Map<number, ReturnType<typeof setTimeout>>();
  let numeroMinuterie = 0;
  /** Marque de l'appel en cours (rang dans une chaîne de réactions) : une minuterie armée pendant cet appel la garde. */
  let marqueEnCours: unknown;
  let enCours: { readonly id: number | "demarrage"; readonly sorte: "demande" | "evenement" | "demarrage"; readonly clore: (i: IssueAppelExtension | DemarrageRendu) => void; readonly suspendre: () => void; readonly reprendre: () => void } | null = null;
  let avis = 0;
  /** Fenêtre de saisie ouverte pour l'appel en cours : au plus une. */
  let saisie: { readonly fermer: () => void } | null = null;
  /** (1.1) Fichiers en flux de l'appel en cours : oubliés à la fin de l'appel. */
  const reserve = creerReserveFichiers();
  const fermerSaisie = () => {
    const s = saisie;
    saisie = null;
    s?.fermer();
  };
  let file: Promise<unknown> = Promise.resolve();
  /** Avance à chaque arrêt demandé : un appel mis en file avant l'arrêt ne relance pas l'extension. */
  let epoque = 0;

  const eteindre = () => {
    for (const m of minuteries.values()) clearTimeout(m);
    minuteries.clear();
    if (!w) return;
    w.onmessage = null;
    w.onerror = null;
    w.terminate();
    w = null;
  };

  /** Avis et saisie : servis pendant un appel seulement, relus avant d'atteindre la Planche. */
  const servirMessages = (m: Extract<MessageProtocole, { sorte: "demande" }>) => {
    const appel = enCours;
    if (!appel || appel.id === "demarrage") return void w?.postMessage(refusProtocole(m.id, "demande_inconnue", m.nom));
    if (m.nom === "message.afficher") {
      if (!o.surAvis) return void w?.postMessage(refusProtocole(m.id, "demande_inconnue", m.nom));
      const lu = lireAvisExtension(m.donnees);
      if (!lu) return void w?.postMessage(refusProtocole(m.id, "argument_invalide", `avis : texte de 1 à ${BORNES_SAISIE.texte} caractères, genre « info » ou « alerte »`));
      // Avis bornés par appel, comme le journal : au-delà, ils sont ignorés.
      if (avis++ < BORNES_SAISIE.avisParAppel) o.surAvis(lu);
      return void w?.postMessage(reponseProtocole(m.id));
    }
    if (!o.saisir) return void w?.postMessage(refusProtocole(m.id, "demande_inconnue", m.nom));
    if (appel.sorte !== "demande") return void w?.postMessage(refusProtocole(m.id, "argument_invalide", "saisie : pendant une commande seulement"));
    if (saisie) return void w?.postMessage(refusProtocole(m.id, "argument_invalide", "saisie : une fenêtre est déjà ouverte"));
    const lu = lireDemandeSaisie(m.donnees);
    if (!lu.ok) return void w?.postMessage(refusProtocole(m.id, "argument_invalide", lu.detail));
    appel.suspendre();
    const ouverte = o.saisir(lu.demande);
    saisie = ouverte;
    void ouverte.reponse.then(
      (valeurs) => valeurs,
      () => null,
    ).then((valeurs) => {
      // Appel déjà clos (arrêt, panne) : la fenêtre a été refermée, la réponse n'intéresse plus personne.
      if (saisie !== ouverte) return;
      saisie = null;
      if (enCours !== appel) return;
      appel.reprendre();
      w?.postMessage(reponseProtocole(m.id, valeurs));
    });
  };

  /** Fichiers : comme la saisie — pendant une commande seulement, une fenêtre à la fois, délai suspendu. */
  const servirFichiers = (m: Extract<MessageProtocole, { sorte: "demande" }>) => {
    const appel = enCours;
    if (!o.fichiers || !appel || appel.id === "demarrage") return void w?.postMessage(refusProtocole(m.id, "demande_inconnue", m.nom));
    if (appel.sorte !== "demande") return void w?.postMessage(refusProtocole(m.id, "argument_invalide", "fichiers : pendant une commande seulement"));
    // (1.1) Morceaux d'un fichier en flux : sans fenêtre, servis tout de suite.
    if (m.nom === "fichiers.lire" || m.nom === "fichiers.ajouter" || m.nom === "fichiers.preparer") {
      const r = m.nom === "fichiers.lire" ? reserve.lire(m.donnees) : m.nom === "fichiers.ajouter" ? reserve.ajouter(m.donnees) : reserve.preparer();
      return void w?.postMessage(r.ok ? reponseProtocole(m.id, r.valeur) : refusProtocole(m.id, "argument_invalide", r.detail));
    }
    if (saisie) return void w?.postMessage(refusProtocole(m.id, "argument_invalide", "fichiers : une fenêtre est déjà ouverte"));
    let ouverte: { readonly reponse: Promise<unknown>; readonly fermer: () => void };
    let rendre: (valeur: unknown) => MessageProtocole | Promise<MessageProtocole>;
    if (m.nom === "fichiers.ouvrir") {
      const lu = lireDemandeOuverture(m.donnees);
      if (!lu.ok) return void w?.postMessage(refusProtocole(m.id, "argument_invalide", lu.detail));
      rendre = (valeur) => {
        const fichier = lireFichierChoisi(valeur, lu.demande);
        if (!fichier.ok) return refusProtocole(m.id, "argument_invalide", fichier.detail);
        if (lu.demande.archiver && fichier.fichier) {
          // (1.2) Archivé tel quel avant d'être rendu ; un envoi qui échoue rend le motif, jamais une exception.
          const f = fichier.fichier;
          const archiver = o.fichiers?.archiver;
          if (!archiver) return reponseProtocole(m.id, fichierArchive(f, { ok: false, motif: "archivage indisponible dans cette Planche" }));
          const brut = (valeur as { octets?: unknown } | null)?.octets;
          return archiver(f, brut instanceof Uint8Array ? brut : undefined).then((issue) => reponseProtocole(m.id, fichierArchive(f, issue)), () => reponseProtocole(m.id, fichierArchive(f, { ok: false, motif: "archivage impossible" })));
        }
        if (!lu.demande.flux || !fichier.fichier) return reponseProtocole(m.id, fichier.fichier);
        // En flux, l'extension reçoit un jeton : le texte reste ici jusqu'à la fin de l'appel.
        const retenu = reserve.retenir(fichier.fichier);
        return retenu ? reponseProtocole(m.id, retenu) : refusProtocole(m.id, "argument_invalide", `${BORNES_FICHIER.jetons} fichiers en flux au plus pendant une commande`);
      };
      appel.suspendre();
      ouverte = o.fichiers.ouvrir(lu.demande);
    } else {
      const lu = lireDemandeEnregistrement(m.donnees, reserve.texteDe);
      if (!lu.ok) return void w?.postMessage(refusProtocole(m.id, "argument_invalide", lu.detail));
      rendre = (valeur) => reponseProtocole(m.id, valeur === true);
      appel.suspendre();
      ouverte = o.fichiers.enregistrer(lu.demande);
    }
    saisie = ouverte;
    void ouverte.reponse.then(
      (valeur) => valeur,
      () => null,
    ).then(async (valeur) => {
      if (saisie !== ouverte) return;
      // (1.2) Pendant l'archivage, l'appel reste suspendu et la fenêtre comptée comme ouverte.
      const message = await rendre(valeur);
      if (saisie !== ouverte) return;
      saisie = null;
      if (enCours !== appel) return;
      appel.reprendre();
      w?.postMessage(message);
    });
  };

  /** Panneau : données envoyées à la page, ouverture — pendant un appel seulement, comme toute demande. */
  const servirPanneau = (m: Extract<MessageProtocole, { sorte: "demande" }>) => {
    if (!o.panneau || !enCours || enCours.id === "demarrage") return void w?.postMessage(refusProtocole(m.id, "demande_inconnue", m.nom));
    const lu = lireEnvoiPanneau(paquet.fiche, m.donnees);
    if (!lu.ok) return void w?.postMessage(refusProtocole(m.id, "argument_invalide", lu.detail));
    w?.postMessage(reponseProtocole(m.id, m.nom === "panneau.ouvrir" ? o.panneau.ouvrir(lu.panneau) : o.panneau.envoyer(lu.panneau, lu.donnees)));
  };

  /** Minuteries : armées pendant un appel seulement ; à l'échéance, l'extension reçoit « minuterie.echeance ». */
  const servirMinuterie = (m: Extract<MessageProtocole, { sorte: "demande" }>) => {
    if (m.nom === "minuterie.annuler") {
      const id = (m.donnees as { id?: unknown } | null)?.id;
      if (typeof id === "number" && minuteries.has(id)) {
        clearTimeout(minuteries.get(id));
        minuteries.delete(id);
      }
      return void w?.postMessage(reponseProtocole(m.id));
    }
    if (!enCours || enCours.id === "demarrage") return void w?.postMessage(refusProtocole(m.id, "demande_inconnue", m.nom));
    const delai = lireDelaiMinuterie(m.donnees);
    if (delai === null) return void w?.postMessage(refusProtocole(m.id, "argument_invalide", `delaiMs : de 0 à ${BORNES_MINUTERIE.delaiMaxMs} millisecondes`));
    if (minuteries.size >= BORNES_MINUTERIE.actives) return void w?.postMessage(refusProtocole(m.id, "argument_invalide", `${BORNES_MINUTERIE.actives} minuteries au plus à la fois`));
    const id = ++numeroMinuterie;
    const marque = marqueEnCours;
    minuteries.set(
      id,
      setTimeout(() => {
        if (!minuteries.delete(id)) return;
        void appeler("evenement", "minuterie.echeance", { id }, o.libelleEcheance, marque).then((issue) => o.surEcheance?.(issue));
      }, delai),
    );
    w?.postMessage(reponseProtocole(m.id, id));
  };

  /** Sert une demande de l'extension : journal, avis et saisie ici ; modèle, opération et sélection par les services. */
  const servir = (m: Extract<MessageProtocole, { sorte: "demande" }>) => {
    const jugement = jugerDemandeExtension(paquet.fiche, m.nom);
    if (!jugement.ok) return void w?.postMessage(refusProtocole(m.id, jugement.erreur, jugement.detail));
    if (m.nom === "message.afficher" || m.nom === "saisie.demander") return servirMessages(m);
    if (m.nom === "minuterie.armer" || m.nom === "minuterie.annuler") return servirMinuterie(m);
    if (m.nom.startsWith("fichiers.")) return servirFichiers(m);
    if (m.nom === "panneau.envoyer" || m.nom === "panneau.ouvrir") return servirPanneau(m);
    if (m.nom !== "journal.afficher") {
      // Hors d'un appel (aucune commande ni événement en cours), une extension ne lit ni ne modifie rien.
      if (!services || !enCours || enCours.id === "demarrage") return void w?.postMessage(refusProtocole(m.id, "demande_inconnue", m.nom));
      // Le temps que la Planche passe à servir (un plan de milliers de segments) n'est pas celui de l'extension : le
      // délai de l'appel est suspendu pendant ce temps.
      const appel = enCours;
      appel.suspendre();
      let r: ReturnType<typeof services.servir>;
      try {
        r = services.servir(m.nom, m.donnees);
      } finally {
        appel.reprendre();
      }
      return void w?.postMessage(r.ok ? reponseProtocole(m.id, r.resultat) : refusProtocole(m.id, r.erreur, r.detail));
    }
    const ligne = (m.donnees as { ligne?: unknown } | null)?.ligne;
    if (typeof ligne !== "string") return void w?.postMessage(refusProtocole(m.id, "argument_invalide", "ligne"));
    // Journal borné par appel, comme celui d'un script personnel : au-delà, les lignes sont ignorées.
    if (lignes++ < MAX_LIGNES_JOURNAL) o.surJournal?.(ligne.slice(0, MAX_LONGUEUR_LIGNE_JOURNAL));
    w?.postMessage(reponseProtocole(m.id));
  };

  const recevoir = (brut: unknown) => {
    if (enCours?.id === "demarrage") {
      const d = lireDemarrage(brut);
      // Avant la réponse au démarrage, le code de l'extension peut déjà écrire au journal.
      if (d) return enCours.clore(d);
    }
    const m = lireMessageProtocole(brut);
    if (!m) return;
    if (m.sorte === "demande") return servir(m);
    if (m.sorte !== "reponse" || !enCours || enCours.id !== m.id) return;
    enCours.clore(m.ok ? { genre: "fini", resultat: m.resultat } : { genre: "erreur", nom: m.erreur!.nom, detail: m.erreur!.detail });
  };

  /** Attend une issue du Worker, bornée par `delai` ; au dépassement ou à la panne, l'espace isolé est arrêté. */
  const attendre = <T extends IssueAppelExtension | DemarrageRendu>(id: number | "demarrage", sorte: "demande" | "evenement" | "demarrage", delai: number, envoyer: () => void): Promise<T | IssueAppelExtension> =>
    new Promise((resolve) => {
      let fini = false;
      const clore = (i: T | IssueAppelExtension) => {
        if (fini) return;
        fini = true;
        clearTimeout(minuterie);
        enCours = null;
        fermerSaisie();
        reserve.vider();
        resolve(i);
      };
      const depasser = () => {
        eteindre();
        clore({ genre: "delai" });
      };
      // Le délai ne court que pendant que l'extension travaille : une fenêtre de saisie ouverte le suspend.
      let reste = delai;
      let depuis = Date.now();
      let minuterie = setTimeout(depasser, reste);
      // Suspensions emboîtées (une fenêtre ouverte, et la Planche qui sert une demande) : le délai reprend à la dernière.
      let suspensions = 0;
      const suspendre = () => {
        if (suspensions++ > 0) return;
        clearTimeout(minuterie);
        reste = Math.max(0, reste - (Date.now() - depuis));
      };
      const reprendre = () => {
        if (fini || suspensions === 0 || --suspensions > 0) return;
        depuis = Date.now();
        minuterie = setTimeout(depasser, reste);
      };
      enCours = { id, sorte, clore: clore as (i: IssueAppelExtension | DemarrageRendu) => void, suspendre, reprendre };
      try {
        envoyer();
      } catch {
        eteindre();
        clore({ genre: "panne" });
      }
    });

  const demarrer = async (): Promise<IssueAppelExtension | null> => {
    if (w) return null;
    try {
      w = (o.creer ?? creerWorkerExtension)();
    } catch {
      return { genre: "panne" };
    }
    w.onmessage = (e) => recevoir(e.data);
    w.onerror = () => {
      eteindre();
      enCours?.clore({ genre: "panne" });
    };
    const r = await attendre<DemarrageRendu>("demarrage", "demarrage", delais.demande, () => w!.postMessage({ demarrer: { fiche: { id: paquet.fiche.id, version: paquet.fiche.version }, code: paquet.code } }));
    if ("genre" in r) return r;
    if (r.demarre) return null;
    eteindre();
    return { genre: "demarrage", erreur: r.erreur! };
  };

  const appeler: HoteExtension["appeler"] = (sorte, nom, donnees = null, libelle = nom, marque = undefined, delaiMs = undefined) => {
    const demandeA = epoque;
    const suite = file.then(async (): Promise<IssueAppelExtension> => {
      if (demandeA !== epoque) return { genre: "arrete" };
      lignes = 0;
      avis = 0;
      const refusDemarrage = await demarrer();
      if (refusDemarrage) return refusDemarrage;
      if (demandeA !== epoque) return { genre: "arrete" };
      const id = ++numero;
      // Une réaction à un événement qui modifie le dessin le fait dans une opération discrète, rattachée au pas de
      // l'utilisateur ; l'échéance d'une minuterie, qui arrive plus tard, fait son propre pas.
      services?.debutAppel(libelle, { discrete: sorte === "evenement" && nom !== "minuterie.echeance", marque });
      marqueEnCours = marque;
      const issue = await attendre<IssueAppelExtension>(id, sorte, delaiMs ?? delais[sorte], () => w!.postMessage(sorte === "demande" ? demandeProtocole(id, nom, donnees) : evenementProtocole(id, nom, donnees)));
      // Fin de l'appel : l'opération automatique est validée s'il a réussi, toute opération est abandonnée sinon.
      marqueEnCours = undefined;
      if (services && !services.finAppel(issue.genre === "fini")) return { genre: "erreur", nom: "operation_refusee", detail: "le dessin a changé pendant la commande" };
      return issue;
    });
    file = suite.catch(() => undefined);
    return suite;
  };

  return {
    appeler,
    arreter: () => {
      epoque += 1;
      services?.abandonner();
      eteindre();
      enCours?.clore({ genre: "arrete" });
    },
    enMarche: () => w !== null,
  };
}
