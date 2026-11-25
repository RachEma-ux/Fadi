/**
 * Hôte d'une extension de la Planche (protocole 1.0, lot 1) : tient l'espace isolé d'une extension
 * (`extension-planche.worker.ts`) pendant la séance et lui parle par messages.
 *
 *  - l'espace isolé démarre au premier appel, pas avant (une extension installée mais inemployée ne coûte rien) ;
 *  - les appels passent un par un ; chacun a sa limite de temps — 5 s pour une demande (commande), 1 s pour un
 *    événement (décision du 25 novembre 2026). Au dépassement, l'espace isolé est arrêté, l'appel rend « delai », et
 *    l'extension redémarre au prochain appel ;
 *  - tout message reçu est relu (`lireMessageProtocole`) ; une demande de l'extension n'est servie que si elle figure à
 *    la table du protocole et que la fiche porte la permission (`jugerDemandeExtension`).
 *
 * Aucune interface ici : le branchement dans la Planche (commandes, journal affiché) arrive avec le lot des commandes.
 */
import {
  BORNES_EXTENSION, MAX_LIGNES_JOURNAL, MAX_LONGUEUR_LIGNE_JOURNAL, demandeProtocole, evenementProtocole, jugerDemandeExtension, lireMessageProtocole,
  refusProtocole, reponseProtocole, type ErreurDemarrageExtension, type ErreurProtocole, type MessageProtocole, type PaquetExtension,
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
  /** Adresse une demande (commande) ou un événement à l'extension ; la démarre au besoin. */
  readonly appeler: (sorte: "demande" | "evenement", nom: string, donnees?: unknown) => Promise<IssueAppelExtension>;
  /** Arrête l'espace isolé ; un appel en cours rend « arrete ». Sans effet s'il est déjà arrêté. */
  readonly arreter: () => void;
  readonly enMarche: () => boolean;
}

export interface OptionsHoteExtension {
  readonly creer?: () => WorkerExtension;
  readonly delaiCommandeMs?: number;
  readonly delaiEvenementMs?: number;
  /** Ligne écrite par l'extension (`planche.afficher`). */
  readonly surJournal?: (ligne: string) => void;
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
  let enCours: { readonly id: number | "demarrage"; readonly clore: (i: IssueAppelExtension | DemarrageRendu) => void } | null = null;
  let file: Promise<unknown> = Promise.resolve();

  const eteindre = () => {
    if (!w) return;
    w.onmessage = null;
    w.onerror = null;
    w.terminate();
    w = null;
  };

  /** Sert une demande de l'extension (ce lot : le journal seulement). */
  const servir = (m: Extract<MessageProtocole, { sorte: "demande" }>) => {
    const jugement = jugerDemandeExtension(paquet.fiche, m.nom);
    if (!jugement.ok) return void w?.postMessage(refusProtocole(m.id, jugement.erreur, jugement.detail));
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
  const attendre = <T extends IssueAppelExtension | DemarrageRendu>(id: number | "demarrage", delai: number, envoyer: () => void): Promise<T | IssueAppelExtension> =>
    new Promise((resolve) => {
      let fini = false;
      const clore = (i: T | IssueAppelExtension) => {
        if (fini) return;
        fini = true;
        clearTimeout(minuterie);
        enCours = null;
        resolve(i);
      };
      const minuterie = setTimeout(() => {
        eteindre();
        clore({ genre: "delai" });
      }, delai);
      enCours = { id, clore: clore as (i: IssueAppelExtension | DemarrageRendu) => void };
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
    const r = await attendre<DemarrageRendu>("demarrage", delais.demande, () => w!.postMessage({ demarrer: { fiche: { id: paquet.fiche.id, version: paquet.fiche.version }, code: paquet.code } }));
    if ("genre" in r) return r;
    if (r.demarre) return null;
    eteindre();
    return { genre: "demarrage", erreur: r.erreur! };
  };

  const appeler: HoteExtension["appeler"] = (sorte, nom, donnees = null) => {
    const suite = file.then(async (): Promise<IssueAppelExtension> => {
      lignes = 0;
      const refusDemarrage = await demarrer();
      if (refusDemarrage) return refusDemarrage;
      const id = ++numero;
      return attendre<IssueAppelExtension>(id, delais[sorte], () => w!.postMessage(sorte === "demande" ? demandeProtocole(id, nom, donnees) : evenementProtocole(id, nom, donnees)));
    });
    file = suite.catch(() => undefined);
    return suite;
  };

  return {
    appeler,
    arreter: () => {
      eteindre();
      enCours?.clore({ genre: "arrete" });
    },
    enMarche: () => w !== null,
  };
}
