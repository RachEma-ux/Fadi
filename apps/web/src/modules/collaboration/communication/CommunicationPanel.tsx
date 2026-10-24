/**
 * Communication (COM, Issue #280, docs/workstreams/communication/PLAN.md) — Projet > Collaboration > Communication et
 * panneau contextuel d'une étape du Parcours.
 *
 * Deux modes : fil contextuel (projet, étape…, audience choisie) et conversation directe ou de groupe (personnes
 * nommées). L'audience est affichée en clair avant l'envoi (« Visible par : … », COM-R1) ; la changer est une action
 * distincte. Le serveur décide de tout ce qui est lisible : ce panneau n'affiche que ce qu'il reçoit (COM-R2). Envoi par
 * file rejouable (COM-6) : états « enregistré sur cet appareil », « en attente d'envoi », « envoi », « accepté par
 * Fadi », « bloqué ». Règle d'or : chaque commande porte son icône, son raccourci affiché et déclaré, et son
 * gestionnaire clavier (`commandes-collaboration.ts`, COM-D14).
 */
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ApiError, comApi, type ComActionInput, type ComApercuAction, type ComApercuPartage, type ComAudience, type ComConversation, type ComConversationDetail, type ComMembre, type ComMessage, type ComMode, type ComRefResolue, type CommentAudience } from "../../../lib/api";
import { MUTATION_KEYS, type ComMessageVars } from "../../../lib/mutations";
import { useProjectAccess } from "../../../lib/access";
import { useAuth } from "../../../lib/auth-context";
import { cleBrouillon, ecrireBrouillon, lireBrouillon } from "../../../lib/com-brouillons";
import { LOCALE } from "../../../lib/i18n";
import { ConfirmDialog } from "../../../components/comptes/ComptesUI";
import { cheminVarianteStudio } from "../../studio/routes-studio";
import { declenche, propsRaccourci, type CommandeCollaboration } from "../commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "../IconeCollaboration";
import { etatEnvoi, LIBELLE_ETAT, libelleJournal, mentionsSansAcces, nouvelIdRequete, raisonBlocage, URGENT_HORS_LIGNE } from "./etats";

const pad2 = (n: number) => String(n).padStart(2, "0");
const AUDIENCE_COURTE: Record<ComAudience, string> = { participants: "Participants", equipe: "Équipe", projet: "Tout le projet" };
const MODE_LIBELLE: Record<ComMode, string> = { contexte: "Fil contextuel", groupe: "Groupe", direct: "Direct" };
const erreur = (err: unknown, repli: string) => (err instanceof ApiError && err.serverMessage ? err.serverMessage : repli);

/** Bouton d'une commande COM : icône propre, libellé, raccourci affiché et déclaré (règle d'or). */
export function BoutonCommande({ commande, libelle, onClick, disabled, primaire = false, titre }: { commande: CommandeCollaboration; libelle: string; onClick: () => void; disabled?: boolean; primaire?: boolean; titre?: string }) {
  return (
    <button type="button" className={primaire ? "button-primary com-commande" : "button-secondary com-commande"} disabled={disabled} title={titre} onClick={onClick} {...propsRaccourci(commande)}>
      <IconeCollaboration commande={commande} />
      {libelle}
      <RaccourciCollaboration commande={commande} />
    </button>
  );
}

/** Libellé et lien d'une référence résolue : « élément non accessible » quand le serveur n'a rien donné (COM-D8). */
export function Reference({ projectId, r }: { projectId: string; r: ComRefResolue }) {
  if (!r.accessible || !r.label) return <span className="h7-chip com-ref com-ref-fermee" data-com-ref={r.type}>Élément non accessible</span>;
  const statut = r.statut ? ` · ${r.statut}` : "";
  const lien = r.lien?.["etape"] ? `/projets/${projectId}?module=parcours&etape=${r.lien["etape"]}`
    : r.lien?.["studyId"] && r.lien?.["variantId"] ? cheminVarianteStudio(projectId, r.lien["studyId"], r.lien["variantId"], null, { domaine: "documentation" })
      : null;
  const texte = <span translate="no">{r.label}{statut}</span>;
  return <span className="h7-chip com-ref" data-com-ref={r.type}>{lien ? <Link to={lien}>{texte}</Link> : texte}</span>;
}

// ---------------------------------------------------------------------------------------------------------------------

/**
 * Contexte d'un panneau contextuel (concept « Studio Parcours Documents > Contextual panel ») : étape, document produit ou
 * variante Studio. `ref` fixe l'élément ; sans `ref`, `choix` propose les éléments du type à la création.
 */
export interface ContexteCom { type: "etape" | "document" | "studio-variante"; ref?: string; choix?: { ref: string; label: string }[] }

