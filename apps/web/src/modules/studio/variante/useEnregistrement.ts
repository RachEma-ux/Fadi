/**
 * Enregistrement explicite d'une variante par enveloppes de commandes (`studio-commands/1`) sur la révision de tête.
 * Au-delà de 500 commandes, les lots partent dans l'ordre (`import/envoi.ts`), chacun sur la révision produite par le
 * précédent. Un nouvel essai après une erreur réseau rejoue le même lot (même requestId) : jamais de double effet.
 * Un enregistrement partiel rebase le brouillon sur la dernière révision confirmée, avec les seules commandes non
 * envoyées en attente. Le serveur reste seul juge (conflit, refus) ; rien n'est envoyé sans « Enregistrer ».
 *
 * Hors ligne (A.5-09, `hors-ligne/`) : un brouillon modifié sans réseau, ou dont l'enregistrement n'a pas reçu de
 * réponse, est conservé sur l'appareil (IndexedDB) avec ses enveloppes non confirmées (requestId, baseRevisionId).
 * Au retour du réseau, ces enveloppes repartent d'elles-mêmes, dans l'ordre, avec les MÊMES requestId : le serveur
 * reconnaît un rejeu (aucune révision en double). Un refus `stale_revision` n'écrase rien : le brouillon hors ligne
 * reste conservé, en conflit, jusqu'à ce que l'utilisateur recharge la version serveur (après confirmation) ou
 * reporte ses commandes sur la nouvelle tête quand le modèle les applique (`applyStudioCommands`) — sinon il reste
 * conservé pour une résolution manuelle. Un brouillon ouvert en ligne et jamais coupé n'est pas conservé (inchangé).
 */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type StudioContext } from "../../../lib/api";
