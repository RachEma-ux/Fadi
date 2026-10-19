/**
 * Avis non bloquant « une révision plus récente existe » (I.5-02) : la tête de la variante est relue toutes les 30 s
 * tant que la page est visible, et au retour sur la page (focus, onglet de nouveau visible). Si elle n'est plus celle
 * affichée, un avis propose « Recharger » ; le brouillon n'est jamais remplacé sans ce geste (et une confirmation s'il
 * contient des modifications non enregistrées). Le serveur reste seul juge : rien n'est fusionné ici.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import "../planche2d/liste-elements.css";

export const INTERVALLE_TETE_MS = 30_000;

export interface PropsAvisRevision {
  projectId: string;
  studyId: string;
  variantId: string;
  /** Tête connue de l'espace de travail (celle du contexte chargé). */
  teteAffichee: string;
  /** Faux pendant une sauvegarde, sur une révision historique ou après un conflit déjà signalé. */
  actif: boolean;
  nonEnregistre: boolean;
  /** Relit la version serveur (contexte et brouillon neufs). */
  surRecharger: () => Promise<void>;
}

/** Vrai si la tête lue au serveur n'est plus celle affichée. */
export const teteDepassee = (lue: string | null, affichee: string): boolean => lue !== null && lue !== affichee;

export function AvisRevision({ projectId, studyId, variantId, teteAffichee, actif, nonEnregistre, surRecharger }: PropsAvisRevision) {
  const [lue, setLue] = useState<string | null>(null);
  const [etat, setEtat] = useState("");
  const [enCours, setEnCours] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  // Une lecture partie avant un changement de tête (sauvegarde, rechargement) est ignorée : elle décrirait l'ancienne.
  const tete = useRef(teteAffichee);
  useEffect(() => { tete.current = teteAffichee; setLue(null); }, [teteAffichee]);
  useEffect(() => {
    if (!actif) return;
    let vivant = true, enVol = false;
    const lire = () => {
      if (enVol || document.visibilityState !== "visible") return;
      enVol = true;
      const depart = tete.current;
      void api.studioVariants(projectId, studyId)
        .then((r) => { const v = r.variants.find((x) => x.id === variantId); if (vivant && v && tete.current === depart) setLue(v.headRevisionId); })
        .catch(() => { /* lecture indisponible : l'avis attend la prochaine lecture */ })
        .finally(() => { enVol = false; });
    };
    const minuterie = window.setInterval(lire, INTERVALLE_TETE_MS);
    const visible = () => { if (document.visibilityState === "visible") lire(); };
    window.addEventListener("focus", lire);
    document.addEventListener("visibilitychange", visible);
    return () => { vivant = false; window.clearInterval(minuterie); window.removeEventListener("focus", lire); document.removeEventListener("visibilitychange", visible); };
  }, [actif, projectId, studyId, variantId]);
  const montre = actif && teteDepassee(lue, teteAffichee);
  async function recharger() {
    if (nonEnregistre && !window.confirm("Recharger la version serveur abandonne les modifications non enregistrées de ce brouillon. Continuer ?")) return;
    setEnCours(true);
    try { await surRecharger(); setLue(null); setEtat("Version serveur rechargée."); zone.current?.focus(); }
    catch { setEtat("Rechargement impossible. Réessayez."); }
    finally { setEnCours(false); }
  }
  return <div ref={zone} tabIndex={-1} className="studio-avis-revision-zone" data-studio-avis-revision-zone>
    {montre && <div className="studio-info studio-avis-revision" data-studio-avis-revision={lue ?? undefined}>
      <span>{nonEnregistre ? "Une révision plus récente existe sur le serveur. Votre brouillon non enregistré est conservé ; l’enregistrer signalera un conflit." : "Une révision plus récente existe sur le serveur."}</span>
      <button type="button" onClick={() => void recharger()} disabled={enCours} data-studio-recharger-revision>Recharger</button>
    </div>}
    <p className="sr-only" role="status" aria-live="polite">{montre ? "Une révision plus récente existe sur le serveur." : etat}</p>
  </div>;
}
