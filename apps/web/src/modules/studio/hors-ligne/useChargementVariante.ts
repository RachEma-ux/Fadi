/**
 * Ouverture d'une variante avec reprise hors ligne. La version serveur est lue d'abord ; elle est mémorisée sur
 * l'appareil, pour l'utilisateur connecté seulement, en vue d'une prochaine ouverture sans réseau. Un brouillon hors
 * ligne conservé (IndexedDB) de CET utilisateur est restauré :
 * - sur la tête serveur quand il en part encore ;
 * - sur sa propre base quand des enveloppes non confirmées attendent (elles sont rejouées, mêmes `requestId`) ;
 * - sur sa propre base, en conflit, quand la tête a avancé ailleurs : rien n'est envoyé ni écrasé.
 * Sans réseau, la dernière version lue (ou la base du brouillon) est ouverte ; si cette variante n'a jamais été lue
 * sur l'appareil par cet utilisateur, rien n'est affiché ni modifiable. Une révision historique (`?revision=`) se lit
 * comme avant. Sans utilisateur connu, rien n'est lu ni écrit sur l'appareil.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { api, type StudioContext } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { isNetworkError } from "../../../lib/reachability";
import { creerBrouillon, type Brouillon } from "../planche2d/brouillon";
import { refused } from "../variante/etat-variante";
import { navigateurEnLigne } from "./connexion";
import { cleVariante, restaurerBrouillon, type BrouillonHorsLigne, type ConflitHorsLigne } from "./persistance";
import { brouillonBrut, contexteMemorise, ErreurFileLocale, lireBrouillonHorsLigne, memoriserContexte, type BrouillonLu } from "./stockage";
import { signalerFileBloquee } from "./AvisFileLocale";
import type { PlanEnvoi } from "../import/envoi";
import { perfStudio } from "../chargement/perf";

export interface RepriseHorsLigne {
  plan: PlanEnvoi | null;
  /** Pas du brouillon déjà mis dans `plan`. */
  pasCouverts: number;
  conflit: ConflitHorsLigne | null;
  /** Un brouillon est conservé sur l'appareil pour cette variante. */
  conserve: boolean;
  /** Jeton de la ligne lue (comparer-puis-écrire entre onglets), null si aucune. */
  stamp: string | null;
  /** Ouverte depuis l'appareil faute de réseau (date de lecture), sinon null. */
  depuisCache: string | null;
}

export interface OptionsChargement {
  projectId: string;
  studyId: string;
  variantId: string;
  revisionId: string | null;
  alive: MutableRefObject<boolean>;
  setContext: (c: StudioContext) => void;
  setBrouillon: (b: Brouillon) => void;
  setLoadError: (e: unknown) => void;
  setError: (m: string) => void;
  setLoading: (v: boolean) => void;
  reprendre: (r: RepriseHorsLigne) => void;
  /** Mode autonome de la Console (aucun projet) : rien n'est lu ni restauré, le contexte local est déjà en place. */
  inactif?: boolean;
}

const restaurer = (base: StudioContext, h: BrouillonHorsLigne) => restaurerBrouillon(base.revision.document, h.pas, h.refaire, h.pasCouverts);

