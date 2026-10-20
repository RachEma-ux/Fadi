/**
 * Enregistrement explicite d'une variante par enveloppes de commandes (`studio-commands/1`) sur la révision de tête.
 * Au-delà de 500 commandes, les lots partent dans l'ordre (`import/envoi.ts`), chacun sur la révision produite par le
 * précédent. Un nouvel essai après une erreur réseau rejoue le même lot (même requestId) : jamais de double effet.
 * Un enregistrement partiel rebase le brouillon sur la dernière révision confirmée, avec les seules commandes non
 * envoyées en attente. Le serveur reste seul juge (conflit, refus) ; rien n'est envoyé sans « Enregistrer ».
 *
 * Hors ligne (A.5-09, `hors-ligne/`) : un brouillon modifié sans réseau, ou dont l'enregistrement n'a pas reçu de
 * réponse, est conservé sur l'appareil (IndexedDB), pour l'utilisateur connecté seulement, avec ses enveloppes non
 * confirmées (requestId, baseRevisionId). Hors ligne, on continue de dessiner derrière une enveloppe en attente : ses
 * pas ne s'annulent plus (plancher), les suivants partiront après elle. Au retour du réseau, les enveloppes repartent
 * d'elles-mêmes, dans l'ordre, avec les MÊMES requestId — et seulement si le propriétaire du brouillon est toujours
 * l'utilisateur connecté : le serveur reconnaît un rejeu (aucune révision en double). Un refus `stale_revision`
 * n'écrase rien : le brouillon hors ligne reste conservé, en conflit, jusqu'à ce que l'utilisateur recharge la
 * version serveur (après confirmation) ou reporte ses commandes sur la nouvelle tête quand le modèle les applique
 * (`applyStudioCommands`) — sinon il reste conservé pour une résolution manuelle. Deux onglets : chaque écriture est
 * comparée au jeton lu (`stamp`) ; si un autre onglet a écrit entre-temps, rien n'est écrasé et le conflit
 * « brouillon modifié dans un autre onglet » s'affiche. Un brouillon ouvert en ligne et jamais coupé n'est pas conservé.
 *
 * Contrat de commandes (A.5) : en ligne aussi, un refus `stale_revision` est un conflit signalé (rien n'est écrasé) ; le
 * report revalide les commandes par le modèle sur la nouvelle tête et nomme d'abord les éléments que l'autre écriture a
 * changés autrement (`studioChevauchements`) — les remplacer demande une confirmation explicite. Une lecture arrivée
 * après un changement du brouillon affiché est ignorée (`revision-courante.ts`) ; les lectures dérivées ne sont relues
 * qu'après la confirmation d'au moins un lot par le serveur. Annuler ne porte que sur le brouillon : les changements
 * d'autrui, présents sous les pas reportés, ne s'annulent jamais d'ici.
 */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type StudioContext } from "../../../lib/api";
import { readLastUser, useAuth } from "../../../lib/auth-context";
import { isNetworkError } from "../../../lib/reachability";
import { accuserLot, commandesNonEnvoyees, enveloppeSuivante, envoiPartiel, planEnvoi, type PlanEnvoi } from "../import/envoi";
import { appliquerBrouillon, avecPlancher, commandesEnAttente, creerBrouillon, type Brouillon } from "../planche2d/brouillon";
import { navigateurEnLigne, useConnexion, useRetourEnLigne } from "../hors-ligne/connexion";
import { cleVariante, identifiantsCites, reporterSurTete, restaurerBrouillon, versHorsLigne, type ConflitHorsLigne } from "../hors-ligne/persistance";
import { invalidationsApresEngagement, lectureApplicable } from "./revision-courante";
import { ecrireBrouillonHorsLigne, memoriserContexte, retirerBrouillonHorsLigne } from "../hors-ligne/stockage";
import type { RepriseHorsLigne } from "../hors-ligne/useChargementVariante";
import { warning } from "./etat-variante";

