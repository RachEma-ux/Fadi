/**
 * Préférences d'outils du Sandbox (lot 5) : lues sur le serveur, par compte ; la dernière version reçue est gardée en
 * copie locale. Hors connexion ou en cas d'erreur, la copie locale sert ; si rien n'a jamais été reçu, le profil
 * Standard s'applique. Un changement est appliqué tout de suite puis enregistré, un enregistrement à la fois ; un
 * enregistrement manqué est renvoyé au retour du réseau, et seulement au compte à qui il appartient. Seules ces préférences passent par le serveur : le brouillon de dessin reste local.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PREFERENCES_SANDBOX_DEFAUT, lirePreferencesSandbox, type PreferencesSandbox } from "@parcours/sandbox-planche-model";
import { enregistrerPreferencesServeur, lirePreferencesServeur } from "./client";

/** Copie locale (stockage de l'appareil) de la dernière version reçue, et d'un changement pas encore enregistré. */
export const CLE_PREFERENCES = "fadi.sandbox.preferences";

/** `serveur` : à jour avec le compte ; `copie` : copie locale (hors connexion, erreur) ; `defaut` : rien reçu ; `enregistrement` : en cours. */
export type EtatPreferences = "chargement" | "serveur" | "copie" | "defaut" | "enregistrement";

interface Copie {
  readonly preferences: PreferencesSandbox;
  /** Un changement local attend d'être enregistré. */
  readonly enAttente: boolean;
  readonly recue: boolean;
  /**
   * Compte auquel la copie appartient (renvoyé par le serveur) ; `null` si aucun compte n'a encore répondu. Un changement
   * en attente n'est envoyé qu'au même compte : sur un navigateur partagé, la copie d'un autre compte est remplacée.
   */
  readonly compte: string | null;
}

function lireCopie(): Copie | null {
  try {
    const brut = window.localStorage.getItem(CLE_PREFERENCES);
    if (!brut) return null;
    const v = JSON.parse(brut) as { preferences?: unknown; enAttente?: unknown; recue?: unknown; compte?: unknown };
    return { preferences: lirePreferencesSandbox(v.preferences), enAttente: v.enAttente === true, recue: v.recue === true, compte: typeof v.compte === "string" ? v.compte : null };
  } catch {
    return null;
  }
}
function ecrireCopie(c: Copie): void {
  try {
    window.localStorage.setItem(CLE_PREFERENCES, JSON.stringify(c));
  } catch {
    // Stockage indisponible (navigation privée) : la préférence reste en mémoire pour la séance.
  }
}

export interface PreferencesSandboxEtat {
  readonly preferences: PreferencesSandbox;
  readonly etat: EtatPreferences;
  /** Applique un changement tout de suite et l'enregistre sur le compte. */
  readonly modifier: (p: PreferencesSandbox) => void;
  /** Retour au profil Standard, sans favori ni regroupement. */
  readonly reinitialiser: () => void;
}

export function usePreferencesSandbox(): PreferencesSandboxEtat {
  const depart = useRef(lireCopie());
  const [preferences, setPreferences] = useState<PreferencesSandbox>(depart.current?.preferences ?? PREFERENCES_SANDBOX_DEFAUT);
  const [etat, setEtat] = useState<EtatPreferences>("chargement");
  const courante = useRef(preferences);
  const enAttente = useRef(depart.current?.enAttente ?? false);
  const recue = useRef(depart.current?.recue ?? false);
  const compte = useRef(depart.current?.compte ?? null);
  // Le compte connecté a répondu pendant cette séance : un changement en attente peut lui être envoyé.
  const compteConfirme = useRef(false);
  // Un changement fait pendant cette séance appartient au compte connecté, même avant sa réponse.
  const modifieIci = useRef(false);
  const enVol = useRef(false);
  const monte = useRef(false);
  const replie = () => setEtat(recue.current ? "copie" : "defaut");
  const copie = (p: PreferencesSandbox) => ecrireCopie({ preferences: p, enAttente: enAttente.current, recue: recue.current, compte: compte.current });

  /**
   * Un seul enregistrement à la fois : quand il revient, la dernière version demandée repart si elle a changé entre-temps.
   * Le dernier geste est donc toujours la dernière écriture sur le serveur.
   */
  const envoyer = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    setEtat("enregistrement");
    try {
      for (;;) {
        const p = courante.current;
        try {
          const r = await enregistrerPreferencesServeur(p);
          if (courante.current !== p) continue;
          enAttente.current = false;
          recue.current = true;
          compte.current = r.compte;
          copie(r.preferences);
          setEtat("serveur");
        } catch {
          if (courante.current !== p) continue;
          enAttente.current = true;
          copie(p);
          replie();
        }
        return;
      }
    } finally {
      enVol.current = false;
    }
  }, []);

  /** Lit le compte connecté ; envoie le changement en attente s'il est à ce compte, sinon prend la version du compte. */
  const synchroniser = useCallback(async (vivant: () => boolean) => {
    try {
      const r = await lirePreferencesServeur();
      if (!vivant()) return;
      compteConfirme.current = true;
      if (enAttente.current && (modifieIci.current || compte.current === r.compte)) {
        compte.current = r.compte;
        return envoyer();
      }
      compte.current = r.compte;
      enAttente.current = false;
      recue.current = true;
      courante.current = r.preferences;
      setPreferences(r.preferences);
      copie(r.preferences);
      setEtat("serveur");
    } catch {
      if (vivant()) replie();
    }
  }, [envoyer]);

  useEffect(() => {
    let vivant = true;
    monte.current = true;
    void synchroniser(() => vivant);
    const auRetour = () => {
      if (!enAttente.current) return;
      if (compteConfirme.current) void envoyer();
      else void synchroniser(() => vivant);
    };
    window.addEventListener("online", auRetour);
    return () => {
      vivant = false;
      monte.current = false;
      window.removeEventListener("online", auRetour);
    };
  }, [envoyer, synchroniser]);

  const modifier = useCallback((p: PreferencesSandbox) => {
    courante.current = p;
    enAttente.current = true;
    modifieIci.current = true;
    setPreferences(p);
    copie(p);
    // Compte pas encore confirmé (serveur injoignable à l'ouverture) : on le lit d'abord, le changement part ensuite.
    if (compteConfirme.current) void envoyer();
    else void synchroniser(() => monte.current);
  }, [envoyer, synchroniser]);
  const reinitialiser = useCallback(() => modifier(PREFERENCES_SANDBOX_DEFAUT), [modifier]);
  return { preferences, etat, modifier, reinitialiser };
}
