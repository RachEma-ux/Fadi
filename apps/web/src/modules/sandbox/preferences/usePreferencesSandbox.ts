/**
 * Préférences d'outils du Sandbox (lot 5) : lues sur le serveur, par compte ; la dernière version reçue est gardée en
 * copie locale. Hors connexion ou en cas d'erreur, la copie locale sert ; si rien n'a jamais été reçu, le profil
 * Standard s'applique. Un changement est appliqué tout de suite puis enregistré ; un enregistrement manqué est
 * renvoyé au retour du réseau. Seules ces préférences passent par le serveur : le brouillon de dessin reste local.
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
}

function lireCopie(): Copie | null {
  try {
    const brut = window.localStorage.getItem(CLE_PREFERENCES);
    if (!brut) return null;
    const v = JSON.parse(brut) as { preferences?: unknown; enAttente?: unknown; recue?: unknown };
    return { preferences: lirePreferencesSandbox(v.preferences), enAttente: v.enAttente === true, recue: v.recue === true };
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
  const replie = () => setEtat(recue.current ? "copie" : "defaut");

  const envoyer = useCallback(async (p: PreferencesSandbox) => {
    setEtat("enregistrement");
    try {
      const r = await enregistrerPreferencesServeur(p);
      // Un changement plus récent a pu partir entre-temps : seule la dernière version demandée est gardée.
      if (courante.current !== p) return;
      enAttente.current = false;
      recue.current = true;
      ecrireCopie({ preferences: r.preferences, enAttente: false, recue: true });
      setEtat("serveur");
    } catch {
      if (courante.current !== p) return;
      enAttente.current = true;
      ecrireCopie({ preferences: p, enAttente: true, recue: recue.current });
      replie();
    }
  }, []);

  useEffect(() => {
    let vivant = true;
    (async () => {
      // Un changement fait hors connexion part d'abord ; sinon la version du compte remplace la copie locale.
      if (enAttente.current) return envoyer(courante.current);
      try {
        const r = await lirePreferencesServeur();
        if (!vivant || enAttente.current) return;
        courante.current = r.preferences;
        recue.current = true;
        setPreferences(r.preferences);
        ecrireCopie({ preferences: r.preferences, enAttente: false, recue: true });
        setEtat("serveur");
      } catch {
        if (vivant) replie();
      }
    })();
    const auRetour = () => {
      if (enAttente.current) void envoyer(courante.current);
    };
    window.addEventListener("online", auRetour);
    return () => {
      vivant = false;
      window.removeEventListener("online", auRetour);
    };
  }, [envoyer]);

  const modifier = useCallback((p: PreferencesSandbox) => {
    courante.current = p;
    enAttente.current = true;
    setPreferences(p);
    ecrireCopie({ preferences: p, enAttente: true, recue: recue.current });
    void envoyer(p);
  }, [envoyer]);
  const reinitialiser = useCallback(() => modifier(PREFERENCES_SANDBOX_DEFAUT), [modifier]);
  return { preferences, etat, modifier, reinitialiser };
}
