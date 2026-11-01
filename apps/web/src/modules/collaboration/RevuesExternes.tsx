/**
 * Panneau « Revues externes » de l'équipe (phase 4, concept partie 4) — dans Collaboration : la revue externe est une
 * collaboration avec des destinataires nommés hors de l'équipe, même si son matériel vient de Studio (publication
 * candidate). Préparer un paquet, aperçu de l'accès résultant puis invitation, partage figé, suivi (destinataires,
 * réponses reçues, constats ouverts, décisions bloquées, retards — une échéance dépassée n'est jamais un accord),
 * réponses dans les fils de constats, notes internes (jamais servies aux destinataires), révocation, nouvelle version qui
 * remplace l'ancienne. Visible de l'équipe seulement (le serveur répond 403/404 aux autres : le panneau disparaît).
 * Règle d'or : `commandes-revue.ts` (Préparer, Inviter, Partager, Nouvelle version, Révoquer).
 */
import { useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../lib/api";
import { LOCALE } from "../../lib/i18n";
import { useOnline } from "../../components/SyncIndicator";
import { apiMessage, CopyLink } from "../../components/comptes/ComptesUI";
import {
  ACTION_REVUE, BLOCAGE, RESPONSABILITE, revuesApi, STATUT_AFFECTATION, STATUT_CONSTAT, STATUT_PAQUET, STATUT_TRAVAIL,
  type AccessPreview, type AssignmentInput, type InvitationMail, type ReviewResponsibility, type TeamPackageDetail,
} from "../../lib/revues-api";
import { declencheRevue, propsRaccourciRevue, type CommandeRevue } from "./commandes-revue";
import { MarqueAutoControle } from "../../components/AutoControle";
import { IconeRevue, RaccourciRevue } from "./IconeRevue";
import "../../routes/revues/revues.css";

const date = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" }) : "—");
const court = (h: string | null | undefined) => (h ? h.slice(0, 12) : "—");
type Msg = { ok: boolean; text: string } | null;

function BoutonRevue({ commande, label, onClick, disabled, primary = false, type = "button" }: { commande: CommandeRevue; label: string; onClick?: () => void; disabled?: boolean; primary?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} className={primary ? "button-primary revue-commande" : "button-secondary revue-commande"} disabled={disabled} onClick={onClick} {...propsRaccourciRevue(commande)}>
      <IconeRevue commande={commande} /> {label} <RaccourciRevue commande={commande} />
    </button>
  );
}

interface PublicationChoice { id: string; title: string; workStatus: string; diffusionStatus: string; studyName: string }
async function publicationsOf(projectId: string): Promise<PublicationChoice[]> {
  const { studies } = await apiRequest<{ studies: { id: string; name: string; archived: boolean }[] }>(`/projects/${encodeURIComponent(projectId)}/studio/studies`);
  const out: PublicationChoice[] = [];
  for (const s of studies.filter((x) => !x.archived)) {
    const { publications } = await apiRequest<{ publications: { id: string; title: string; workStatus: string; diffusionStatus: string }[] }>(`/projects/${encodeURIComponent(projectId)}/studio/studies/${encodeURIComponent(s.id)}/publications`);
    for (const p of publications) if (p.diffusionStatus === "non-diffuse") out.push({ ...p, studyName: s.name });
  }
  return out;
}

function Liens({ mails }: { mails: InvitationMail[] }) {
  const sans = mails.filter((m) => !m.queued && m.link);
  if (!sans.length) return mails.length ? <p role="status" className="h7-muted">Invitation(s) envoyée(s) par courriel.</p> : null;
  return (
    <div role="status" className="h7-muted">
      <p>Courriel non envoyé (configuration ou domaine réservé aux essais) : transmettez vous-même le lien nominatif. Il ne vaut que pour l’adresse invitée.</p>
      {sans.map((m) => <CopyLink key={m.assignmentId} link={m.link!} />)}
    </div>
  );
}