export function CommunicationPanel({ projectId, contexte }: { projectId: string; contexte?: ContexteCom }) {
  const queryClient = useQueryClient();
  const cle = contexte ? (contexte.ref ? `${contexte.type}:${contexte.ref}` : contexte.type) : undefined;
  const q = useQuery({ queryKey: ["com", projectId, "conversations", cle ?? "tout"], queryFn: () => comApi.conversations(projectId, cle) });
  const access = useProjectAccess(projectId);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const mayWrite = access.known && access.role !== "support";
  if (q.isLoading) return <p role="status">Lecture des conversations…</p>;
  if (!q.data) return <p role="alert">Impossible de lire les conversations du projet.</p>;
  const { conversations, membres } = q.data;
  return (
    <div
      className="com-panel"
      data-com-panel
      onKeyDown={(e) => {
        if (mayWrite && declenche(e, "nouvelle-conversation")) { e.preventDefault(); setCreation(true); }
      }}
    >
      <div className="h7-actions com-barre">
        {mayWrite && <BoutonCommande commande="nouvelle-conversation" libelle="Nouvelle conversation" onClick={() => setCreation((v) => !v)} />}
      </div>
      {creation && <NouvelleConversation projectId={projectId} membres={membres} contexte={contexte} role={access.role} onCreee={(id) => { setCreation(false); setChoisie(id); void queryClient.invalidateQueries({ queryKey: ["com", projectId] }); }} onAnnuler={() => setCreation(false)} />}
      {conversations.length === 0 ? (
        <p className="h7-muted">Aucune conversation{contexte ? " sur cet élément" : ""} que vous puissiez lire.</p>
      ) : (
        <ul className="com-liste">
          {conversations.map((c) => (
            <li key={c.id} className={choisie === c.id ? "com-liste-sel" : undefined}>
              <button type="button" className="link-button com-conversation" data-com-conversation={c.id} aria-pressed={choisie === c.id} onClick={() => setChoisie(choisie === c.id ? null : c.id)}>
                <b translate="no">{c.title}</b>
              </button>
              {" "}<span className="h7-chip" data-audience={c.audience}>{AUDIENCE_COURTE[c.audience]}</span>
              {" "}<span className="h7-chip">{MODE_LIBELLE[c.mode]}</span>
              {c.context?.label && <small className="h7-muted"> · <span translate="no">{c.context.label}</span>{c.context.revision ? ` · révision ${c.context.revision}` : ""}</small>}
              {c.nonLus > 0 && <span className="com-non-lus" data-com-non-lus={c.nonLus}>{` ${c.nonLus} non lu(s)`}</span>}
            </li>
          ))}
        </ul>
      )}
      {choisie && <ConversationVue key={choisie} projectId={projectId} conversationId={choisie} membres={membres} conversations={conversations} />}
    </div>
  );
}