export interface OptionsEnregistrement {
  projectId: string;
  studyId: string;
  variantId: string;
  historical: boolean;
  /** Mode autonome de la Console (aucun projet) : rien n'est enregistré, ni envoyé, ni conservé sur l'appareil. */
  autonome?: boolean;
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

const MESSAGE_AUTRE_ONGLET = "Brouillon modifié dans un autre onglet : rien n’a été écrasé. Les modifications de cet onglet-ci ne sont plus conservées sur l’appareil ; reprenez le brouillon de l’autre onglet ou fermez celui-ci.";

export function useEnregistrement(o: OptionsEnregistrement) {
  const client = useQueryClient();
  const connecte = useConnexion();
  const userId = useAuth().user?.id ?? null;
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflit, setConflit] = useState<ConflitHorsLigne | null>(null);
  const [autreOnglet, setAutreOnglet] = useState(false);
  const [conserve, setConserve] = useState(false);
  const [depuisCache, setDepuisCache] = useState<string | null>(null);
  const [enAttente, setEnAttente] = useState(0);
  const [rejouer, setRejouer] = useState(0);
  const envelope = useRef<PlanEnvoi | null>(null);
  /** Pas du brouillon mis dans `envelope` (les suivants ont été dessinés après, hors ligne). */
  const pasCouverts = useRef(0);
  // Contexte rendu par le dernier lot confirmé : base du brouillon si un lot suivant est refusé.
  const dernierAccuse = useRef<StudioContext | null>(null);
  const saving = useRef(false);
  const local = useRef(false);
  /** Jeton de la ligne IndexedDB tel que cet onglet l'a lu ou écrit en dernier. */
  const stamp = useRef<string | null>(null);
  const horsJeu = useRef(false);
  /** Reprise à l'ouverture : la ligne vient d'être lue telle quelle, la réécrire changerait son jeton pour rien. */
  const sauterEcriture = useRef(false);
  const cle = userId && !o.autonome ? cleVariante(userId, o.projectId, o.studyId, o.variantId) : null;
  /** Contexte et brouillon affichés au dernier rendu : une lecture asynchrone se compare à eux avant de s'appliquer. */
  const contexteAffiche = useRef(o.context), brouillonAffiche = useRef(o.brouillon);
  contexteAffiche.current = o.context; brouillonAffiche.current = o.brouillon;

  function poserPlan(plan: PlanEnvoi | null, couverts = pasCouverts.current) {
    envelope.current = plan; pasCouverts.current = plan ? couverts : 0;
    setEnAttente(plan ? plan.lots.length - plan.envoyes : 0);
  }
  function signalerAutreOnglet() {
    horsJeu.current = true; local.current = false;
    if (!o.alive.current) return;
    setAutreOnglet(true); setBlocked(true); setConserve(false); o.setError(MESSAGE_AUTRE_ONGLET);
  }

  /** Conserve l'état courant sur l'appareil (brouillon, enveloppes, conflit) ; rend faux si rien n'a été confirmé. */
  /**
   * Les écritures de cet onglet passent une à une (effet de persistance et enregistrement peuvent se croiser) : chacune
   * compare le jeton laissé par la précédente, jamais un jeton lu avant elle.
   */
  const file = useRef<Promise<unknown>>(Promise.resolve());
  function enFile<T>(f: () => Promise<T>): Promise<T> {
    const p = file.current.then(f, f);
    file.current = p.catch(() => undefined);
    return p;
  }
  async function conserver(base: StudioContext, b: Brouillon, plan: PlanEnvoi | null, c: ConflitHorsLigne | null): Promise<boolean> {
    if (!cle || !userId || horsJeu.current) return false;
    const h = versHorsLigne(userId, base, b, plan, pasCouverts.current, c);
    return enFile(async () => {
      if (horsJeu.current) return false;
      try {
        const r = await ecrireBrouillonHorsLigne(cle, h, stamp.current);
        if (r.type === "autre-onglet") { signalerAutreOnglet(); return false; }
        stamp.current = r.type === "ecrit" ? r.stamp : null;
        local.current = r.type === "ecrit";
        if (o.alive.current) setConserve(local.current);
        return true;
      } catch { return false; }
    });
  }
  /** Enregistrement confirmé : la ligne est retirée, sauf si un autre onglet y a écrit depuis. */
  async function oublier() {
    if (!cle || horsJeu.current) return;
    await enFile(async () => {
      if (horsJeu.current) return;
      try { if (!(await retirerBrouillonHorsLigne(cle, stamp.current))) { signalerAutreOnglet(); return; } }
      catch { /* retrait non confirmé : un brouillon vide relu plus tard ne contient rien à envoyer */ }
      local.current = false; stamp.current = null; setConserve(false); setConflit(null);
    });
  }
  /** Le brouillon conservé n'est rejoué que par son propriétaire, toujours connecté sur cet appareil. */
  const proprietaire = () => !cle || (!!userId && readLastUser()?.id === userId);