export function useChargementVariante(o: OptionsChargement): void {
  const ref = useRef(o);
  ref.current = o;
  const userId = useAuth().user?.id ?? null;
  const { projectId, studyId, variantId, revisionId } = o;
  useEffect(() => {
    const { alive } = ref.current;
    alive.current = true;
    if (ref.current.inactif) return;
    let active = true;
    const f = () => ref.current;
    const t0 = perfStudio.maintenant();
    void (async () => {
      if (revisionId !== null) {
        try { const c = await api.studioRevision(projectId, studyId, variantId, revisionId); if (active) { f().setContext(c); f().setBrouillon(creerBrouillon(c.revision.document)); } }
        catch (e) { if (active) { f().setLoadError(e); f().setError(refused(e) ? "" : "Étude indisponible ou accès refusé."); } }
        finally { if (active) f().setLoading(false); }
        return;
      }
      const cle = userId ? cleVariante(userId, projectId, studyId, variantId) : null;
      let lu: BrouillonLu | null = null, illisible = false;
      if (cle && userId) {
        try { lu = await lireBrouillonHorsLigne(cle, userId); }
        catch (e) {
          illisible = true;
          // B.3-11 : file incompatible — signalée pour une résolution explicite (export, puis abandon confirmé).
          if (e instanceof ErreurFileLocale) signalerFileBloquee(cle, e.raison, e.entree);
        }
      }
      const h = lu?.brouillon ?? null;
      const reprise = (r: Omit<RepriseHorsLigne, "plan" | "pasCouverts" | "stamp">) => f().reprendre({ plan: h?.plan ?? null, pasCouverts: h?.pasCouverts ?? 0, stamp: lu?.stamp ?? null, ...r });
      try {
        const c = await api.studioContext(projectId, studyId, variantId);
        if (!active) return;
        if (cle && userId) void memoriserContexte(cle, userId, c);
        if (illisible) {
          // Rien n'est réinterprété ni écrasé : la version serveur s'ouvre en lecture seule.
          f().setContext({ ...c, canWrite: false }); f().setBrouillon(creerBrouillon(c.revision.document));
          f().setError("Le brouillon hors ligne conservé sur cet appareil est illisible : il n’est ni envoyé ni effacé. La version serveur est ouverte en lecture seule.");
          return;
        }
        if (!h) { f().setContext(c); f().setBrouillon(creerBrouillon(c.revision.document)); return; }
        const surTete = !h.plan && h.base.revision.id === c.revision.id;
        // Le droit d'écriture est celui que le serveur vient de renvoyer, jamais celui du cache.
        const base: StudioContext = surTete ? c : { ...h.base, canWrite: c.canWrite, archived: c.archived };
        let b: Brouillon;
        try { b = restaurer(base, h); }
        catch {
          if (cle && userId) void brouillonBrut(cle, userId).then((e) => { if (e) signalerFileBloquee(cle, "ne-s-applique-plus", e); });
          f().setContext({ ...c, canWrite: false }); f().setBrouillon(creerBrouillon(c.revision.document));
          f().setError("Le brouillon hors ligne conservé sur cet appareil ne s’applique plus à sa révision : il n’est ni envoyé ni effacé. La version serveur est ouverte en lecture seule.");
          return;
        }
        const conflit = h.conflit ?? (!surTete && !h.plan ? { headRevisionId: c.revision.id, at: new Date().toISOString() } : null);
        f().setContext(base); f().setBrouillon(b);
        reprise({ conflit, conserve: true, depuisCache: null });
      } catch (e) {
        if (!active) return;
        if (!isNetworkError(e) && navigateurEnLigne()) { f().setLoadError(e); f().setError(refused(e) ? "" : "Étude indisponible ou accès refusé."); return; }
        // Sans réseau : la base du brouillon conservé, sinon la dernière version lue sur l'appareil (même utilisateur).
        const memoire = h ? { contexte: h.base, luA: "" } : illisible || !cle || !userId ? null : await contexteMemorise(cle, userId);
        if (!active) return;
        if (!memoire) {
          f().setLoadError(e);
          f().setError(illisible ? "Hors ligne : le brouillon conservé sur cet appareil est illisible ; rien n’est affiché ni modifiable." : "Hors ligne : cette variante n’a pas encore été lue sur cet appareil. Rien n’est affiché ni modifiable tant que le réseau manque.");
          return;
        }
        try { f().setContext(memoire.contexte); f().setBrouillon(h ? restaurer(memoire.contexte, h) : creerBrouillon(memoire.contexte.revision.document)); }
        catch { f().setLoadError(e); f().setError("Hors ligne : le brouillon conservé sur cet appareil ne s’applique plus ; rien n’est affiché ni modifiable."); return; }
        // PERF-10 : ouverture d'une variante depuis l'appareil faute de réseau (données récupérables).
        perfStudio.enregistrer("PERF-10", perfStudio.maintenant() - t0, "ms", { operation: "ouverture-depuis-appareil", brouillon: h ? 1 : 0 }, t0);
        reprise({ conflit: h?.conflit ?? null, conserve: !!h, depuisCache: memoire.luA || new Date().toISOString() });
      } finally { if (active) f().setLoading(false); }
    })();
    return () => { active = false; alive.current = false; };
  }, [projectId, studyId, variantId, revisionId, userId]);
}