function NouvelleConversation({ projectId, membres, contexte, role, onCreee, onAnnuler }: { projectId: string; membres: ComMembre[]; contexte?: ContexteCom; role: string; onCreee: (id: string) => void; onAnnuler: () => void }) {
  const lecteur = role === "lecteur";
  const [mode, setMode] = useState<ComMode>("contexte");
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<ComAudience>(lecteur ? "projet" : "equipe");
  const [ctxType, setCtxType] = useState<string>(contexte ? contexte.type : "projet");
  const [etape, setEtape] = useState(contexte?.type === "etape" && contexte.ref ? contexte.ref : "1");
  const [ctxRef, setCtxRef] = useState(contexte && contexte.type !== "etape" ? contexte.ref ?? contexte.choix?.[0]?.ref ?? "" : "");
  const [participants, setParticipants] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const creer = useMutation({
    mutationFn: () => comApi.creer(projectId, mode === "contexte"
      ? { mode, title: title.trim(), audience, context: ctxType === "etape" ? { type: "etape", ref: etape } : ctxType === "projet" ? { type: "projet" } : { type: ctxType, ref: ctxRef } }
      : { mode, ...(title.trim() ? { title: title.trim() } : {}), participantIds: participants }),
    onSuccess: (c) => onCreee(c.id),
    onError: (err) => setError(erreur(err, "La conversation n’a pas pu être créée.")),
  });
  const choisis = membres.filter((m) => participants.includes(m.id)).map((m) => m.email);
  const apercu = mode === "contexte"
    ? audience === "equipe" ? "Visible par : équipe du projet (propriétaire et éditeurs)" : "Visible par : tous les membres du projet, lecteurs compris"
    : `Visible par : vous${choisis.length ? `, ${choisis.join(", ")}` : ""}`;
  return (
    <form className="comment-form com-creation" data-com-creation onSubmit={(e: FormEvent) => { e.preventDefault(); creer.mutate(); }}>
      <label>Mode
        <select value={mode} onChange={(e) => { setMode(e.target.value as ComMode); setParticipants([]); }}>
          <option value="contexte">Fil contextuel — sur un élément du projet</option>
          <option value="groupe">Groupe — personnes nommées</option>
          <option value="direct">Direct — une autre personne</option>
        </select>
      </label>
      <label>Titre{mode === "direct" ? " (facultatif)" : ""}
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required={mode !== "direct"} />
      </label>
      {mode === "contexte" ? (
        <>
          <label>Contexte
            <select value={ctxType} onChange={(e) => setCtxType(e.target.value)} disabled={!!contexte}>
              <option value="projet">Projet</option>
              <option value="etape">Étape du Parcours</option>
              {contexte?.type === "document" && <option value="document">Document</option>}
              {contexte?.type === "studio-variante" && <option value="studio-variante">Variante Studio</option>}
            </select>
          </label>
          {contexte?.type === "document" && (
            <label>Document
              <select value={ctxRef} onChange={(e) => setCtxRef(e.target.value)} disabled={!!contexte.ref}>
                {(contexte.choix ?? []).map((c) => <option key={c.ref} value={c.ref}>{c.label}</option>)}
              </select>
            </label>
          )}
          {ctxType === "etape" && (
            <label>Étape
              <select value={etape} onChange={(e) => setEtape(e.target.value)} disabled={!!contexte}>
                {Array.from({ length: 21 }, (_, i) => String(i + 1)).map((n) => <option key={n} value={n}>{`Étape ${pad2(Number(n))}`}</option>)}
              </select>
            </label>
          )}
          <label>Audience
            <select value={audience} onChange={(e) => setAudience(e.target.value as ComAudience)}>
              {!lecteur && <option value="equipe">Équipe — propriétaire et éditeurs</option>}
              <option value="projet">Tout le projet — lecteurs compris</option>
            </select>
          </label>
        </>
      ) : (
        <fieldset className="com-participants-choix">
          <legend>{mode === "direct" ? "Personne" : "Participants"}</legend>
          {membres.map((m) => (
            <label key={m.id}>
              <input type={mode === "direct" ? "radio" : "checkbox"} name="com-participant" checked={participants.includes(m.id)}
                onChange={(e) => setParticipants(mode === "direct" ? [m.id] : e.target.checked ? [...participants, m.id] : participants.filter((x) => x !== m.id))} />
              <span translate="no">{m.email}</span>
            </label>
          ))}
        </fieldset>
      )}
      <p className="com-audience-apercu" data-com-audience-apercu><b>{apercu}</b></p>
      <div className="h7-actions">
        <button type="submit" className="button-primary" disabled={creer.isPending}>Créer la conversation</button>
        <button type="button" className="button-secondary" onClick={onAnnuler}>Annuler</button>
      </div>
      {error && <p className="h7-error" role="alert">{error}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function ConversationVue({ projectId, conversationId, membres, conversations }: { projectId: string; conversationId: string; membres: ComMembre[]; conversations: ComConversation[] }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["com", projectId, "conversation", conversationId], queryFn: () => comApi.conversation(projectId, conversationId) });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<null | "audience" | "participant" | "animation">(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [partage, setPartage] = useState(false);
  const [actionSur, setActionSur] = useState<ComMessage | null>(null);
  const [edition, setEdition] = useState<{ id: string; body: string } | null>(null);
  const [retrait, setRetrait] = useState<ComMessage | null>(null);
  const relire = () => { void queryClient.invalidateQueries({ queryKey: ["com", projectId] }); void queryClient.invalidateQueries({ queryKey: ["com-boite"] }); };
  const data = q.data;
  // Lecture enregistrée (et ouverture des messages des autres) à chaque nouveau message reçu.
  const nbMessages = data?.messages.length ?? 0;
  useEffect(() => {
    if (!data) return;
    void comApi.lu(projectId, conversationId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["com", projectId, "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["com-boite"] });
    }).catch(() => undefined);
  }, [projectId, conversationId, nbMessages, data?.id, queryClient]);
  const muter = <T,>(fn: () => Promise<T>, ok: string, ko: string) => fn().then(() => { setError(null); setNotice(ok); relire(); }).catch((err: unknown) => setError(erreur(err, ko)));
  const accuser = useMutation({ mutationFn: (id: string) => comApi.accuser(projectId, id), onSuccess: () => { setNotice("Accusé de réception enregistré."); relire(); }, onError: (err) => setError(erreur(err, "L’accusé n’a pas pu être enregistré.")) });
  if (q.isLoading) return <p role="status">Lecture de la conversation…</p>;
  if (!data) return <p role="alert">Conversation introuvable ou plus accessible.</p>;
  const c = data;
  const actifs = c.participants.filter((p) => !p.removedAt);
  const peutParticipants = c.peut.gerer && c.audience === "participants" && c.mode !== "direct";
  const messageCommande = (m: ComMessage, e: KeyboardEvent) => {
    const fait = (f: () => void) => { e.preventDefault(); e.stopPropagation(); f(); };
    if (m.withdrawn) return;
    if (c.peut.ecrire && declenche(e, "partager-extrait")) fait(() => { setSelection((s) => (s.includes(m.id) ? s : [...s, m.id])); setPartage(true); });
    else if (c.peut.ecrire && declenche(e, "action-liee")) fait(() => setActionSur(m));
    else if (m.ackRequired && !m.mine && !m.moi.acknowledgedAt && c.peut.ecrire && declenche(e, "accuser-reception")) fait(() => accuser.mutate(m.id));
    else if (m.mine && m.nature === "message" && declenche(e, "modifier-message")) fait(() => setEdition({ id: m.id, body: m.body ?? "" }));
    else if (m.mine && m.nature === "message" && declenche(e, "retirer-message")) fait(() => setRetrait(m));
  };
  return (
    <section className="com-conversation-vue" data-com-vue={c.id} aria-label={c.title}>
      <header
        className="com-entete"
        onKeyDown={(e) => {
          if (!c.peut.gerer) return;
          if (c.mode === "contexte" && declenche(e, "audience-conversation")) { e.preventDefault(); setDialogue("audience"); }
          else if (peutParticipants && declenche(e, "ajouter-participant")) { e.preventDefault(); setDialogue("participant"); }
          else if (declenche(e, "transferer-animation")) { e.preventDefault(); setDialogue("animation"); }
        }}
      >
        <h3 translate="no">{c.title}</h3>
        <p className="com-audience" data-com-audience={c.audience}><b>{c.audienceLabel}</b>{` · ${c.destinataires} destinataire(s)`}</p>
        {c.context?.label && <p className="h7-muted">Contexte : <span translate="no">{c.context.label}</span>{c.context.revision ? ` · révision ${c.context.revision}` : ""}</p>}
        <p className="h7-muted">Animation : <span translate="no">{c.steward.email}</span></p>
        {c.peut.gerer && (
          <div className="h7-actions">
            {c.mode === "contexte" && <BoutonCommande commande="audience-conversation" libelle="Changer l’audience" onClick={() => setDialogue("audience")} />}
            {peutParticipants && <BoutonCommande commande="ajouter-participant" libelle="Ajouter un participant" onClick={() => setDialogue("participant")} />}
            <BoutonCommande commande="transferer-animation" libelle="Transférer l’animation" onClick={() => setDialogue("animation")} />
          </div>
        )}
        {c.audience === "participants" && (
          <ul className="com-participants" aria-label="Participants">
            {actifs.map((p) => (
              <li
                key={p.id}
                data-com-participant={p.email}
                onKeyDown={(e) => {
                  if (c.peut.gerer && c.mode !== "direct" && declenche(e, "retirer-participant")) { e.preventDefault(); void muter(() => comApi.retirerParticipant(projectId, c.id, p.id), "Participant retiré de la conversation.", "Le retrait a échoué."); }
                }}
              >
                <span translate="no">{p.email}</span>
                {!p.aAcces && <small className="h7-muted"> · n’a plus accès au projet</small>}
                {p.historyFrom && <small className="h7-muted">{` · historique depuis le ${new Date(p.historyFrom).toLocaleString(LOCALE)}`}</small>}
                {c.peut.gerer && c.mode !== "direct" && (
                  <BoutonCommande commande="retirer-participant" libelle="Retirer de la conversation" onClick={() => void muter(() => comApi.retirerParticipant(projectId, c.id, p.id), "Participant retiré de la conversation.", "Le retrait a échoué.")} />
                )}
              </li>
            ))}
          </ul>
        )}
      </header>

      {c.anterieurs > 0 && <p className="h7-muted" data-com-anterieurs={c.anterieurs}>{`${c.anterieurs} message(s) plus ancien(s) non affiché(s) : seuls les plus récents sont présentés.`}</p>}
      <ol className="com-messages">
        {c.messages.map((m) => (
          <li key={m.id} className={`com-message com-nature-${m.nature}${m.urgent ? " com-urgent" : ""}`} data-com-message={m.id} tabIndex={-1} onKeyDown={(e) => messageCommande(m, e)}>
            <div className="comment-meta">
              {c.peut.ecrire && !m.withdrawn && (
                <input type="checkbox" aria-label="Choisir cet extrait" checked={selection.includes(m.id)} onChange={(e) => setSelection(e.target.checked ? [...selection, m.id] : selection.filter((x) => x !== m.id))} />
              )}
              <b translate="no">{m.author.email}</b>{!m.author.aAcces && <small className="h7-muted"> (n’a plus accès)</small>}
              {" · "}{new Date(m.createdAt).toLocaleString(LOCALE)}
              {m.capturedAt && <small className="h7-muted">{` · saisi le ${new Date(m.capturedAt).toLocaleString(LOCALE)}`}</small>}
              {m.urgent && <span className="h7-chip com-urgent-chip"> Urgent</span>}
              {m.ackRequired && <span className="h7-chip"> Accusé de réception demandé</span>}
              {m.nature === "partage" && <span className="h7-chip"> Extrait partagé depuis une autre conversation</span>}
              {m.editedAt && !m.withdrawn && <small className="h7-muted"> · modifié</small>}
            </div>
            {m.withdrawn ? <p className="h7-muted"><i>Message retiré par son auteur.</i></p> : <p className="com-corps" translate="no">{m.body}</p>}
            {m.refs.length > 0 && <p className="com-refs">{m.refs.map((r) => <Reference key={`${r.type}:${r.id}`} projectId={projectId} r={r} />)}</p>}
            {m.mentions.length > 0 && <p className="h7-muted">Mentions : <span translate="no">{m.mentions.map((x) => x.email).join(", ")}</span></p>}
            {m.remise && (
              <p className="h7-muted com-remise" data-com-remise={m.id}>
                {`Accepté par Fadi · ouvert par ${m.remise.ouverts}/${m.remise.destinataires}`}
                {m.ackRequired && ` · accusé par ${m.remise.accuses}/${m.remise.destinataires}`}
                {m.remise.enAttente.length > 0 && <> · en attente : <span translate="no">{m.remise.enAttente.join(", ")}</span></>}
              </p>
            )}
            {!m.withdrawn && (
              <div className="h7-actions com-message-actions">
                {m.ackRequired && !m.mine && c.peut.ecrire && (m.moi.acknowledgedAt
                  ? <small className="h7-muted">{`Vous avez accusé réception le ${new Date(m.moi.acknowledgedAt).toLocaleString(LOCALE)}`}</small>
                  : <BoutonCommande commande="accuser-reception" libelle="Accuser réception" disabled={accuser.isPending} onClick={() => accuser.mutate(m.id)} />)}
                {c.peut.ecrire && <BoutonCommande commande="partager-extrait" libelle="Partager l’extrait" onClick={() => { setSelection((s) => (s.includes(m.id) ? s : [...s, m.id])); setPartage(true); }} />}
                {c.peut.ecrire && <BoutonCommande commande="action-liee" libelle="Créer une action liée" onClick={() => setActionSur(m)} />}
                {m.mine && m.nature === "message" && <BoutonCommande commande="modifier-message" libelle="Modifier" onClick={() => setEdition({ id: m.id, body: m.body ?? "" })} />}
                {m.mine && m.nature === "message" && <BoutonCommande commande="retirer-message" libelle="Retirer le message" onClick={() => setRetrait(m)} />}
              </div>
            )}
            {edition?.id === m.id && (
              <form className="comment-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void muter(() => comApi.modifier(projectId, m.id, edition.body.trim()), "Message modifié : la version précédente est conservée.", "La modification a échoué.").then(() => setEdition(null)); }}>
                <label>Modifier le message<textarea value={edition.body} rows={3} maxLength={8000} onChange={(e) => setEdition({ id: m.id, body: e.target.value })} /></label>
                <div className="h7-actions"><button type="submit" className="button-primary" disabled={!edition.body.trim()}>Enregistrer la modification</button><button type="button" className="button-secondary" onClick={() => setEdition(null)}>Annuler</button></div>
              </form>
            )}
          </li>
        ))}
        {c.messages.length === 0 && <li className="h7-muted">Aucun message.</li>}
      </ol>

      {c.peut.ecrire ? <Redaction projectId={projectId} conversation={c} membres={membres} /> : <p className="h7-muted">Lecture seule : vous ne pouvez pas écrire dans cette conversation.</p>}

      <details className="com-journal">
        <summary>{`Journal de la conversation (${c.journal.length})`}</summary>
        <ul>{c.journal.map((e) => <li key={e.id}>{`${new Date(e.at).toLocaleString(LOCALE)} · `}<span translate="no">{libelleJournal(e)}</span></li>)}</ul>
      </details>

      {notice && <p className="h7-muted" role="status">{notice}</p>}
      {error && <p className="h7-error" role="alert">{error}</p>}

      {dialogue === "audience" && <DialogueAudience projectId={projectId} c={c} onFin={(ok) => { setDialogue(null); if (ok) { setNotice(ok); relire(); } }} onErreur={setError} />}
      {dialogue === "participant" && <DialogueParticipant projectId={projectId} c={c} membres={membres} onFin={(ok) => { setDialogue(null); if (ok) { setNotice(ok); relire(); } }} onErreur={setError} />}
      {dialogue === "animation" && <DialogueAnimation projectId={projectId} c={c} membres={membres} onFin={(ok) => { setDialogue(null); if (ok) { setNotice(ok); relire(); } }} onErreur={setError} />}
      {partage && selection.length > 0 && <DialoguePartage projectId={projectId} c={c} selection={selection} conversations={conversations} onFin={(ok) => { setPartage(false); if (ok) { setSelection([]); setNotice(ok); relire(); } }} />}
      {actionSur && <DialogueAction projectId={projectId} message={actionSur} membres={membres} onFin={(ok) => { setActionSur(null); if (ok) { setNotice(ok); relire(); void queryClient.invalidateQueries({ queryKey: ["com", projectId, "demandes"] }); } }} />}
      {retrait && (
        <ConfirmDialog title="Retirer le message" confirmLabel="Retirer" danger onClose={() => setRetrait(null)} onConfirm={() => { const m = retrait; setRetrait(null); void muter(() => comApi.retirer(projectId, m.id), "Message retiré : l’indication reste visible dans la conversation.", "Le retrait a échoué."); }}>
          <p>Le texte ne sera plus affiché ; l’indication « Message retiré par son auteur » reste visible de toute l’audience.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function Redaction({ projectId, conversation: c, membres }: { projectId: string; conversation: ComConversationDetail; membres: ComMembre[] }) {
  const queryClient = useQueryClient();
  // Brouillon propre au compte, au projet et à la conversation (`lib/com-brouillons.ts`), oublié à la déconnexion.
  const { user } = useAuth();
  const cle = user ? cleBrouillon(user.id, projectId, c.id) : null;
  const [texte, setTexte] = useState(() => lireBrouillon(cle));
  const [mentions, setMentions] = useState<string[]>([]);
  const [etape, setEtape] = useState("");
  const [ackRequired, setAck] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [bloque, setBloque] = useState<{ texte: string; raison: string } | null>(null);
  const [sansAcces, setSansAcces] = useState<string[]>([]);
  const [horsLigne, setHorsLigne] = useState(typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const maj = () => setHorsLigne(!navigator.onLine);
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => { window.removeEventListener("online", maj); window.removeEventListener("offline", maj); };
  }, []);
  useEffect(() => { ecrireBrouillon(cle, texte); }, [texte, cle]);
  const envoi = useMutation<{ id: string; replayed: boolean; mentionsSansAcces: string[] }, unknown, ComMessageVars>({
    mutationKey: MUTATION_KEYS.comMessage,
    onSuccess: (r) => { setSansAcces(r.mentionsSansAcces); setBloque(null); void queryClient.invalidateQueries({ queryKey: ["com", projectId] }); },
    onError: (err, v) => setBloque({ texte: v.input.body, raison: raisonBlocage(err instanceof ApiError ? err.status : null, err instanceof ApiError ? err.serverMessage : null) }),
  });
  // Envois de cette conversation encore en file (rechargement compris) : jamais montrés comme remis.
  const enFile = useMutationState({ filters: { mutationKey: MUTATION_KEYS.comMessage, status: "pending" }, select: (m) => ({ v: m.state.variables as ComMessageVars | undefined, paused: m.state.isPaused }) })
    .filter((x) => x.v?.conversationId === c.id);
  const actifs = c.participants.filter((p) => !p.removedAt).map((p) => p.id);
  const avert = useMemo(() => mentionsSansAcces(c.audience, mentions, membres, actifs), [c.audience, mentions, membres, actifs]);
  const etat = etatEnvoi(envoi.status === "idle" ? null : { status: envoi.status, isPaused: envoi.isPaused }, texte);
  const envoyer = () => {
    const body = texte.trim();
    if (!body) return;
    envoi.mutate({ projectId, conversationId: c.id, input: { body, mentions, refs: etape ? [{ type: "etape", id: etape }] : [], ackRequired, urgent, clientRequestId: nouvelIdRequete(), capturedAt: new Date().toISOString() } });
    setTexte(""); setMentions([]); setEtape(""); setAck(false); setUrgent(false);
  };
  return (
    <form
      className="comment-form com-redaction"
      data-com-composer
      onKeyDown={(e) => { if (declenche(e, "envoyer-message")) { e.preventDefault(); envoyer(); } }}
      onSubmit={(e: FormEvent) => { e.preventDefault(); envoyer(); }}
    >
      <p className="com-audience-envoi" data-com-audience-label><b>{c.audienceLabel}</b></p>
      <label>Message
        <textarea value={texte} rows={3} maxLength={8000} placeholder="Question, information, réponse…" onChange={(e) => setTexte(e.target.value)} />
      </label>
      <div className="com-options">
        <details>
          <summary>{`Mentionner (${mentions.length})`}</summary>
          {membres.map((m) => (
            <label key={m.id}><input type="checkbox" checked={mentions.includes(m.id)} onChange={(e) => setMentions(e.target.checked ? [...mentions, m.id] : mentions.filter((x) => x !== m.id))} /> <span translate="no">{m.email}</span></label>
          ))}
        </details>
        <label>Citer une étape
          <select value={etape} onChange={(e) => setEtape(e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 21 }, (_, i) => String(i + 1)).map((n) => <option key={n} value={n}>{`Étape ${pad2(Number(n))}`}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={ackRequired} onChange={(e) => setAck(e.target.checked)} /> Accusé de réception demandé</label>
        <label><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent</label>
      </div>
      {avert.length > 0 && <p className="h7-warning" role="status">La mention ne donne aucun accès : <span translate="no">{avert.map((m) => m.email).join(", ")}</span> ne lira pas cette conversation.</p>}
      {urgent && horsLigne && <p className="h7-error" role="alert">{URGENT_HORS_LIGNE}</p>}
      <div className="h7-actions">
        <button type="submit" className="button-primary com-commande" disabled={!texte.trim()} {...propsRaccourci("envoyer-message")}>
          <IconeCollaboration commande="envoyer-message" />
          Envoyer
          <RaccourciCollaboration commande="envoyer-message" />
        </button>
        {etat && <span className="h7-muted com-etat" data-com-etat={etat}>{LIBELLE_ETAT[etat]}</span>}
      </div>
      {enFile.length > 0 && <p className="h7-muted" data-com-file={enFile.length}>{`${enFile.length} message(s) en attente d’envoi sur cet appareil : ils partiront au retour de la connexion (aucun n’est encore remis).`}</p>}
      {sansAcces.length > 0 && <p className="h7-muted" role="status">Envoyé. La mention n’a rien ouvert à : <span translate="no">{sansAcces.join(", ")}</span>.</p>}
      {bloque && (
        <div className="h7-error" role="alert">
          <p>{bloque.raison}</p>
          <button type="button" className="button-secondary" onClick={() => { setTexte(bloque.texte); setBloque(null); }}>Reprendre le brouillon</button>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Dialogues : audience (action distincte, COM-R1), participant (historique, COM-D4), animation, partage (aperçu et
// empreinte, COM-R4), action liée (COM-R7).

function DialogueAudience({ projectId, c, onFin, onErreur }: { projectId: string; c: ComConversationDetail; onFin: (ok: string | null) => void; onErreur: (e: string) => void }) {
  const autre: ComAudience = c.audience === "projet" ? "equipe" : "projet";
  const busy = useState(false);
  return (
    <ConfirmDialog title="Changer l’audience" confirmLabel={autre === "projet" ? "Ouvrir à tout le projet" : "Réserver à l’équipe"} busy={busy[0]} onClose={() => onFin(null)}
      onConfirm={() => { busy[1](true); comApi.audience(projectId, c.id, autre).then(() => onFin(autre === "projet" ? "Conversation ouverte à tout le projet (journalisé)." : "Conversation réservée à l’équipe (journalisé).")).catch((err: unknown) => { onErreur(erreur(err, "Le changement d’audience a été refusé.")); onFin(null); }); }}>
      <p>{autre === "projet"
        ? "Tous les membres du projet, lecteurs compris, liront toute la conversation, historique compris."
        : "Seuls le propriétaire et les éditeurs liront la conversation. Refusé si un auteur perdait la lecture de ses propres messages."}</p>
      <p className="h7-muted">Le changement est journalisé avec son auteur.</p>
    </ConfirmDialog>
  );
}

function DialogueParticipant({ projectId, c, membres, onFin, onErreur }: { projectId: string; c: ComConversationDetail; membres: ComMembre[]; onFin: (ok: string | null) => void; onErreur: (e: string) => void }) {
  const actifs = new Set(c.participants.filter((p) => !p.removedAt).map((p) => p.id));
  const candidats = membres.filter((m) => !actifs.has(m.id));
  const [userId, setUserId] = useState(candidats[0]?.id ?? "");
  const [historique, setHistorique] = useState<"tout" | "depuis-ajout">("depuis-ajout");
  return (
    <ConfirmDialog title="Ajouter un participant" confirmLabel="Ajouter" confirmDisabled={!userId} onClose={() => onFin(null)}
      onConfirm={() => comApi.ajouterParticipant(projectId, c.id, userId, historique).then(() => onFin("Participant ajouté (journalisé).")).catch((err: unknown) => { onErreur(erreur(err, "L’ajout a été refusé.")); onFin(null); })}>
      <label>Personne
        <select value={userId} onChange={(e) => setUserId(e.target.value)}>{candidats.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</select>
      </label>
      <fieldset>
        <legend>Historique reçu</legend>
        <label><input type="radio" name="com-historique" checked={historique === "depuis-ajout"} onChange={() => setHistorique("depuis-ajout")} /> À partir de maintenant : les messages antérieurs restent invisibles pour cette personne</label>
        <label><input type="radio" name="com-historique" checked={historique === "tout"} onChange={() => setHistorique("tout")} /> Tout l’historique : cette personne lira tous les messages déjà échangés</label>
      </fieldset>
    </ConfirmDialog>
  );
}

function DialogueAnimation({ projectId, c, membres, onFin, onErreur }: { projectId: string; c: ComConversationDetail; membres: ComMembre[]; onFin: (ok: string | null) => void; onErreur: (e: string) => void }) {
  const candidats = membres.filter((m) => m.id !== c.steward.id && (c.audience === "projet" || (c.audience === "equipe" ? m.role !== "lecteur" : c.participants.some((p) => p.id === m.id && !p.removedAt))));
  const [userId, setUserId] = useState(candidats[0]?.id ?? "");
  return (
    <ConfirmDialog title="Transférer l’animation" confirmLabel="Transférer" confirmDisabled={!userId} onClose={() => onFin(null)}
      onConfirm={() => comApi.animateur(projectId, c.id, userId).then(() => onFin("Animation transférée (journalisée) : les messages gardent leurs auteurs.")).catch((err: unknown) => { onErreur(erreur(err, "Le transfert a été refusé.")); onFin(null); })}>
      <label>Nouvel animateur
        <select value={userId} onChange={(e) => setUserId(e.target.value)}>{candidats.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</select>
      </label>
      <p className="h7-muted">L’animateur organise les participants et l’audience ; il ne reçoit aucun autre droit.</p>
    </ConfirmDialog>
  );
}

function DialoguePartage({ projectId, c, selection, conversations, onFin }: { projectId: string; c: ComConversationDetail; selection: string[]; conversations: ComConversation[]; onFin: (ok: string | null) => void }) {
  const cibles = conversations.filter((x) => x.id !== c.id && x.peut.ecrire);
  const [cibleId, setCibleId] = useState(cibles[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [apercu, setApercu] = useState<ComApercuPartage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lireApercu = () => comApi.apercuPartage(projectId, c.id, { messageIds: selection, cibleId, ...(note.trim() ? { note: note.trim() } : {}) }).then((a) => { setApercu(a); setError(null); }).catch((err: unknown) => setError(erreur(err, "L’aperçu n’a pas pu être établi.")));
  return (
    <ConfirmDialog title="Partager l’extrait" confirmLabel={apercu ? "Confirmer le partage" : "Voir l’aperçu"} confirmDisabled={!cibleId} onClose={() => onFin(null)}
      onConfirm={() => {
        if (!apercu) { void lireApercu(); return; }
        comApi.partager(projectId, c.id, { messageIds: selection, cibleId, ...(note.trim() ? { note: note.trim() } : {}), empreinte: apercu.empreinte })
          .then(() => onFin("Extrait partagé : la conversation d’origine garde son audience."))
          .catch((err: unknown) => { setApercu(null); setError(erreur(err, "Le partage a été refusé.")); });
      }}>
      <label>Conversation de destination
        <select value={cibleId} onChange={(e) => { setCibleId(e.target.value); setApercu(null); }}>{cibles.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
      </label>
      <label>Note (facultative)<textarea rows={2} value={note} maxLength={2000} onChange={(e) => { setNote(e.target.value); setApercu(null); }} /></label>
      <p className="h7-muted">{`${selection.length} extrait(s) choisi(s). Seuls ces extraits seront partagés ; la conversation d’origine n’est pas nommée.`}</p>
      {apercu && (
        <div className="com-apercu" data-com-apercu>
          <p><b>{apercu.cible.audienceLabel}</b></p>
          <p>Destinataires : <span translate="no">{apercu.destinataires.join(", ")}</span></p>
          <ul>{apercu.contenu.map((x) => <li key={x.id} translate="no">{`« ${x.texte} » — ${x.auteur}`}</li>)}</ul>
        </div>
      )}
      {error && <p className="h7-error" role="alert">{error}</p>}
    </ConfirmDialog>
  );
}

function DialogueAction({ projectId, message, membres, onFin }: { projectId: string; message: ComMessage; membres: ComMembre[]; onFin: (ok: string | null) => void }) {
  const access = useProjectAccess(projectId);
  const lecteur = access.role === "lecteur";
  const [type, setType] = useState<"demande" | "observation-studio">("demande");
  const [audience, setAudience] = useState<CommentAudience>(lecteur ? "projet" : "equipe");
  const [responderId, setResponderId] = useState(membres[0]?.id ?? "");
  const [echeance, setEcheance] = useState("");
  const [studyId, setStudyId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [apercu, setApercu] = useState<ComApercuAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const etudes = useQuery({ queryKey: ["studio-etudes-com", projectId], queryFn: () => api.studioStudies(projectId), enabled: type === "observation-studio" });
  const variantes = useQuery({ queryKey: ["studio-variantes-com", projectId, studyId], queryFn: () => api.studioVariants(projectId, studyId), enabled: type === "observation-studio" && !!studyId });
  const repondants = membres.filter((m) => audience === "projet" || m.role !== "lecteur");
  const input = (): ComActionInput => type === "demande"
    ? { type, responderId, audience, echeance: echeance || null }
    : { type, studyId, variantId, responsableId: responderId, audience };
  const pret = !!responderId && (type === "demande" || (!!studyId && !!variantId));
  return (
    <ConfirmDialog title="Créer une action liée" confirmLabel={apercu ? "Confirmer" : "Voir l’aperçu"} confirmDisabled={!pret} onClose={() => onFin(null)}
      onConfirm={() => {
        if (!apercu) { comApi.apercuAction(projectId, message.id, input()).then((a) => { setApercu(a); setError(null); }).catch((err: unknown) => setError(erreur(err, "L’aperçu n’a pas pu être établi."))); return; }
        comApi.action(projectId, message.id, { ...input(), empreinte: apercu.empreinte })
          .then(() => onFin(type === "demande" ? "Demande de précision créée : son état est suivi dans « Demandes de précision »." : "Observation Studio ouverte : son suivi se fait dans Studio."))
          .catch((err: unknown) => { setApercu(null); setError(erreur(err, "L’action a été refusée.")); });
      }}>
      <label>Action
        <select value={type} onChange={(e) => { setType(e.target.value as "demande" | "observation-studio"); setApercu(null); }}>
          <option value="demande">Demande de précision — question, répondant, échéance</option>
          <option value="observation-studio">Observation Studio — sur une variante</option>
        </select>
      </label>
      <label>Audience
        <select value={audience} onChange={(e) => { setAudience(e.target.value as CommentAudience); setApercu(null); }}>
          {!lecteur && <option value="equipe">Équipe — propriétaire et éditeurs</option>}
          <option value="projet">Tout le projet — lecteurs compris</option>
        </select>
      </label>
      <label>{type === "demande" ? "Répondant" : "Responsable"}
        <select value={responderId} onChange={(e) => { setResponderId(e.target.value); setApercu(null); }}>{repondants.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</select>
      </label>
      {type === "demande" ? (
        <label>Échéance (facultative)<input type="date" value={echeance} onChange={(e) => { setEcheance(e.target.value); setApercu(null); }} /></label>
      ) : (
        <>
          <label>Étude
            <select value={studyId} onChange={(e) => { setStudyId(e.target.value); setVariantId(""); setApercu(null); }}>
              <option value="">—</option>
              {etudes.data?.studies.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Variante
            <select value={variantId} onChange={(e) => { setVariantId(e.target.value); setApercu(null); }}>
              <option value="">—</option>
              {variantes.data?.variants.filter((v) => !v.archived).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        </>
      )}
      {apercu && (
        <div className="com-apercu" data-com-apercu>
          <p><b>{apercu.audienceLabel}</b></p>
          <p>Destinataires : <span translate="no">{apercu.destinataires.join(", ")}</span></p>
          <p translate="no">{`« ${apercu.contenu} »`}</p>
        </div>
      )}
      <p className="h7-muted">L’enregistrement est créé par son module (Collaboration ou Studio) ; la conversation n’en garde que le lien et en affiche l’état.</p>
      {error && <p className="h7-error" role="alert">{error}</p>}
    </ConfirmDialog>
  );
}

/** Pli « Conversations » d'une étape du Parcours : panneau contextuel (concept, « Contextual panel »). */
export function StepConversations({ projectId, stepNumber }: { projectId: string; stepNumber: number }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="fold-card step-conversations" data-step-conversations={stepNumber} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Conversations de l’étape</summary>
      <div className="fold-card-body">{open && <CommunicationPanel projectId={projectId} contexte={{ type: "etape", ref: String(stepNumber) }} />}</div>
    </details>
  );
}
