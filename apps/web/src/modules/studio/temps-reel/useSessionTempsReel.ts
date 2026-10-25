/**
 * Temps réel — branchement d'une variante Studio aux sessions en direct (RTC-2, Issue #283) : liste des sessions de la
 * variante (relue toutes les 15 s hors session), canal de la session rejointe, gestes HTTP (ouvrir, présentateur, hôte,
 * reprise, révision, clôture). `disponible` est faux tant que le serveur n'a pas le temps réel (drapeau absent) :
 * l'espace de travail n'affiche alors rien.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../lib/api";
import { apiTempsReel, type SessionListee } from "./api-temps-reel";
import { CanalTempsReel } from "./canal";
import { ETAT_INITIAL, type EtatSession } from "./etat-session";

export interface ActionsTempsReel {
  ouvrir(revisionId: string): Promise<void>;
  rejoindre(sessionId: string): void;
  quitter(): void;
  suivre(actif: boolean): void;
  presenter(userId: string | null): Promise<void>;
  transmettre(userId: string): Promise<void>;
  reprendre(): Promise<void>;
  passerRevision(revisionId: string): Promise<void>;
  clore(): Promise<void>;
}

export interface SessionTempsReel {
  disponible: boolean;
  sessions: SessionListee[];
  etat: EtatSession;
  canal: CanalTempsReel;
  actions: ActionsTempsReel;
  erreur: string | null;
  enCours: boolean;
  /** Suit la vue du présentateur (choix explicite, vrai à l'entrée). */
  suit: boolean;
}

/**
 * Un canal par variante, gardé au niveau du module : passer d'une révision à l'autre de la même variante remonte
 * l'espace de travail sans quitter la session ; le canal n'est fermé que s'il n'est pas repris dans les 2 s.
 */
const canaux = new Map<string, { canal: CanalTempsReel; liberation: ReturnType<typeof setTimeout> | null; usages: number }>();
function canalDe(cle: string): CanalTempsReel {
  let c = canaux.get(cle);
  if (!c) { c = { canal: new CanalTempsReel(), liberation: null, usages: 0 }; canaux.set(cle, c); }
  return c.canal;
}
function prendreCanal(cle: string): void {
  const c = canaux.get(cle);
  if (!c) return;
  if (c.liberation) { clearTimeout(c.liberation); c.liberation = null; }
  c.usages += 1;
}
function rendreCanal(cle: string): void {
  const c = canaux.get(cle);
  if (!c) return;
  c.usages -= 1;
  if (c.usages > 0) return;
  c.liberation = setTimeout(() => { c.canal.quitter(); canaux.delete(cle); }, 2000);
}

const message = (e: unknown) => (e instanceof ApiError ? e.serverMessage ?? `Refusé (${e.status}).` : "Serveur injoignable : réessayez.");

export function useSessionTempsReel(projectId: string, studyId: string, variantId: string, actif: boolean): SessionTempsReel {
  const cleCanal = `${projectId}:${variantId}`;
  const canal = useMemo(() => canalDe(cleCanal), [cleCanal]);
  const [etat, setEtat] = useState<EtatSession>(ETAT_INITIAL);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [suit, setSuit] = useState(true);
  const qc = useQueryClient();
  useEffect(() => canal.abonner(setEtat), [canal]);
  // Démontage (autre variante, autre page) : la session est quittée, sauf retour immédiat sur la même variante.
  useEffect(() => { prendreCanal(cleCanal); return () => rendreCanal(cleCanal); }, [cleCanal]);
  useEffect(() => { setSuit(canal.suit); }, [canal]);
  const enSession = etat.connexion !== "hors-session";
  const cle = ["temps-reel-sessions", projectId, variantId];
  const liste = useQuery({
    queryKey: cle, enabled: actif, retry: false, staleTime: 5_000,
    queryFn: () => apiTempsReel.sessions(projectId, variantId),
    refetchInterval: enSession ? false : 15_000,
  });
  const sessionId = etat.session?.id ?? null;
  const geste = useCallback(async (f: () => Promise<unknown>) => {
    setErreur(null); setEnCours(true);
    try { await f(); await qc.invalidateQueries({ queryKey: cle }); }
    catch (e) { setErreur(message(e)); }
    finally { setEnCours(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, projectId, variantId]);
  const actions: ActionsTempsReel = {
    ouvrir: (revisionId) => geste(async () => {
      const { session } = await apiTempsReel.ouvrir(projectId, { studyId, variantId, revisionId, requestId: `tr-${crypto.randomUUID()}` });
      setSuit(true); canal.rejoindre(session.id, true);
    }),
    rejoindre: (id) => { setErreur(null); setSuit(true); canal.rejoindre(id, true); },
    quitter: () => { canal.quitter(); void qc.invalidateQueries({ queryKey: cle }); },
    suivre: (a) => { setSuit(a); canal.suivrePresentateur(a); },
    presenter: (userId) => geste(() => apiTempsReel.presentateur(projectId, sessionId!, userId)),
    transmettre: (userId) => geste(() => apiTempsReel.hote(projectId, sessionId!, userId)),
    reprendre: () => geste(() => apiTempsReel.reprendre(projectId, sessionId!)),
    passerRevision: (revisionId) => geste(() => apiTempsReel.revision(projectId, sessionId!, revisionId)),
    clore: () => geste(() => apiTempsReel.clore(projectId, sessionId!)),
  };
  return { disponible: actif && Array.isArray(liste.data), sessions: liste.data ?? [], etat, canal, actions, erreur, enCours, suit };
}
