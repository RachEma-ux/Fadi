/**
 * Espace de revue externe (phase 4, concept partie 4) — page dédiée, hors du module projet : un destinataire nommé
 * (client, consultant, spécialiste) y voit le paquet qui lui est partagé et rien d'autre du projet. Identité, objet,
 * échéance, actions permises et statut enregistré par Studio ; documents figés (empreintes affichées) ; constats
 * rattachés au document, à la révision du paquet ; réponses de l'équipe ; recontrôle ; réponse de relecture ; décision
 * de l'approbateur nommé. Le serveur fait seul autorité (`me.actions`) ; aucune note interne n'arrive ici.
 * Règle d'or : commandes « Nouveau constat », « Envoyer le constat », « Répondre à la revue », « Décider » (icône,
 * barre, raccourci : `modules/collaboration/commandes-revue.ts`).
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LOCALE } from "../../lib/i18n";
import { useOnline } from "../../components/SyncIndicator";
import { apiMessage } from "../../components/comptes/ComptesUI";
import {
  ACTION_REVUE, BLOCAGE, RESPONSABILITE, revuesApi, STATUT_AFFECTATION, STATUT_CONSTAT, STATUT_PAQUET, STATUT_TRAVAIL,
  type DocumentFormat, type MyReview, type ReviewAction, type ReviewFinding,
} from "../../lib/revues-api";
import { declencheRevue, propsRaccourciRevue, type CommandeRevue } from "../../modules/collaboration/commandes-revue";
import { IconeRevue, RaccourciRevue } from "../../modules/collaboration/IconeRevue";
import "./revues.css";
import { ApiError, type ControleApprobation } from "../../lib/api";
import { refusServeur } from "../../lib/auto-controle";
import { AvisAutoControle, MarqueAutoControle } from "../../components/AutoControle";

const date = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(LOCALE, { day: "2-digit", month: "long", year: "numeric" }) : "—");
const dateHeure = (iso: string) => new Date(iso).toLocaleString(LOCALE, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const court = (h: string | null | undefined) => (h ? h.slice(0, 12) : "—");
const OFFLINE = "Hors connexion : les actions de revue exigent le réseau (jamais mises en attente).";
type Msg = { ok: boolean; text: string } | null;
function Message({ msg }: { msg: Msg }) {
  return msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "h7-muted" : "form-error"}>{msg.text}</p> : null;
}

/** Bouton d'une commande de revue : icône propre, libellé, raccourci affiché et déclaré. */
function BoutonRevue({ commande, label, onClick, disabled, primary = false, type = "button" }: { commande: CommandeRevue; label: string; onClick?: () => void; disabled?: boolean; primary?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} className={primary ? "button-primary revue-commande" : "button-secondary revue-commande"} disabled={disabled} onClick={onClick} {...propsRaccourciRevue(commande)}>
      <IconeRevue commande={commande} /> {label} <RaccourciRevue commande={commande} />
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Mes revues
// ---------------------------------------------------------------------------------------------------------------------

export function MesRevuesPage() {
  const q = useQuery({ queryKey: ["revues"], queryFn: revuesApi.list });
  const reviews = q.data?.reviews ?? [];
  return (
    <main className="admin-page revue-page" data-revues>
      <h1>Revues externes</h1>
      <p className="h7-muted">Les paquets de revue qui vous sont partagés nominativement. Chaque paquet ne donne accès qu’à son contenu figé : ni le projet, ni l’organisation qui l’a préparé.</p>
      {q.isPending && <p role="status">Chargement des revues…</p>}
      {q.isError && <p role="alert" className="form-error">Impossible de charger vos revues.</p>}
      {q.isSuccess && reviews.length === 0 && <p>Aucune revue ne vous est partagée en ce moment (un accès expiré ou révoqué n’apparaît plus).</p>}
      {reviews.length > 0 && (
        <ul className="revue-list">
          {reviews.map((r) => (
            <li key={r.id} data-revue-item={r.id}>
              <div>
                <Link to={`/revues/${r.id}`}><strong translate="no">{r.title}</strong></Link> · version {r.version} · <span className="admin-status revue-status" data-status={r.status}>{STATUT_PAQUET[r.status]}</span>
                <small className="revue-block"><span translate="no">{r.projectLabel}</span>{r.responsibilities.map((x) => <span key={x}> · <span>{RESPONSABILITE[x]}</span></span>)} · <span>{`réponse attendue le ${date(r.dueOn)}`}</span> · <span>{`accès jusqu’au ${date(r.accessExpiresAt)}`}</span></small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Un paquet
// ---------------------------------------------------------------------------------------------------------------------

const FORMATS_EN_LIGNE: readonly string[] = ["svg", "pdf"];
const peut = (r: MyReview, a: ReviewAction) => r.me.actions.includes(a);

function Constat({ id, f, review, onDone }: { id: string; f: ReviewFinding; review: MyReview; onDone: (m: Msg) => void }) {
  const online = useOnline();
  const [reply, setReply] = useState("");
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["revue", id] });
  const send = useMutation({ mutationFn: () => revuesApi.reply(id, f.id, reply.trim()), onSuccess: () => { setReply(""); refresh(); onDone({ ok: true, text: "Réponse ajoutée au fil." }); }, onError: (e) => onDone({ ok: false, text: apiMessage(e, "La réponse n’a pas pu être enregistrée.") }) });
  const recheck = useMutation({ mutationFn: (outcome: "levee" | "maintenue") => revuesApi.recheck(id, f.id, outcome), onSuccess: (r) => { refresh(); onDone({ ok: true, text: `Constat ${STATUT_CONSTAT[r.statut]?.toLowerCase() ?? r.statut}.` }); }, onError: (e) => onDone({ ok: false, text: apiMessage(e, "Le recontrôle n’a pas pu être enregistré.") }) });
  return (
    <li data-constat={f.id} className="revue-constat">
      <p className="revue-constat-texte" translate="no">{f.body}</p>
      <small className="revue-block">
        <span translate="no">{f.author}</span> · {dateHeure(f.createdAt)} · version {f.packageVersion ?? "—"} · <span className="admin-status revue-status" data-status={f.statut}>{STATUT_CONSTAT[f.statut] ?? f.statut}</span>
      </small>
      <small className="revue-block">Révision <code translate="no">{court(f.revisionId)}</code>{f.document && <> · document <span translate="no">{f.document.format.toUpperCase()}</span> (<code translate="no">{court(f.document.sha256)}</code>)</>}{f.location && <> · repère <span translate="no">{f.location}</span></>}{f.objectIds.length > 0 && <> · objets <span translate="no">{f.objectIds.join(", ")}</span></>}</small>
      {f.correctionRevisionId && <small className="revue-block">Correction déclarée dans la révision <code translate="no">{court(f.correctionRevisionId)}</code>{f.recontroleRevisionId && <> ; recontrôlée sur <code translate="no">{court(f.recontroleRevisionId)}</code></>}</small>}
      {f.attachments.length > 0 && <ul className="revue-pieces">{f.attachments.map((a) => <li key={a.sha256}><a href={`/reviews/${id}/findings/${f.id}/attachments/${a.sha256}`} translate="no">{a.name}</a> ({Math.ceil(a.size / 1024)} ko)</li>)}</ul>}
      {f.replies.length > 0 && (
        <ol className="revue-fil" aria-label="Réponses">
          {f.replies.map((r) => <li key={r.id}><small><span translate="no">{r.author}</span> · {dateHeure(r.createdAt)}</small><p translate="no">{r.body}</p></li>)}
        </ol>
      )}
      <div className="h7-actions">
        {f.mine && peut(review, "recontroler") && f.statut === "corrigee" && <button type="button" className="button-secondary" disabled={!online || recheck.isPending} onClick={() => recheck.mutate("levee")} data-recontrole-levee={f.id}>Constat levé</button>}
        {f.mine && peut(review, "recontroler") && ["corrigee", "recontrolee", "cloturee"].includes(f.statut) && <button type="button" className="button-secondary" disabled={!online || recheck.isPending} onClick={() => recheck.mutate("maintenue")}>Constat maintenu</button>}
      </div>
      {peut(review, "commenter") && (
        <form className="revue-reponse" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) send.mutate(); }}>
          <label htmlFor={`reponse-${f.id}`}>Répondre dans ce fil</label>
          <textarea id={`reponse-${f.id}`} rows={2} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} />
          <button type="submit" className="button-secondary" disabled={!online || !reply.trim() || send.isPending}>Ajouter la réponse</button>
        </form>
      )}
    </li>
  );
}

export function RevuePage() {
  const { packageId = "" } = useParams();
  const online = useOnline();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["revue", packageId], queryFn: () => revuesApi.get(packageId), retry: false });
  const [msg, setMsg] = useState<Msg>(null);
  const [form, setForm] = useState(false);
  const [body, setBody] = useState("");
  const [doc, setDoc] = useState<DocumentFormat | "">("");
  const [location, setLocation] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [reponse, setReponse] = useState(false);
  const [decision, setDecision] = useState(false);
  const [note, setNote] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const review = q.data;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["revue", packageId] }); void qc.invalidateQueries({ queryKey: ["revues"] }); };

  const addFinding = useMutation({
    mutationFn: async () => {
      const attachments = await Promise.all(files.map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        return { name: file.name, mime: file.type, contentBase64: btoa(bin) };
      }));
      return revuesApi.addFinding(packageId, { body: body.trim(), ...(doc ? { document: doc } : {}), ...(location.trim() ? { location: location.trim() } : {}), ...(attachments.length ? { attachments } : {}) });
    },
    onSuccess: () => { setBody(""); setDoc(""); setLocation(""); setFiles([]); setForm(false); refresh(); setMsg({ ok: true, text: "Constat enregistré : il est rattaché à la révision de ce paquet." }); },
    onError: (e) => setMsg({ ok: false, text: apiMessage(e, "Le constat n’a pas pu être enregistré.") }),
  });
  const respond = useMutation({
    mutationFn: (result: "constats" | "satisfaisante") => revuesApi.respond(packageId, result, note.trim() || undefined),
    onSuccess: (r) => { setReponse(false); setNote(""); refresh(); setMsg({ ok: true, text: r.result === "satisfaisante" ? "Réponse enregistrée : revue satisfaisante pour la portée. Elle ne vaut pas approbation." : "Réponse enregistrée : constats rendus." }); },
    onError: (e) => setMsg({ ok: false, text: apiMessage(e, "La réponse n’a pas pu être enregistrée.") }),
  });
  // OP-6 : auto-contrôle de l'approbateur nommé, relu du serveur quand la décision lui est ouverte.
  const peutApprouver = !!review && peut(review, "approuver");
  const apercu = useQuery({ queryKey: ["controle-approbation", "revue", packageId, review?.publication.workStatus], queryFn: () => revuesApi.approvalCheck(packageId), enabled: peutApprouver, retry: false });
  const [controleRefus, setControleRefus] = useState<ControleApprobation | null>(null);
  const controle = controleRefus ?? apercu.data ?? null;
  const approbationFermee = controle !== null && controle.autoControle && !controle.autorise;
  const [confirmeAuto, setConfirmeAuto] = useState(false);
  const confirmationManquante = !!controle?.autoControle && controle.autorise && !confirmeAuto;
  const decide = useMutation({
    mutationFn: (d: "approuver" | "refuser") => (d === "approuver" ? revuesApi.approve(packageId, review!.package.manifestHash, note.trim() || undefined) : revuesApi.refuse(packageId, note.trim())),
    onSuccess: (r) => { setDecision(false); setNote(""); setConfirmeAuto(false); refresh(); setMsg({ ok: true, text: r.decision === "approuver" ? "Approbation enregistrée par Studio, pour le manifeste de ce paquet. La diffusion reste une opération distincte." : "Refus enregistré par Studio." }); },
    onError: (e) => {
      const refus = e instanceof ApiError ? refusServeur(e.status, e.body) : null;
      if (refus) setControleRefus(refus);
      setMsg({ ok: false, text: refus ? "Approbation refusée : vous avez produit ou soumis ce dossier et l’auto-contrôle n’est pas autorisé pour votre compte." : apiMessage(e, "La décision n’a pas pu être enregistrée.") });
    },
  });

  const ouvrirConstat = () => { if (review && peut(review, "commenter")) { setForm(true); setTimeout(() => area.current?.focus(), 0); } };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!review) return;
      if (declencheRevue(e, "nouveau-constat")) { e.preventDefault(); ouvrirConstat(); }
      else if (declencheRevue(e, "envoyer-constat") && form && body.trim() && online) { e.preventDefault(); addFinding.mutate(); }
      else if (declencheRevue(e, "repondre-revue") && peut(review, "repondre")) { e.preventDefault(); setReponse(true); }
      else if (declencheRevue(e, "decider-revue") && peut(review, "approuver")) { e.preventDefault(); setDecision(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (q.isPending) return <main className="admin-page revue-page"><p role="status">Chargement du paquet…</p></main>;
  if (q.isError || !review) {
    return (
      <main className="admin-page revue-page">
        <h1>Paquet de revue</h1>
        <p role="alert" className="form-error">Paquet introuvable : il ne vous est pas partagé, ou votre accès a expiré ou été révoqué.</p>
        <p><Link to="/revues">Mes revues</Link></p>
      </main>
    );
  }
  const p = review.package;
  const openFindings = review.findings.filter((f) => ["ouverte", "rouverte", "corrigee"].includes(f.statut) && f.mine).length;
  return (
    <main className="admin-page revue-page" data-revue-paquet={p.id}>
      <p><Link to="/revues">Mes revues</Link></p>
      <h1><span translate="no">{p.title}</span> · version {p.version}</h1>
      <p className="h7-muted revue-finalite">Matériel de revue : figé pour cet examen, non approuvé tant que la décision n’est pas enregistrée. Accès limité à ce paquet.</p>
      {!online && <p role="status" className="h7-muted">{OFFLINE}</p>}
      <Message msg={msg} />
      <section className="panel" aria-labelledby="revue-identite">
        <h2 id="revue-identite">Identité et objet</h2>
        <dl className="revue-dl">
          <dt>Projet</dt><dd translate="no">{p.projectLabel}</dd>
          <dt>Objet de la revue</dt><dd data-revue-objet translate="no">{p.purpose}</dd>
          <dt>Réponse attendue</dt><dd translate="no">{p.expectedResponse}</dd>
          {p.questions.length > 0 && <><dt>Questions</dt><dd><ul className="revue-questions">{p.questions.map((x) => <li key={x} translate="no">{x}</li>)}</ul></dd></>}
          <dt>Échéance de réponse</dt><dd data-revue-echeance>{date(p.dueOn)}{p.overdue && <strong className="revue-retard"> · en retard (une échéance dépassée ne vaut pas accord)</strong>}</dd>
          <dt>Coordination</dt><dd translate="no">{p.coordinator}</dd>
          <dt>Statut du paquet</dt><dd data-revue-statut><span className="admin-status revue-status" data-status={p.status}>{STATUT_PAQUET[p.status]}</span>{p.replacedBy && <> · <Link to={`/revues/${p.replacedBy}`}>version plus récente</Link></>}{p.supersedes && <> · remplace la <Link to={`/revues/${p.supersedes.id}`}>version {p.supersedes.version}</Link></>}</dd>
          <dt>Statut enregistré par Studio</dt><dd>{STATUT_TRAVAIL[review.publication.workStatus] ?? review.publication.workStatus}{!review.publication.matchesPackage && " · la publication a changé depuis ce paquet"}{review.publication.approvedSelfControl && <>{" "}<MarqueAutoControle data="data-revue-auto-controle" /></>}</dd>
          <dt>Révision examinée</dt><dd><code translate="no">{court(p.revisionId)}</code> · manifeste <code translate="no">{court(p.manifestHash)}</code></dd>
        </dl>
      </section>
      <section className="panel" aria-labelledby="revue-moi">
        <h2 id="revue-moi">Votre affectation</h2>
        <ul className="revue-list">
          {review.me.assignments.map((a) => (
            <li key={a.id}><div><strong>{RESPONSABILITE[a.responsibility]}</strong> · {STATUT_AFFECTATION[a.status]}{a.result && ` · ${a.result === "satisfaisante" ? "revue satisfaisante pour la portée" : "constats rendus"}`}<small className="revue-block">Accès jusqu’au {date(a.accessExpiresAt)}</small></div></li>
          ))}
        </ul>
        <p>Actions permises :</p>
        <ul className="revue-actions" data-revue-actions>{review.me.actions.map((a) => <li key={a}>{ACTION_REVUE[a]}</li>)}</ul>
        {review.decisionBlock && <p className="h7-muted" data-decision-bloquee>{`Décision bloquée : ${BLOCAGE[review.decisionBlock] ?? review.decisionBlock}`}</p>}
        <div className="h7-actions revue-barre" role="toolbar" aria-label="Actions de revue">
          <BoutonRevue commande="nouveau-constat" label="Nouveau constat" primary disabled={!online || !peut(review, "commenter")} onClick={ouvrirConstat} />
          <BoutonRevue commande="repondre-revue" label="Répondre à la revue" disabled={!online || !peut(review, "repondre")} onClick={() => setReponse(true)} />
          {review.me.assignments.some((a) => a.responsibility === "approbation") && <BoutonRevue commande="decider-revue" label="Décider (approbation)" disabled={!online || !peut(review, "approuver")} onClick={() => setDecision(true)} />}
          {peut(review, "exporter") && <a className="button-secondary" href={revuesApi.reportUrl(p.id)} download>Exporter le rapport</a>}
        </div>
        {reponse && (
          <div className="revue-dialogue" role="group" aria-labelledby="revue-reponse-titre" data-revue-reponse>
            <h3 id="revue-reponse-titre">Réponse de relecture</h3>
            {openFindings > 0 && <p className="h7-muted">Vous avez {openFindings} constat(s) non levé(s) : seule la réponse « constats » est possible.</p>}
            <label htmlFor="revue-note">Note (facultative)</label>
            <textarea id="revue-note" rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="h7-actions">
              <button type="button" className="button-primary" disabled={!online || respond.isPending} onClick={() => respond.mutate("constats")}>Rendre mes constats</button>
              <button type="button" className="button-secondary" disabled={!online || respond.isPending || openFindings > 0} onClick={() => respond.mutate("satisfaisante")}>Revue satisfaisante pour la portée</button>
              <button type="button" className="link-button" onClick={() => setReponse(false)}>Fermer</button>
            </div>
          </div>
        )}
        {decision && (
          <div className="revue-dialogue" role="group" aria-labelledby="revue-decision-titre" data-revue-decision>
            <h3 id="revue-decision-titre">Décision d’approbation</h3>
            <p className="h7-muted">La décision porte sur le manifeste <code translate="no">{court(p.manifestHash)}</code> de ce paquet ; elle est enregistrée par les transitions Studio. La diffusion reste distincte.</p>
            <label htmlFor="revue-motif">Commentaire (requis pour refuser)</label>
            <textarea id="revue-motif" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            {controle && <div id="revue-auto-controle"><AvisAutoControle controle={controle} confirme={confirmeAuto} surConfirme={setConfirmeAuto} id="revue-auto-controle-case" /></div>}
            <div className="h7-actions">
              <button type="button" className="button-primary" data-revue-approuver aria-describedby={controle?.autoControle ? "revue-auto-controle" : undefined} disabled={!online || decide.isPending || apercu.isPending || approbationFermee || confirmationManquante} onClick={() => decide.mutate("approuver")}>Approuver</button>
              <button type="button" className="button-secondary" disabled={!online || decide.isPending || !note.trim()} onClick={() => decide.mutate("refuser")}>Refuser</button>
              <button type="button" className="link-button" onClick={() => setDecision(false)}>Fermer</button>
            </div>
          </div>
        )}
      </section>
      <section className="panel" aria-labelledby="revue-documents">
        <h2 id="revue-documents">Documents figés</h2>
        <ul className="revue-list">
          {p.files.map((f) => (
            <li key={f.format} data-revue-document={f.format}>
              <div>
                <strong translate="no">{f.fileName}</strong> · {Math.ceil(f.size / 1024)} ko
                <small className="revue-block">Empreinte SHA-256 <code translate="no">{court(f.sha256)}</code></small>
              </div>
              <div className="admin-actions">
                {FORMATS_EN_LIGNE.includes(f.format) && <a className="button-secondary" href={revuesApi.fileUrl(p.id, f.format)} target="_blank" rel="noopener noreferrer">Consulter</a>}
                {peut(review, "telecharger") && <a className="button-secondary" href={revuesApi.fileUrl(p.id, f.format, true)} download>Télécharger</a>}
                {!FORMATS_EN_LIGNE.includes(f.format) && !peut(review, "telecharger") && <small className="h7-muted">Téléchargement non accordé</small>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel" aria-labelledby="revue-constats">
        <h2 id="revue-constats">Constats</h2>
        {form && (
          <form className="revue-form" data-constat-form onSubmit={(e: FormEvent) => { e.preventDefault(); if (body.trim()) addFinding.mutate(); }}>
            <label htmlFor="constat-texte">Constat</label>
            <textarea id="constat-texte" ref={area} rows={4} maxLength={4000} required value={body} onChange={(e) => setBody(e.target.value)} />
            <label htmlFor="constat-document">Document concerné</label>
            <select id="constat-document" name="document" value={doc} onChange={(e) => setDoc(e.target.value as DocumentFormat | "")}>
              <option value="">Paquet entier</option>
              {p.files.map((f) => <option key={f.format} value={f.format}>{f.format.toUpperCase()}</option>)}
            </select>
            <label htmlFor="constat-repere">Repère dans le document (facultatif)</label>
            <input id="constat-repere" type="text" maxLength={256} value={location} onChange={(e) => setLocation(e.target.value)} />
            {peut(review, "joindre") && <>
              <label htmlFor="constat-pieces">Pièces jointes (PDF, PNG, JPEG ; 2 Mo au plus)</label>
              <input id="constat-pieces" type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 5))} />
            </>}
            <p className="h7-muted">Le constat est rattaché à la révision <code translate="no">{court(p.revisionId)}</code> de ce paquet.</p>
            <div className="h7-actions">
              <BoutonRevue commande="envoyer-constat" label="Envoyer le constat" type="submit" primary disabled={!online || !body.trim() || addFinding.isPending} />
              <button type="button" className="link-button" onClick={() => setForm(false)}>Fermer</button>
            </div>
          </form>
        )}
        {review.findings.length === 0 ? <p>Aucun constat pour le moment.</p> : (
          <ul className="revue-constats">{review.findings.map((f) => <Constat key={f.id} id={p.id} f={f} review={review} onDone={setMsg} />)}</ul>
        )}
      </section>
    </main>
  );
}