  // Brouillon hors ligne : toute modification faite sans réseau, ou d'un brouillon déjà conservé, est écrite sur
  // l'appareil. Un brouillon ouvert en ligne et jamais coupé n'est pas conservé (comportement d'origine).
  useEffect(() => {
    if (o.autonome || o.historical || !o.context || !o.brouillon || saving.current || horsJeu.current) return;
    if (sauterEcriture.current) { sauterEcriture.current = false; return; }
    if (!local.current && (connecte || commandesEnAttente(o.brouillon).length === 0)) return;
    void conserver(o.context, o.brouillon, envelope.current, conflit).then((ok) => {
      if (!ok && !horsJeu.current && o.alive.current && !connecte) o.setError("Hors ligne : le brouillon n’a pas pu être conservé sur cet appareil (stockage local indisponible). Ne fermez pas cette page.");
    });
  }, [o.brouillon, o.context, conflit, connecte]);

  /** Reprise à l'ouverture (`useChargementVariante`) : enveloppes conservées, conflit, origine des données. */
  function reprendre(r: RepriseHorsLigne) {
    local.current = r.conserve; stamp.current = r.stamp; sauterEcriture.current = r.conserve; setConserve(r.conserve); setDepuisCache(r.depuisCache);
    poserPlan(r.plan, r.pasCouverts); dernierAccuse.current = null;
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
    if (rejouer > 0 && envelope.current && o.context && o.brouillon && !saving.current && !horsJeu.current) void save();
  }, [rejouer]);

  async function save() {
    const { projectId, studyId, variantId, context, brouillon, alive, setError, setInfo } = o;
    if (!context || !brouillon || o.autonome || o.historical || saving.current || horsJeu.current) return;
    if (envelope.current && !proprietaire()) {
      // Un autre compte s'est connecté entre-temps : rien n'est envoyé sous son nom.
      setBlocked(true); setError("La session de cet appareil a changé : le brouillon hors ligne n’est pas envoyé sous un autre compte.");
      return;
    }
    saving.current = true;
    setPending(true); setError(""); setInfo("");
    // Un nouvel essai après une erreur réseau rejoue le même lot (même requestId) : jamais de double effet. Au-delà de
    // 500 commandes, les lots partent dans l'ordre, chacun sur la révision produite par le précédent.
    if (!envelope.current) { poserPlan(planEnvoi(commandesEnAttente(brouillon), context.revision.id, () => crypto.randomUUID()), brouillon.pas.length); dernierAccuse.current = null; }
    const couverts = pasCouverts.current;
    // Pas dessinés hors ligne après l'enveloppe en attente : ils repartiront ensuite, sur la révision qu'elle produit.
    const suite = brouillon.pas.slice(couverts);
    try {
      // Sans réseau, ou brouillon déjà conservé : les enveloppes sont écrites sur l'appareil AVANT d'être envoyées.
      if (local.current || !navigateurEnLigne()) await conserver(context, brouillon, envelope.current, null);
      if (horsJeu.current) return;
      for (let lot = enveloppeSuivante(envelope.current!); lot; lot = enveloppeSuivante(envelope.current!)) {
        const accuse = await api.studioCommands(projectId, studyId, variantId, lot);
        poserPlan(accuserLot(envelope.current!, accuse.revision.id));
        dernierAccuse.current = accuse;
        if (local.current) await conserver(context, brouillon, envelope.current, null);
        if (!alive.current) return;
      }
      // L'historique et la tête ont changé côté serveur (lots confirmés, donc engagés) : les listes affichées sont relues.
      for (const queryKey of invalidationsApresEngagement(envelope.current?.envoyes ?? 0, projectId, studyId, variantId)) void client.invalidateQueries({ queryKey });
      const accuse = dernierAccuse.current;
      if (suite.length && accuse) {
        // Les pas suivants repartent de la révision produite par l'enveloppe (mêmes commandes, même modèle).
        let rebase: Brouillon;
        try { rebase = restaurerBrouillon(accuse.revision.document, suite); }
        catch { rebase = creerBrouillon(accuse.revision.document); setError("Les modifications dessinées après la sauvegarde hors ligne ne s’appliquent plus : elles sont abandonnées."); }
        poserPlan(null); setUncertain(false); setSaved(true); setDepuisCache(null);
        o.surRebase(accuse, rebase);
        await conserver(accuse, rebase, null, null);
        if (cle && userId) void memoriserContexte(cle, userId, accuse);
        return;
      }
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
      if (cle && userId) void memoriserContexte(cle, userId, current);
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
          try { rebase = appliquerBrouillon(rebase, reste); for (const p of suite) rebase = appliquerBrouillon(rebase, p); } catch { /* impossible en pratique : mêmes commandes, même ordre */ }
          o.surRebase(accuse, rebase);
          if (conserver409) { const c = { headRevisionId: headDe(e), at: new Date().toISOString() }; setConflit(c); await conserver(accuse, rebase, null, c); }
          else if (local.current) await conserver(accuse, rebase, null, null);
          // En ligne aussi (A.5-06) : le conflit est signalé et le report revalidé reste offert, rien n'est écrasé.
          else if (estConflitRevision(e)) setConflit({ headRevisionId: headDe(e), at: new Date().toISOString() });
          // Seuls les lots confirmés sont engagés : leurs lectures dérivées sont relues, rien pour la suite refusée.
          for (const queryKey of invalidationsApresEngagement(plan.envoyes, projectId, studyId, variantId)) void client.invalidateQueries({ queryKey });
          const conflitServeur = e.status === 409;
          setBlocked(conflitServeur || e.status === 403 || e.status === 401);
          setError(conflitServeur
            ? `Enregistrement partiel : ${plan.envoyes} lot(s) sur ${plan.lots.length} enregistré(s), puis une autre révision est devenue la version courante. Les ${reste.length} commande(s) non envoyée(s) restent dans ce brouillon, sur votre dernière révision enregistrée ; recharger la version serveur les perdra.`
            : `Enregistrement partiel : ${plan.envoyes} lot(s) sur ${plan.lots.length} enregistré(s), la suite est refusée. Les ${reste.length} commande(s) non envoyée(s) restent en attente dans le brouillon, sur la dernière révision enregistrée.`);
          return;
        }
        // Plus d'enveloppe en attente : tous les pas redeviennent annulables.
        const libre = avecPlancher(brouillon, 0);
        if (libre !== brouillon && brouillon.plancher) o.surRebase(context, libre);
        if (conserver409) {
          // Brouillon hors ligne refusé : il reste conservé, en conflit ; aucune de ses enveloppes n'a été écrite.
          const c = { headRevisionId: headDe(e), at: new Date().toISOString() };
          setConflit(c); await conserver(context, libre, null, c);
        } else if (local.current) await conserver(context, libre, null, null);
        // En ligne (A.5-06) : même conflit signalé, brouillon gardé dans la page, report revalidé ou rechargement au choix.
        else if (estConflitRevision(e)) setConflit({ headRevisionId: headDe(e), at: new Date().toISOString() });
        setBlocked(e.status === 409 || e.status === 403 || e.status === 401);
        setError(e.status === 409
          ? (e.code === "stale_revision" ? (conserver409 ? "Conflit de révision : une autre révision est devenue la version courante. Votre brouillon hors ligne est conservé et n’a rien écrasé." : "Conflit de révision : une autre révision est devenue la version courante. Votre brouillon est conservé et n’a rien écrasé.") : "Conflit de révision. Le brouillon est conservé.")
          : "Enregistrement refusé. Le brouillon reste non enregistré.");
      } else {
        setUncertain(true);
        // Aucune réponse : les enveloppes (mêmes requestId) sont conservées sur l'appareil et repartiront. Hors ligne,
        // on peut continuer à dessiner derrière elles : leurs pas ne s'annulent plus.
        if ((isNetworkError(e) || !navigateurEnLigne()) && envelope.current) {
          if (!navigateurEnLigne() && (brouillon.plancher ?? 0) !== couverts) o.surRebase(context, avecPlancher(brouillon, couverts));
          await conserver(context, brouillon, envelope.current, null);
        }
        if (!alive.current) return;
        if (horsJeu.current) return;
        setError(!navigateurEnLigne() && local.current ? messageAttente(envelope.current ? envelope.current.lots.length - envelope.current.envoyes : 0) : "Confirmation serveur indisponible. Réessayez la même sauvegarde avant de continuer.");
      }
    }
    finally { saving.current = false; if (o.alive.current) setPending(false); }
  }

  /**
   * Abandon explicite du brouillon (après confirmation) : la version serveur est relue. En conflit d'onglets, le
   * brouillon conservé par l'autre onglet n'est PAS effacé : la page le reprend.
   */
  async function rechargerServeur() {
    if (!window.confirm(warning())) return;
    // Seul le brouillon que CET onglet a conservé est retiré, et seulement s'il n'a pas changé depuis (comparer-puis-
    // retirer) : un conflit signalé en ligne (A.5-06) n'a rien écrit sur l'appareil, la ligne éventuellement présente
    // appartient à un autre onglet et reste intacte.
    if (!horsJeu.current && local.current && cle) { try { await retirerBrouillonHorsLigne(cle, stamp.current); } catch { /* rechargement quand même : rien n'est envoyé */ } }
    window.location.reload();
  }

  /**
   * Report des commandes en attente sur la nouvelle tête : seulement si le modèle les applique toutes. Rien n'est
   * envoyé : le brouillon reporté s'enregistre ensuite par « Enregistrer » (nouvelles enveloppes, nouveaux requestId).
   */
  async function reporter() {
    const { projectId, studyId, variantId, brouillon, context, alive, setError, setInfo } = o;
    if (!brouillon || !context || !conflit || saving.current || horsJeu.current) return;
    const depart = context.revision.id;
    let tete: StudioContext;
    try { tete = await api.studioContext(projectId, studyId, variantId); }
    catch { if (alive.current) setError(local.current ? "Nouvelle version courante indisponible : le brouillon hors ligne reste conservé. Réessayez une fois en ligne." : "Nouvelle version courante indisponible : le brouillon reste dans cette page. Réessayez."); return; }
    if (!alive.current) return;
    // A.5-10 : une lecture partie avant un changement du brouillon affiché (rechargement, autre report) est ignorée.
    if (!lectureApplicable(depart, contexteAffiche.current, brouillonAffiche.current, brouillon)) return;
    if (cle && userId) void memoriserContexte(cle, userId, tete);
    // Revalidation par le modèle sur la nouvelle tête ; les éléments changés des deux côtés sont nommés avant tout report.
    const r = reporterSurTete(tete.revision.document, brouillon.pas, context.revision.document);
    if (!r.ok) { setError(local.current ? "Les commandes en attente ne s’appliquent pas à la nouvelle version courante : le brouillon hors ligne reste conservé pour une résolution manuelle." : "Les commandes en attente ne s’appliquent pas à la nouvelle version courante : le brouillon reste dans cette page pour une résolution manuelle."); return; }
    if (r.chevauchements.length && !window.confirm(`Élément(s) modifié(s) aussi dans la nouvelle version courante : ${identifiantsCites(r.chevauchements)}. Reporter vos commandes remplacerait ces changements. Reporter quand même ?`)) {
      setError("Report abandonné : rien n’a été modifié. Votre brouillon reste conservé ; rechargez la version serveur ou reportez après vérification.");
      return;
    }
    if (local.current && !(await conserver(tete, r.brouillon, null, null)) && horsJeu.current) return;
    o.surRebase(tete, r.brouillon);
    setConflit(null); setBlocked(false); setError("");
    void client.invalidateQueries({ queryKey: ["studio-revisions", projectId, studyId, variantId] });
    setInfo(`${commandesEnAttente(r.brouillon).length} commande(s) reportée(s) sur la nouvelle version courante. Vérifiez le dessin, puis enregistrez.`);
  }

  // Hors ligne, derrière une enveloppe en attente : le dessin reste permis (ses pas couverts ne s'annulent plus).
  const dessinHorsLigne = uncertain && enAttente > 0 && !connecte && !!cle && !blocked && !autreOnglet;
  return {
    pending, uncertain, blocked, saved, setSaved, save, reprendre, rechargerServeur, reporter, dessinHorsLigne,
    horsLigne: { enLigne: connecte, enAttente, conflit: !!conflit || autreOnglet, autreOnglet, conserve, depuisCache: !!depuisCache },
  };
}

const estConflitRevision = (e: ApiError): boolean => e.status === 409 && e.code === "stale_revision";

const headDe = (e: ApiError): string | null => {
  const b = e.body as { headRevisionId?: unknown } | null;
  return b && typeof b.headRevisionId === "string" ? b.headRevisionId : null;
};

const messageAttente = (n: number) => `Hors ligne : ${n} enveloppe(s) en attente, conservée(s) sur cet appareil. Elles partiront d’elles-mêmes au retour du réseau, avec les mêmes identifiants : rien ne sera enregistré deux fois.`;
