/**
 * Enregistrement explicite d'une variante par enveloppes de commandes (`studio-commands/1`) sur la révision de tête.
 * Au-delà de 500 commandes, les lots partent dans l'ordre (`import/envoi.ts`), chacun sur la révision produite par le
 * précédent. Un nouvel essai après une erreur réseau rejoue le même lot (même requestId) : jamais de double effet.
 * Un enregistrement partiel rebase le brouillon sur la dernière révision confirmée, avec les seules commandes non
 * envoyées en attente. Le serveur reste seul juge (conflit, refus) ; rien n'est envoyé sans « Enregistrer ».
 */
import { useRef, useState, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type StudioContext } from "../../../lib/api";
import { accuserLot, commandesNonEnvoyees, enveloppeSuivante, envoiPartiel, planEnvoi, type PlanEnvoi } from "../import/envoi";
import { appliquerBrouillon, commandesEnAttente, creerBrouillon, type Brouillon } from "../planche2d/brouillon";

export interface OptionsEnregistrement {
  projectId: string;
  studyId: string;
  variantId: string;
  historical: boolean;
  context: StudioContext | null;
  brouillon: Brouillon | null;
  /** Faux après démontage : aucune mise à jour d'état. */
  alive: MutableRefObject<boolean>;
  setError: (message: string) => void;
  setInfo: (message: string) => void;
  /** Version serveur relue après un enregistrement complet : nouveau contexte et brouillon neuf. */
  surVersionServeur: (current: StudioContext) => void;
  /** Enregistrement partiel : contexte du dernier lot confirmé et brouillon rebasé. */
  surRebase: (accuse: StudioContext, rebase: Brouillon) => void;
}

export function useEnregistrement(o: OptionsEnregistrement) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const envelope = useRef<PlanEnvoi | null>(null);
  // Contexte rendu par le dernier lot confirmé : base du brouillon si un lot suivant est refusé.
  const dernierAccuse = useRef<StudioContext | null>(null);
  const saving = useRef(false);

  async function save() {
    const { projectId, studyId, variantId, context, brouillon, alive, setError, setInfo } = o;
    if (!context || !brouillon || o.historical || saving.current) return;
    saving.current = true;
    // Un nouvel essai après une erreur réseau rejoue le même lot (même requestId) : jamais de double effet. Au-delà de
    // 500 commandes, les lots partent dans l'ordre, chacun sur la révision produite par le précédent.
    if (!envelope.current) { envelope.current = planEnvoi(commandesEnAttente(brouillon), context.revision.id, () => crypto.randomUUID()); dernierAccuse.current = null; }
    setPending(true); setError(""); setInfo("");
    try {
      for (let lot = enveloppeSuivante(envelope.current); lot; lot = enveloppeSuivante(envelope.current)) {
        const accuse = await api.studioCommands(projectId, studyId, variantId, lot);
        envelope.current = accuserLot(envelope.current, accuse.revision.id);
        dernierAccuse.current = accuse;
        if (!alive.current) return;
      }
      // L'historique et la tête ont changé côté serveur : les listes affichées sont relues.
      void client.invalidateQueries({ queryKey: ["studio-revisions", projectId, studyId, variantId] });
      void client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId] });
      // A replay acknowledges its original revision, which may no longer be the head.
      let current: StudioContext;
      try { current = await api.studioContext(projectId, studyId, variantId); }
      catch {
        if (alive.current) { setUncertain(true); setError("Sauvegarde reçue, mais version courante indisponible. Réessayez la même sauvegarde."); }
        return;
      }
      if (!alive.current) return;
      o.surVersionServeur(current);
      setUncertain(false); envelope.current = null; setSaved(true);
    }
    catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status < 500 && e.status !== 408) {
        const plan = envelope.current, accuse = dernierAccuse.current;
        setUncertain(false); envelope.current = null; dernierAccuse.current = null;
        if (plan && accuse && envoiPartiel(plan)) {
          // Les premiers lots sont enregistrés : le brouillon repart de la dernière révision confirmée, avec les seules
          // commandes non envoyées en attente (un pas annulable). Rien n'est envoyé de nouveau sans « Enregistrer ».
          const reste = commandesNonEnvoyees(plan);
          let rebase = creerBrouillon(accuse.revision.document);
          try { rebase = appliquerBrouillon(rebase, reste); } catch { /* impossible en pratique : mêmes commandes, même ordre */ }
          o.surRebase(accuse, rebase);
          void client.invalidateQueries({ queryKey: ["studio-revisions", projectId, studyId, variantId] });
          void client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId] });
          const conflit = e.status === 409;
          setBlocked(conflit || e.status === 403 || e.status === 401);
          setError(conflit
            ? `Enregistrement partiel : ${plan.envoyes} lot(s) sur ${plan.lots.length} enregistré(s), puis une autre révision est devenue la version courante. Les ${reste.length} commande(s) non envoyée(s) restent dans ce brouillon, sur votre dernière révision enregistrée ; recharger la version serveur les perdra.`
            : `Enregistrement partiel : ${plan.envoyes} lot(s) sur ${plan.lots.length} enregistré(s), la suite est refusée. Les ${reste.length} commande(s) non envoyée(s) restent en attente dans le brouillon, sur la dernière révision enregistrée.`);
          return;
        }
        setBlocked(e.status === 409 || e.status === 403 || e.status === 401);
        setError(e.status === 409
          ? (e.code === "stale_revision" ? "Conflit de révision : une autre révision est devenue la version courante. Votre brouillon est conservé et n’a rien écrasé." : "Conflit de révision. Le brouillon est conservé.")
          : "Enregistrement refusé. Le brouillon reste non enregistré.");
      } else { setUncertain(true); setError("Confirmation serveur indisponible. Réessayez la même sauvegarde avant de continuer."); }
    }
    finally { saving.current = false; if (o.alive.current) setPending(false); }
  }

  return { pending, uncertain, blocked, saved, setSaved, save };
}