import { isNetworkError } from "../../../lib/reachability";
import { accuserLot, commandesNonEnvoyees, enveloppeSuivante, envoiPartiel, planEnvoi, type PlanEnvoi } from "../import/envoi";
import { appliquerBrouillon, commandesEnAttente, creerBrouillon, type Brouillon } from "../planche2d/brouillon";
import { navigateurEnLigne, useConnexion, useRetourEnLigne } from "../hors-ligne/connexion";
import { cleVariante, reporterSurTete, versHorsLigne, type ConflitHorsLigne } from "../hors-ligne/persistance";
import { ecrireBrouillonHorsLigne, memoriserContexte, supprimerBrouillonHorsLigne } from "../hors-ligne/stockage";
import type { RepriseHorsLigne } from "../hors-ligne/useChargementVariante";
import { warning } from "./etat-variante";

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
  const connecte = useConnexion();
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflit, setConflit] = useState<ConflitHorsLigne | null>(null);
  const [conserve, setConserve] = useState(false);
  const [depuisCache, setDepuisCache] = useState<string | null>(null);
  const [enAttente, setEnAttente] = useState(0);
  const [rejouer, setRejouer] = useState(0);
  const envelope = useRef<PlanEnvoi | null>(null);
  // Contexte rendu par le dernier lot confirmé : base du brouillon si un lot suivant est refusé.
  const dernierAccuse = useRef<StudioContext | null>(null);
  const saving = useRef(false);
  const local = useRef(false);
  const cle = cleVariante(o.projectId, o.studyId, o.variantId);

  function poserPlan(plan: PlanEnvoi | null) { envelope.current = plan; setEnAttente(plan ? plan.lots.length - plan.envoyes : 0); }

  /** Conserve l'état courant sur l'appareil (brouillon, enveloppes, conflit) ; rend faux si IndexedDB ne l'a pas confirmé. */
  async function conserver(base: StudioContext, b: Brouillon, plan: PlanEnvoi | null, c: ConflitHorsLigne | null): Promise<boolean> {
    try {
      const reste = await ecrireBrouillonHorsLigne(cle, versHorsLigne(base, b, plan, c));
      local.current = reste;
      if (o.alive.current) setConserve(reste);
      return true;
    } catch { return false; }
  }
  async function oublier() {
    local.current = false; setConserve(false); setConflit(null);
    try { await supprimerBrouillonHorsLigne(cle); } catch { /* retrait non confirmé : un brouillon vide relu plus tard ne contient rien à envoyer */ }
  }

  // Brouillon hors ligne : toute modification faite sans réseau, ou d'un brouillon déjà conservé, est écrite sur
  // l'appareil. Un brouillon ouvert en ligne et jamais coupé n'est pas conservé (comportement d'origine).
  useEffect(() => {
    if (o.historical || !o.context || !o.brouillon || saving.current) return;
    if (!local.current && (connecte || commandesEnAttente(o.brouillon).length === 0)) return;
    void conserver(o.context, o.brouillon, envelope.current, conflit).then((ok) => {
      if (!ok && o.alive.current && !connecte) o.setError("Hors ligne : le brouillon n’a pas pu être conservé sur cet appareil (stockage local indisponible). Ne fermez pas cette page.");
    });
  }, [o.brouillon, o.context, conflit, connecte]);

  /** Reprise à l'ouverture (`useChargementVariante`) : enveloppes conservées, conflit, origine des données. */
  function reprendre(r: RepriseHorsLigne) {
    local.current = r.conserve; setConserve(r.conserve); setDepuisCache(r.depuisCache);
    poserPlan(r.plan); dernierAccuse.current = null;
    if (r.plan) setUncertain(true);
    if (r.conflit) {
      setConflit(r.conflit); setBlocked(true);
      o.setError("Conflit de révision : une autre révision est devenue la version courante. Votre brouillon hors ligne est conservé et n’a rien écrasé.");
    } else if (r.plan) {
      o.setError(navigateurEnLigne() ? "" : messageAttente(r.plan.lots.length - r.plan.envoyes));
      if (navigateurEnLigne()) setRejouer(n => n + 1);
    }
  }
  // Retour du réseau : les enveloppes conservées repartent, mêmes requestId (le serveur reconnaît un rejeu).
  useRetourEnLigne(() => { setDepuisCache(null); if (envelope.current && !saving.current) setRejouer(n => n + 1); });
  useEffect(() => {
    if (rejouer > 0 && envelope.current && o.context && o.brouillon && !saving.current) void save();
  }, [rejouer]);

  async function save() {
    const { projectId, studyId, variantId, context, brouillon, alive, setError, setInfo } = o;
    if (!context || !brouillon || o.historical || saving.current) return;
    saving.current = true;
    // Un nouvel essai après une erreur réseau rejoue le même lot (même requestId) : jamais de double effet. Au-delà de
    // 500 commandes, les lots partent dans l'ordre, chacun sur la révision produite par le précédent.
    if (!envelope.current) { poserPlan(planEnvoi(commandesEnAttente(brouillon), context.revision.id, () => crypto.randomUUID())); dernierAccuse.current = null; }
    // Sans réseau, ou brouillon déjà conservé : les enveloppes sont écrites sur l'appareil AVANT d'être envoyées.
    if (local.current || !navigateurEnLigne()) await conserver(context, brouillon, envelope.current, null);
    setPending(true); setError(""); setInfo("");
    try {
      for (let lot = enveloppeSuivante(envelope.current!); lot; lot = enveloppeSuivante(envelope.current!)) {
        const accuse = await api.studioCommands(projectId, studyId, variantId, lot);
        poserPlan(accuserLot(envelope.current!, accuse.revision.id));
        dernierAccuse.current = accuse;
        if (local.current) await conserver(context, brouillon, envelope.current, null);
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
      // Tout est confirmé : plus rien à conserver sur l'appareil.
      if (local.current) await oublier();
      void memoriserContexte(cleVariante(projectId, studyId, variantId), current);
      o.surVersionServeur(current);
      setUncertain(false); poserPlan(null); setSaved(true); setDepuisCache(null);
    }
    catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status < 500 && e.status !== 408) {
        const plan = envelope.current, accuse = dernierAccuse.current;
        const conserver409 = local.current && e.status === 409;
        setUncertain(false); poserPlan(null); dernierAccuse.current = null;
        if (plan && accuse && envoiPartiel(plan)) {
          // Les premiers lots sont enregistrés : le brouillon repart de la dernière révision confirmée, avec les seules
          // commandes non envoyées en attente (un pas annulable). Rien n'est envoyé de nouveau sans « Enregistrer ».
          const reste = commandesNonEnvoyees(plan);
          let rebase = creerBrouillon(accuse.revision.document);
          try { rebase = appliquerBrouillon(rebase, reste); } catch { /* impossible en pratique : mêmes commandes, même ordre */ }
          o.surRebase(accuse, rebase);
          if (conserver409) { const c = { headRevisionId: headDe(e), at: new Date().toISOString() }; setConflit(c); await conserver(accuse, rebase, null, c); }
          else if (local.current) await conserver(accuse, rebase, null, null);
          void client.invalidateQueries({ queryKey: ["studio-revisions", projectId, studyId, variantId] });
          void client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId] });
          const conflitServeur = e.status === 409;
          setBlocked(conflitServeur || e.status === 403 || e.status === 401);
          setError(conflitServeur
            ? `Enregistrement partiel : ${plan.envoyes} lot(s) sur ${plan.lots.length} enregistré(s), puis une autre révision est devenue la version courante. Les ${reste.length} commande(s) non envoyée(s) restent dans ce brouillon, sur votre dernière révision enregistrée ; recharger la version serveur les perdra.`
            : `Enregistrement partiel : ${plan.envoyes} lot(s) sur ${plan.lots.length} enregistré(s), la suite est refusée. Les ${reste.length} commande(s) non envoyée(s) restent en attente dans le brouillon, sur la dernière révision enregistrée.`);
          return;
        }
        if (conserver409) {
          // Brouillon hors ligne refusé : il reste conservé, en conflit ; aucune de ses enveloppes n'a été écrite.
          const c = { headRevisionId: headDe(e), at: new Date().toISOString() };
          setConflit(c); await conserver(context, brouillon, null, c);
        } else if (local.current) await conserver(context, brouillon, null, null);
        setBlocked(e.status === 409 || e.status === 403 || e.status === 401);
        setError(e.status === 409
          ? (e.code === "stale_revision" ? (conserver409 ? "Conflit de révision : une autre révision est devenue la version courante. Votre brouillon hors ligne est conservé et n’a rien écrasé." : "Conflit de révision : une autre révision est devenue la version courante. Votre brouillon est conservé et n’a rien écrasé.") : "Conflit de révision. Le brouillon est conservé.")
          : "Enregistrement refusé. Le brouillon reste non enregistré.");
      } else {
        setUncertain(true);
        // Aucune réponse : les enveloppes (mêmes requestId) sont conservées sur l'appareil et repartiront.
        if ((isNetworkError(e) || !navigateurEnLigne()) && envelope.current) await conserver(context, brouillon, envelope.current, null);
        if (!alive.current) return;
        setError(!navigateurEnLigne() && local.current ? messageAttente(envelope.current ? envelope.current.lots.length - envelope.current.envoyes : 0) : "Confirmation serveur indisponible. Réessayez la même sauvegarde avant de continuer.");
      }
    }
    finally { saving.current = false; if (o.alive.current) setPending(false); }
  }

  /** Abandon explicite du brouillon (après confirmation) : la version serveur est relue. */
  async function rechargerServeur() {
    if (!window.confirm(warning())) return;
    if (local.current || conflit) await oublier();
    window.location.reload();
  }

  /**
   * Report des commandes en attente sur la nouvelle tête : seulement si le modèle les applique toutes. Rien n'est
   * envoyé : le brouillon reporté s'enregistre ensuite par « Enregistrer » (nouvelles enveloppes, nouveaux requestId).
   */
  async function reporter() {
    const { projectId, studyId, variantId, brouillon, alive, setError, setInfo } = o;
    if (!brouillon || !conflit || saving.current) return;
    let tete: StudioContext;
    try { tete = await api.studioContext(projectId, studyId, variantId); }
    catch { if (alive.current) setError("Nouvelle version courante indisponible : le brouillon hors ligne reste conservé. Réessayez une fois en ligne."); return; }
    if (!alive.current) return;
    void memoriserContexte(cleVariante(projectId, studyId, variantId), tete);
    const r = reporterSurTete(tete.revision.document, brouillon.pas);
    if (!r.ok) { setError("Les commandes en attente ne s’appliquent pas à la nouvelle version courante : le brouillon hors ligne reste conservé pour une résolution manuelle."); return; }
    o.surRebase(tete, r.brouillon);
    setConflit(null); setBlocked(false); setError("");
    await conserver(tete, r.brouillon, null, null);
    void client.invalidateQueries({ queryKey: ["studio-revisions", projectId, studyId, variantId] });
    setInfo(`${commandesEnAttente(r.brouillon).length} commande(s) reportée(s) sur la nouvelle version courante. Vérifiez le dessin, puis enregistrez.`);
  }

  return { pending, uncertain, blocked, saved, setSaved, save, reprendre, rechargerServeur, reporter, horsLigne: { enLigne: connecte, enAttente, conflit: !!conflit, conserve, depuisCache: !!depuisCache } };
}

const headDe = (e: ApiError): string | null => {
  const b = e.body as { headRevisionId?: unknown } | null;
  return b && typeof b.headRevisionId === "string" ? b.headRevisionId : null;
};

const messageAttente = (n: number) => `Hors ligne : ${n} enveloppe(s) en attente, conservée(s) sur cet appareil. Elles partiront d’elles-mêmes au retour du réseau, avec les mêmes identifiants : rien ne sera enregistré deux fois.`;