function Detail({ projectId, id, canSend, onMsg }: { projectId: string; id: string; canSend: boolean; onMsg: (m: Msg) => void }) {
  const online = useOnline();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["revue-equipe", projectId, id], queryFn: () => revuesApi.teamGet(projectId, id) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["revue-equipe", projectId] }); void qc.invalidateQueries({ queryKey: ["revues-equipe", projectId] }); };
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [resp, setResp] = useState<ReviewResponsibility>("relecture");
  const [perms, setPerms] = useState({ attach: false, download: false, export: false });
  const [preview, setPreview] = useState<AccessPreview | null>(null);
  const [mails, setMails] = useState<InvitationMail[]>([]);
  const [note, setNote] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const input = (): AssignmentInput => ({ email: email.trim(), ...(name.trim() ? { displayName: name.trim() } : {}), responsibility: resp, permissions: { comment: true, ...perms } });
  const fail = (fallback: string) => (e: unknown) => onMsg({ ok: false, text: apiMessage(e, fallback) });
  const doPreview = useMutation({ mutationFn: () => revuesApi.teamPreview(projectId, id, input()), onSuccess: (r) => setPreview(r.preview), onError: fail("L’aperçu n’a pas pu être calculé.") });
  const assign = useMutation({ mutationFn: () => revuesApi.teamAssign(projectId, id, input()), onSuccess: (r) => { setInvite(false); setPreview(null); setEmail(""); setName(""); setMails(r.mail ? [r.mail] : []); refresh(); onMsg({ ok: true, text: r.mail ? "Destinataire invité." : "Destinataire ajouté : l’invitation partira au partage du paquet." }); }, onError: fail("Le destinataire n’a pas pu être ajouté.") });
  const share = useMutation({ mutationFn: () => revuesApi.teamShare(projectId, id), onSuccess: (r) => { setMails(r.invitations); refresh(); onMsg({ ok: true, text: "Paquet partagé : contenu figé, empreintes vérifiées." }); }, onError: fail("Le paquet n’a pas pu être partagé.") });
  const version = useMutation({ mutationFn: () => revuesApi.teamVersion(projectId, id), onSuccess: (r) => { refresh(); onMsg({ ok: true, text: `Version ${r.version} préparée (brouillon) : partagée, elle remplacera celle-ci.` }); }, onError: fail("La nouvelle version n’a pas pu être préparée.") });
  const revoke = useMutation({ mutationFn: (a: string) => revuesApi.teamRevoke(projectId, id, a, "Accès révoqué par l’équipe"), onSuccess: () => { refresh(); onMsg({ ok: true, text: "Accès révoqué : il cesse immédiatement ; les constats restent attribués." }); }, onError: fail("La révocation a échoué.") });
  const addNote = useMutation({ mutationFn: () => revuesApi.teamNote(projectId, id, note.trim()), onSuccess: () => { setNote(""); refresh(); }, onError: fail("La note n’a pas pu être enregistrée.") });
  const reply = useMutation({ mutationFn: (f: string) => revuesApi.teamReply(projectId, id, f, (replies[f] ?? "").trim()), onSuccess: (_r, f) => { setReplies((x) => ({ ...x, [f]: "" })); refresh(); }, onError: fail("La réponse n’a pas pu être enregistrée.") });
  const d: TeamPackageDetail | undefined = q.data;
  const ouvrirInvitation = () => { if (canSend) setInvite(true); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!d || !canSend || !online) return;
      if (declencheRevue(e, "inviter-destinataire")) { e.preventDefault(); ouvrirInvitation(); }
      else if (declencheRevue(e, "partager-paquet") && d.package.status === "brouillon") { e.preventDefault(); share.mutate(); }
      else if (declencheRevue(e, "nouvelle-version") && ["partage", "clos"].includes(d.package.status)) { e.preventDefault(); version.mutate(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (q.isPending) return <p role="status">Chargement du paquet…</p>;
  if (!d) return <p role="alert" className="form-error">Paquet introuvable.</p>;
  const p = d.package;
  const onRowKey = (assignmentId: string) => (e: ReactKeyboardEvent) => { if (declencheRevue(e.nativeEvent, "revoquer-acces") && canSend && online) { e.preventDefault(); revoke.mutate(assignmentId); } };
  return (
    <div className="revue-panel" data-revue-detail={p.id}>
      <h3><span translate="no">{p.title}</span> · version {p.version} · <span className="admin-status revue-status" data-status={p.status}>{STATUT_PAQUET[p.status]}</span></h3>
      <dl className="revue-dl">
        <dt>Objet de la revue</dt><dd translate="no">{p.purpose}</dd>
        <dt>Réponse attendue</dt><dd translate="no">{p.expectedResponse}</dd>
        <dt>Échéance</dt><dd>{date(p.dueOn)}</dd>
        <dt>Coordination</dt><dd translate="no">{p.coordinator.label}</dd>
        <dt>Corrections</dt><dd translate="no">{p.correctionsOwner.label}</dd>
        <dt>Publication Studio</dt><dd>{p.publication ? <><span translate="no">{p.publication.title}</span> · {STATUT_TRAVAIL[p.publication.workStatus] ?? p.publication.workStatus}{p.manifestHash && p.publication.manifestHash !== p.manifestHash && " · a changé depuis ce paquet"}</> : "—"}</dd>
        {p.manifestHash && <><dt>Manifeste figé</dt><dd><code translate="no">{court(p.manifestHash)}</code> · révision <code translate="no">{court(p.revisionId)}</code></dd></>}
        <dt>Versions</dt><dd>{d.versions.map((v, i) => <span key={v.id}>{i > 0 && " · "}{`v${v.version}`} (<span>{STATUT_PAQUET[v.status]}</span>)</span>)}</dd>
      </dl>
      {canSend && (
        <div className="h7-actions revue-barre" role="toolbar" aria-label="Actions du paquet">
          <BoutonRevue commande="inviter-destinataire" label="Inviter un destinataire" disabled={!online || !["brouillon", "partage"].includes(p.status)} onClick={ouvrirInvitation} />
          {p.status === "brouillon" && <BoutonRevue commande="partager-paquet" label="Partager le paquet" primary disabled={!online || share.isPending} onClick={() => share.mutate()} />}
          {["partage", "clos"].includes(p.status) && <BoutonRevue commande="nouvelle-version" label="Nouvelle version" disabled={!online || version.isPending} onClick={() => version.mutate()} />}
        </div>
      )}
      <Liens mails={mails} />
      {invite && (
        <form className="revue-form" data-revue-invitation onSubmit={(e: FormEvent) => { e.preventDefault(); if (preview) assign.mutate(); else doPreview.mutate(); }}>
          <label htmlFor="revue-inv-email">Adresse du destinataire</label>
          <input id="revue-inv-email" type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setPreview(null); }} />
          <label htmlFor="revue-inv-nom">Nom (facultatif)</label>
          <input id="revue-inv-nom" type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <label htmlFor="revue-inv-resp">Responsabilité</label>
          <select id="revue-inv-resp" value={resp} onChange={(e) => { setResp(e.target.value as ReviewResponsibility); setPreview(null); }}>
            <option value="relecture">Relecture</option>
            <option value="approbation">Approbation (nominative)</option>
          </select>
          <fieldset className="revue-perms">
            <legend>Permissions accordées en plus de consulter et commenter</legend>
            {(["attach", "download", "export"] as const).map((k) => (
              <label key={k} className="h7-checkbox"><input type="checkbox" checked={perms[k]} onChange={(e) => { setPerms((x) => ({ ...x, [k]: e.target.checked })); setPreview(null); }} /> {k === "attach" ? "Joindre des pièces" : k === "download" ? "Télécharger" : "Exporter le rapport"}</label>
            ))}
          </fieldset>
          {preview && (
            <div data-revue-apercu className="revue-dialogue">
              <strong>Accès résultant</strong>
              <p>Ce paquet seulement : aucun accès au projet, aucune adhésion à l’organisation.</p>
              <p>Permis :</p>
              <ul className="revue-actions" data-apercu-permis>{preview.permitted.map((a) => <li key={a}>{ACTION_REVUE[a]}</li>)}</ul>
              <p>Non permis :</p>
              <ul className="revue-actions" data-apercu-non-permis>{preview.notPermitted.map((a) => <li key={a}>{ACTION_REVUE[a]}</li>)}</ul>
              <p>{`Invitation valable jusqu’au ${date(preview.invitationExpiresAt)}`}</p>
              <p>{`accès jusqu’au ${date(preview.accessExpiresAt)}`}</p>
              <p>{`réponse attendue le ${date(preview.dueOn)}`}</p>
            </div>
          )}
          <div className="h7-actions">
            <button type="submit" className="button-primary" disabled={!online || !email.trim() || doPreview.isPending || assign.isPending}>{preview ? "Confirmer l’invitation" : "Voir l’accès résultant"}</button>
            <button type="button" className="link-button" onClick={() => { setInvite(false); setPreview(null); }}>Fermer</button>
          </div>
        </form>
      )}
      <h4>Destinataires</h4>
      {d.assignments.length === 0 ? <p>Aucun destinataire.</p> : (
        <ul className="revue-list">
          {d.assignments.map((a) => (
            <li key={a.id} data-revue-destinataire={a.id} tabIndex={0} onKeyDown={onRowKey(a.id)}>
              <div>
                <strong translate="no">{a.recipient.name}</strong>{a.recipient.email && <> · <span translate="no">{a.recipient.email}</span></>} · {RESPONSABILITE[a.responsibility]} · {STATUT_AFFECTATION[a.status]}
                {a.result && <> · {a.result === "satisfaisante" ? "revue satisfaisante pour la portée" : "constats rendus"}</>}
                {a.overdue && <strong className="revue-retard"> · en retard</strong>}
                <small className="revue-block"><span>{a.accepted ? "Identité vérifiée" : `Invitation : ${a.invitation ? (a.invitation.status === "pending" ? "en attente" : a.invitation.status === "expired" ? "expirée" : a.invitation.status === "cancelled" ? "annulée" : a.invitation.status) : "au partage"}`}</span> · <span>{`accès jusqu’au ${date(a.accessExpiresAt)}`}</span>{a.revoked && <> · <span>{`révoqué le ${date(a.revoked.at)}`}</span></>}</small>
              </div>
              {canSend && !["annulee", "remplacee"].includes(a.status) && (
                <div className="admin-actions"><BoutonRevue commande="revoquer-acces" label="Révoquer l’accès" disabled={!online || revoke.isPending} onClick={() => revoke.mutate(a.id)} /></div>
              )}
            </li>
          ))}
        </ul>
      )}
      <h4>Constats ({d.findings.length})</h4>
      {d.findings.length === 0 ? <p>Aucun constat reçu.</p> : (
        <ul className="revue-constats">
          {d.findings.map((f) => (
            <li key={f.id} className="revue-constat" data-revue-constat={f.id}>
              <p className="revue-constat-texte" translate="no">{f.body}</p>
              <small className="revue-block"><span translate="no">{f.author}</span> · version {f.packageVersion} · <span className="admin-status revue-status" data-status={f.statut}>{STATUT_CONSTAT[f.statut] ?? f.statut}</span> · responsable <span translate="no">{f.responsable}</span> · révision <code translate="no">{court(f.revisionId)}</code>{f.document && <> · <span translate="no">{f.document.format.toUpperCase()}</span></>}</small>
              {f.replies.length > 0 && <ol className="revue-fil">{f.replies.map((r) => <li key={r.id}><small translate="no">{r.author}</small><p translate="no">{r.body}</p></li>)}</ol>}
              <form className="revue-reponse" onSubmit={(e) => { e.preventDefault(); if ((replies[f.id] ?? "").trim()) reply.mutate(f.id); }}>
                <label htmlFor={`revue-rep-${f.id}`}>Réponse visible des destinataires</label>
                <textarea id={`revue-rep-${f.id}`} rows={2} maxLength={4000} value={replies[f.id] ?? ""} onChange={(e) => setReplies((x) => ({ ...x, [f.id]: e.target.value }))} />
                <button type="submit" className="button-secondary" disabled={!online || !(replies[f.id] ?? "").trim()}>Répondre</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <h4>Notes internes</h4>
      <p className="h7-muted">Réservées à l’équipe : jamais montrées aux destinataires.</p>
      <ul className="revue-list">{d.internalNotes.map((n) => <li key={n.id} data-revue-note={n.id}><div><p className="revue-constat-texte" translate="no">{n.body}</p><small translate="no">{n.author}</small></div></li>)}</ul>
      <form className="revue-reponse" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }}>
        <label htmlFor="revue-note-interne">Nouvelle note interne</label>
        <textarea id="revue-note-interne" rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="submit" className="button-secondary" disabled={!online || !note.trim()}>Ajouter la note</button>
      </form>
    </div>
  );
}

export function RevuesExternes({ projectId }: { projectId: string }) {
  const online = useOnline();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["revues-equipe", projectId], queryFn: () => revuesApi.teamList(projectId), retry: false });
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [form, setForm] = useState(false);
  const [publicationId, setPublicationId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expected, setExpected] = useState("");
  const [dueOn, setDueOn] = useState("");
  const pubs = useQuery({ queryKey: ["revues-publications", projectId], queryFn: () => publicationsOf(projectId), enabled: form });
  const create = useMutation({
    mutationFn: () => revuesApi.teamCreate(projectId, { publicationId, purpose: purpose.trim(), expectedResponse: expected.trim(), ...(dueOn ? { dueOn } : {}) }),
    onSuccess: (r) => { setForm(false); setPurpose(""); setExpected(""); setDueOn(""); setOpen(r.package.id); void qc.invalidateQueries({ queryKey: ["revues-equipe", projectId] }); setMsg({ ok: true, text: "Paquet préparé (brouillon) : ajoutez des destinataires, puis partagez-le." }); },
    onError: (e) => setMsg({ ok: false, text: apiMessage(e, "Le paquet n’a pas pu être préparé.") }),
  });
  const canSend = q.data?.canSend ?? false;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (canSend && online && declencheRevue(e, "preparer-revue")) { e.preventDefault(); setForm(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (q.isError && q.error instanceof ApiError && [403, 404].includes(q.error.status)) return null;
  const packages = q.data?.packages ?? [];
  return (
    <section className="biz-card" aria-labelledby="collab-revues" data-revues-externes>
      <h2 id="collab-revues">Revues externes</h2>
      <p className="h7-muted">Un destinataire nommé examine un paquet figé d’une publication Studio candidate, sans rejoindre l’organisation ni voir le reste du projet. L’approbation et la diffusion restent celles de Studio.</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "h7-muted" : "form-error"}>{msg.text}</p>}
      {q.isPending && <p role="status">Chargement des revues…</p>}
      {canSend && (
        <div className="h7-actions revue-barre" role="toolbar" aria-label="Revues externes">
          <BoutonRevue commande="preparer-revue" label="Préparer une revue" primary disabled={!online} onClick={() => setForm(true)} />
        </div>
      )}
      {form && (
        <form className="revue-form" data-revue-preparation onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
          <label htmlFor="revue-pub">Publication Studio candidate</label>
          <select id="revue-pub" required value={publicationId} onChange={(e) => setPublicationId(e.target.value)}>
            <option value="">Choisir…</option>
            {(pubs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.studyName} — {p.title} ({STATUT_TRAVAIL[p.workStatus] ?? p.workStatus})</option>)}
          </select>
          <label htmlFor="revue-objet">Objet de la revue</label>
          <textarea id="revue-objet" rows={2} required maxLength={2000} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          <label htmlFor="revue-attendu">Réponse attendue</label>
          <textarea id="revue-attendu" rows={2} required maxLength={2000} value={expected} onChange={(e) => setExpected(e.target.value)} />
          <label htmlFor="revue-echeance">Échéance de réponse</label>
          <input id="revue-echeance" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          <div className="h7-actions">
            <button type="submit" className="button-primary" disabled={!online || !publicationId || !purpose.trim() || !expected.trim() || create.isPending}>Préparer le paquet</button>
            <button type="button" className="link-button" onClick={() => setForm(false)}>Fermer</button>
          </div>
        </form>
      )}
      {q.isSuccess && packages.length === 0 && <p>Aucune revue externe pour ce projet.</p>}
      {packages.length > 0 && (
        <ul className="revue-list">
          {packages.map((p) => (
            <li key={p.id} data-revue-equipe={p.id}>
              <div>
                <strong translate="no">{p.title}</strong> · version {p.version} · <span className="admin-status revue-status" data-status={p.status}>{STATUT_PAQUET[p.status]}</span>
                <div className="revue-suivi">
                  <span>{`Destinataires : ${p.followUp.recipients}`}</span>
                  <span>{`Réponses reçues : ${p.followUp.responses.constats + p.followUp.responses.satisfaisante} / ${p.followUp.recipients}`}</span>
                  <span>{`Constats ouverts : ${p.followUp.openFindings}`}</span>
                  <span data-revue-retards>{`Retards : ${p.followUp.overdue}`}</span>
                  {p.followUp.blockedDecision && <span>{`Décision bloquée : ${BLOCAGE[p.followUp.blockedDecision] ?? p.followUp.blockedDecision}`}</span>}
                  <span>{p.followUp.approved ? "Approuvé (Studio)" : "Non approuvé"}</span>
                  {p.followUp.approved && p.publication?.approvedSelfControl && <MarqueAutoControle data="data-revue-auto-controle" />}
                </div>
              </div>
              <div className="admin-actions">
                <button type="button" className="button-secondary" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)} data-ouvrir-revue>{open === p.id ? "Fermer" : "Ouvrir"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && <Detail projectId={projectId} id={open} canSend={canSend} onMsg={setMsg} />}
    </section>
  );
}
