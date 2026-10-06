/**
 * Synchronisation des ensembles d'affichage personnels entre les appareils d'un même compte (D-118, DA-05-03).
 *
 * Chaque appareil garde sa liste (préférences locales) et la dernière liste échangée avec le serveur (« base ») avec
 * sa version. À l'ouverture de l'Atelier, au retour du réseau, au retour sur l'onglet et après chaque changement
 * local, l'appareil relit le serveur : sans changement local, il adopte la liste du serveur ; avec des changements
 * locaux, il fusionne à trois voies par nom (ajouts et modifications locaux gardés, suppressions locales appliquées
 * si le serveur n'a pas changé l'ensemble entre-temps) puis enregistre sur la version lue. Un conflit (un autre
 * appareil a enregistré entre-temps) relance la lecture. Hors ligne : rien n'est perdu, l'envoi attend le réseau.
 */
import { api, ApiError, type EnsemblesPersonnels } from "../../../lib/api";
import { etatUi, type EnsembleLocal } from "./etat-ui";

type Liste = EnsemblesPersonnels["ensembles"];
const CLE = "fadi.atelier.ensembles-sync";

interface Base {
  version: string | null;
  ensembles: Liste;
}

const normaliser = (l: readonly EnsembleLocal[]): Liste => l.map((e) => ({ nom: e.nom, niveauId: e.niveauId ?? null, classesMasquees: [...e.classesMasquees], calquesMasques: [...e.calquesMasques] }));
const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Fusion à trois voies par nom : serveur, local, base commune. */
export function fusionnerEnsembles(serveur: Liste, local: Liste, base: Liste): Liste {
  const parNom = (l: Liste) => new Map(l.map((e) => [e.nom, e]));
  const B = parNom(base);
  const L = parNom(local);
  const out = new Map(serveur.map((e) => [e.nom, e]));
  for (const e of local) if (!memes(B.get(e.nom), e)) out.set(e.nom, e); // ajouté ou modifié ici
  for (const [nom, b] of B) if (!L.has(nom) && memes(out.get(nom), b)) out.delete(nom); // supprimé ici, inchangé ailleurs
  return [...out.values()];
}

function lireBase(): Base {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CLE) : null;
    const b = raw ? (JSON.parse(raw) as Base) : null;
    return b && Array.isArray(b.ensembles) ? b : { version: null, ensembles: [] };
  } catch {
    return { version: null, ensembles: [] };
  }
}

function ecrireBase(b: Base): void {
  try {
    localStorage?.setItem(CLE, JSON.stringify(b));
  } catch {
    /* stockage indisponible : la synchronisation reprendra à la prochaine ouverture */
  }
}

let enCours: Promise<void> | null = null;
let relancer = false;

/** Une passe de synchronisation (une seule à la fois ; une demande pendant une passe en relance une après). */
export function synchroniserEnsembles(): Promise<void> {
  if (enCours) {
    relancer = true;
    return enCours;
  }
  enCours = (async () => {
    try {
      for (let essai = 0; essai < 3; essai++) {
        const serveur = await api.lireEnsemblesPersonnels();
        const base = lireBase();
        const local = normaliser(etatUi.get().ensembles);
        const changeIci = !memes(local, base.ensembles);
        if (serveur.version === base.version && !changeIci) return;
        const cible = serveur.version === base.version ? local : changeIci ? fusionnerEnsembles(serveur.ensembles, local, base.ensembles) : serveur.ensembles;
        if (!memes(cible, local)) etatUi.set({ ensembles: cible });
        if (!changeIci) {
          ecrireBase({ version: serveur.version, ensembles: cible });
          return;
        }
        try {
          const r = await api.enregistrerEnsemblesPersonnels(cible, serveur.version);
          ecrireBase({ version: r.version, ensembles: r.ensembles });
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) continue; // un autre appareil vient d'enregistrer : relire
          throw e;
        }
      }
    } catch {
      /* hors ligne, session expirée : la liste locale reste, l'envoi reprendra */
    } finally {
      enCours = null;
      if (relancer) {
        relancer = false;
        void synchroniserEnsembles();
      }
    }
  })();
  return enCours;
}

/** Branche la synchronisation : à l'appel, au retour du réseau ou de l'onglet, et après un changement local. */
export function brancherSyncEnsembles(): () => void {
  let precedent = JSON.stringify(etatUi.get().ensembles);
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  const desabonner = etatUi.subscribe(() => {
    const courant = JSON.stringify(etatUi.get().ensembles);
    if (courant === precedent) return;
    precedent = courant;
    if (minuterie) clearTimeout(minuterie);
    minuterie = setTimeout(() => void synchroniserEnsembles(), 600);
  });
  const reprise = () => void synchroniserEnsembles();
  const visible = () => {
    if (document.visibilityState === "visible") reprise();
  };
  window.addEventListener("online", reprise);
  document.addEventListener("visibilitychange", visible);
  void synchroniserEnsembles();
  return () => {
    desabonner();
    if (minuterie) clearTimeout(minuterie);
    window.removeEventListener("online", reprise);
    document.removeEventListener("visibilitychange", visible);
  };
}
