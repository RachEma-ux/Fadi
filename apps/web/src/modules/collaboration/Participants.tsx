/**
 * Collaboration > Équipe et participants (Issue #262, phase 2 ; concept Users Management, parties 1 à 3).
 *
 * Deux vues des MÊMES participations : « Participants », l'annuaire complet (comptes, contacts sans compte, organisations,
 * participations terminées), et « Équipe », les participations en cours qui portent des responsabilités — jamais un
 * second annuaire. Trois états distincts sont affichés : le compte, la participation et l'invitation. Le propriétaire
 * enregistre des contacts (sans aucun droit), modifie rôle métier, partie représentée, responsabilités et début,
 * attribue des rôles par portée, suspend, réactive ou termine une participation après un aperçu de l'impact, ouvre une
 * nouvelle participation au retour d'une personne (anciens droits non restaurés) et clôt le projet (déclaratif). Un
 * responsable du projet efface un contact sans compte à sa demande. Aucune fusion automatique : une fiche proche est
 * proposée, jamais fusionnée. Le serveur vérifie chaque droit à chaque requête.
 *
 * Règle d'or (AGENTS.md) : chaque commande a son icône, sa barre et son raccourci (`commandes-collaboration.ts`).
 */
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { LOCALE } from "../../lib/i18n";
import { apiMessage, ConfirmDialog } from "../../components/comptes/ComptesUI";
import { COMMANDES_COLLABORATION, declenche, propsRaccourci, type CommandeParticipants } from "./commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "./IconeCollaboration";
import {
  BUSINESS_ROLES, participantsApi, RESPONSIBILITIES, ROLE_SCOPES,
  type BusinessRole, type ContactInput, type ExistingMatches, type Participant, type ParticipationStatus, type Responsibility, type RoleScope, type StatusChange,
} from "./participants-api";

const STATUS_LABEL: Record<ParticipationStatus, string> = { contact: "Contact, sans accès", active: "Active", suspendue: "Suspendue", terminee: "Terminée" };
const ACCOUNT_LABEL: Record<"active" | "suspended" | "closed", string> = { active: "Compte actif", suspended: "Compte suspendu", closed: "Compte fermé" };
const ROLE_LABEL: Record<BusinessRole, string> = { lecteur: "Lecteur", concepteur: "Concepteur", relecteur: "Relecteur", coordinateur: "Coordinateur", approbateur: "Approbateur", diffuseur: "Diffuseur" };
const ROLE_HELP: Record<BusinessRole, string> = {
  lecteur: "lire et commenter", concepteur: "modifier le projet et exporter", relecteur: "examiner et consigner des constats",
  coordinateur: "organiser observations et responsabilités", approbateur: "approuver ou refuser les dossiers Studio", diffuseur: "diffuser les dossiers approuvés",
};
const SCOPE_LABEL: Record<RoleScope, string> = { projet: "Projet", etude: "Étude", variante: "Variante", revision: "Révision", documents: "Documents" };
const RESP_LABEL: Record<Responsibility, string> = { diriger: "Diriger", produire: "Produire", coordonner: "Coordonner", verifier: "Vérifier", approuver: "Approuver", diffuser: "Diffuser" };
const ACCESS_LABEL = { proprietaire: "propriétaire", editeur: "modification", lecteur: "lecture et commentaires" } as const;

const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString(LOCALE) : "—");

/** Nom affiché : l'identité du compte, le nom du contact (effacé : libellé traduit), ou l'organisation. */
function Nom({ p }: { p: Participant }) {
  if (p.organization) return <b translate="no">{p.organization.name}</b>;
  if (p.person?.erased) return <b className="h7-muted">Contact effacé</b>;
  const a = p.person?.account;
  return <b translate="no">{a ? a.displayName || a.email : p.person?.displayName}</b>;
}
const nomTexte = (p: Participant) => p.organization?.name ?? (p.person?.erased ? "Contact effacé" : p.person?.account ? p.person.account.displayName || p.person.account.email : p.person?.displayName ?? "");

/** Bouton d'une commande : icône propre, libellé, raccourci affiché et déclaré. */
function Commande({ commande, onClick, disabled = false, label }: { commande: CommandeParticipants; onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" className="button-secondary participants-commande" disabled={disabled} aria-label={label} {...propsRaccourci(commande)} onClick={onClick}>
      <IconeCollaboration commande={commande} />
      {COMMANDES_COLLABORATION[commande].libelle}
      <RaccourciCollaboration commande={commande} />
    </button>
  );
}

type Mode = { kind: "modifier" | "roles"; id: string } | null;
type Dialogue = { kind: "statut"; p: Participant; change: StatusChange } | { kind: "effacer"; p: Participant } | null;

export function ParticipantsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["participants", projectId], queryFn: () => participantsApi.list(projectId) });
  const [tab, setTab] = useState<"participants" | "equipe">("participants");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [dialog, setDialog] = useState<Dialogue>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["participants", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["collaboration", projectId] });
  };
  const done = (text: string) => { setError(null); setNotice(text); refresh(); };
  const closure = useMutation({
    mutationFn: (closed: boolean) => participantsApi.setClosure(projectId, closed),
    onSuccess: (r) => done(r.closedAt ? "Projet clos : aucun droit n’a changé ; le délai de conservation des contacts court." : "Projet rouvert : les contacts sont conservés tant qu’il reste ouvert."),
    onError: (err) => setError(apiMessage(err, "La clôture n’a pas pu être enregistrée.")),
  });
  const returning = useMutation({
    mutationFn: (id: string) => participantsApi.returnParticipant(projectId, id),
    onSuccess: () => done("Nouvelle participation ouverte (contact, sans accès) : donnez-lui un accès par le partage ; les anciens droits ne sont pas restaurés."),
    onError: (err) => setError(apiMessage(err, "Le retour n’a pas pu être enregistré.")),
  });
  if (query.isLoading) return <p role="status">Lecture des participants…</p>;
  if (!query.data) return <p role="alert">Impossible de lire les participants du projet.</p>;
  const v = query.data;
  const manage = v.you.canManage;
  const closed = Boolean(v.project.closedAt);
  const busy = closure.isPending || returning.isPending;
  const team = v.participants.filter((p) => p.status !== "terminee" && p.responsibilities.length > 0);

  const rowKeys = (p: Participant) => (e: KeyboardEvent) => {
    if (!manage && !v.you.canErase) return;
    const run = (c: CommandeParticipants, f: () => void) => { if (declenche(e, c)) { e.preventDefault(); e.stopPropagation(); f(); return true; } return false; };
    if (manage && p.status !== "terminee") {
      if (run("modifier-participation", () => setMode({ kind: "modifier", id: p.id }))) return;
      if (run("attribuer-role", () => setMode({ kind: "roles", id: p.id }))) return;
      if (!p.isOwner && p.status === "active" && run("suspendre-participation", () => setDialog({ kind: "statut", p, change: "suspendre" }))) return;
      if (!p.isOwner && p.status === "suspendue" && run("reactiver-participation", () => setDialog({ kind: "statut", p, change: "reactiver" }))) return;
      if (!p.isOwner && run("terminer-participation", () => setDialog({ kind: "statut", p, change: "terminer" }))) return;
    }
    if (manage && p.status === "terminee" && !p.person?.erased && run("retour-participant", () => returning.mutate(p.id))) return;
    if (v.you.canErase && p.person && !p.person.account && !p.person.erased) run("effacer-contact", () => setDialog({ kind: "effacer", p }));
  };

  return (
    <section
      className="biz-card participants-section"
      aria-labelledby="collab-participants"
      data-participants
      onKeyDown={(e) => {
        if (!manage) return;
        if (declenche(e, "nouveau-contact")) { e.preventDefault(); setCreating(true); return; }
        if (declenche(e, closed ? "rouvrir-projet" : "clore-projet")) { e.preventDefault(); if (!busy) closure.mutate(!closed); }
      }}
    >
      <h2 id="collab-participants">Équipe et participants</h2>
      <p className="biz-sub">Annuaire du projet : comptes, contacts sans compte et organisations. Une fiche n’ouvre aucun accès : seuls le partage et les rôles du projet en donnent.</p>
      <div className="participants-cloture" data-cloture={closed ? "clos" : "ouvert"}>
        <span className="h7-chip">{closed ? `Projet clos le ${fmtDate(v.project.closedAt)}` : "Projet ouvert"}</span>
        {manage && (closed
          ? <Commande commande="rouvrir-projet" disabled={busy} onClick={() => closure.mutate(false)} />
          : <Commande commande="clore-projet" disabled={busy} onClick={() => closure.mutate(true)} />)}
        <small className="h7-muted">La clôture est déclarative : elle ne change aucun droit. Un contact sans compte est effacé 2 ans après la clôture de tous ses projets, plus tôt à sa demande. Réserve : d’éventuelles obligations légales de conservation (garantie décennale…) restent à vérifier par le conseil juridique du maître d’ouvrage.</small>
      </div>
      <div className="h7-tabs" role="tablist" aria-label="Vues de l’annuaire">
        <button type="button" role="tab" id="tab-participants" aria-controls="panel-participants" aria-selected={tab === "participants"} className={tab === "participants" ? "sel" : ""} onClick={() => setTab("participants")}>
          {`Participants (${v.participants.length})`}
        </button>
        <button type="button" role="tab" id="tab-equipe" aria-controls="panel-equipe" aria-selected={tab === "equipe"} className={tab === "equipe" ? "sel" : ""} onClick={() => setTab("equipe")}>
          {`Équipe (${team.length})`}
        </button>
      </div>
      {tab === "participants" ? (
        <div role="tabpanel" id="panel-participants" aria-labelledby="tab-participants">
          {manage && (
            <div className="h7-actions">
              <Commande commande="nouveau-contact" disabled={creating} onClick={() => setCreating(true)} />
            </div>
          )}
          {creating && manage && <ContactForm projectId={projectId} onClose={() => setCreating(false)} onDone={(t) => { setCreating(false); done(t); }} onOpen={(id) => { setCreating(false); setMode({ kind: "modifier", id }); }} />}
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Annuaire des participants">
            <table className="programme-table participants-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Compte</th>
                  <th>Participation</th>
                  <th>Invitation</th>
                  <th>Rôles par portée</th>
                  <th>Accès effectif</th>
                  <th>Période</th>
                  {(manage || v.you.canErase) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {v.participants.map((p) => (
                  <tr key={p.id} data-participant={nomTexte(p)} data-statut={p.status} onKeyDown={rowKeys(p)}>
                    <td>
                      <Nom p={p} />
                      {p.isOwner ? <span className="h7-chip">propriétaire</span> : null}
                      {p.isYou ? <small className="h7-muted"> (vous)</small> : null}
                      <div className="participants-fiche">
                        {p.kind === "organisation" ? <small className="h7-muted">Organisation</small> : null}
                        {p.businessRole ? <small translate="no">{p.businessRole}</small> : null}
                        {p.person?.jobTitle ? <small translate="no">{p.person.jobTitle}</small> : null}
                        {p.representedOrganization ? <small>{"Représente "}<span translate="no">{p.representedOrganization.name}</span></small> : null}
                        {p.person?.workEmail ? <small translate="no" data-coordonnee="email">{p.person.workEmail}</small> : null}
                        {p.person?.workPhone ? <small translate="no" data-coordonnee="telephone">{p.person.workPhone}</small> : null}
                        {p.responsibilities.length ? <small>{p.responsibilities.map((r) => RESP_LABEL[r]).join(" · ")}</small> : null}
                      </div>
                    </td>
                    <td data-etat-compte={p.person?.account?.status ?? "aucun"}>{p.kind === "organisation" ? "—" : p.person?.account ? ACCOUNT_LABEL[p.person.account.status] : "Sans compte"}</td>
                    <td><span className="h7-chip" data-etat-participation={p.status}>{STATUS_LABEL[p.status]}</span></td>
                    <td data-etat-invitation={p.pendingInvitations}>{v.you.responsible ? (p.pendingInvitations ? `${p.pendingInvitations} invitation(s) en attente` : "Aucune en attente") : "—"}</td>
                    <td>
                      {p.roles.length ? (
                        <ul className="participants-roles">
                          {p.roles.map((r) => (
                            <li key={r.id} data-role={`${r.role}:${r.scopeType}`}>
                              {ROLE_LABEL[r.role]}
                              <small className="h7-muted">{` · ${SCOPE_LABEL[r.scopeType]}${r.scopeId ? ` : ${r.scopeId}` : ""} · ${r.origin === "acces" ? "du partage" : "attribué"}`}</small>
                            </li>
                          ))}
                        </ul>
                      ) : "—"}
                    </td>
                    <td data-acces={p.access?.role ?? "aucun"}>
                      {p.access ? (
                        <>
                          {ACCESS_LABEL[p.access.role]}
                          {p.access.canExport && p.access.role !== "proprietaire" ? <small className="h7-muted"> · export</small> : null}
                          {p.access.canApprove && p.access.role !== "proprietaire" ? <small className="h7-muted"> · approbation</small> : null}
                          {p.access.canPublish && p.access.role !== "proprietaire" ? <small className="h7-muted"> · diffusion</small> : null}
                        </>
                      ) : "Aucun accès"}
                    </td>
                    <td>{p.endsOn ? `${fmtDate(p.startsOn)} → ${fmtDate(p.endsOn)}` : p.startsOn ? `depuis le ${fmtDate(p.startsOn)}` : "—"}</td>
                    {(manage || v.you.canErase) && (
                      <td className="participants-actions">
                        {manage && p.status !== "terminee" && <Commande commande="modifier-participation" label={`Modifier la participation de ${nomTexte(p)}`} onClick={() => setMode({ kind: "modifier", id: p.id })} />}
                        {manage && p.status !== "terminee" && <Commande commande="attribuer-role" label={`Rôles du participant ${nomTexte(p)}`} onClick={() => setMode({ kind: "roles", id: p.id })} />}
                        {manage && !p.isOwner && p.status === "active" && <Commande commande="suspendre-participation" label={`Suspendre la participation de ${nomTexte(p)}`} onClick={() => setDialog({ kind: "statut", p, change: "suspendre" })} />}
                        {manage && !p.isOwner && p.status === "suspendue" && <Commande commande="reactiver-participation" label={`Réactiver la participation de ${nomTexte(p)}`} onClick={() => setDialog({ kind: "statut", p, change: "reactiver" })} />}
                        {manage && !p.isOwner && p.status !== "terminee" && <Commande commande="terminer-participation" label={`Terminer la participation de ${nomTexte(p)}`} onClick={() => setDialog({ kind: "statut", p, change: "terminer" })} />}
                        {manage && p.status === "terminee" && !p.person?.erased && <Commande commande="retour-participant" disabled={busy} label={`Nouvelle participation pour ${nomTexte(p)}`} onClick={() => returning.mutate(p.id)} />}
                        {v.you.canErase && p.person && !p.person.account && !p.person.erased && <Commande commande="effacer-contact" label={`Effacer le contact ${nomTexte(p)}`} onClick={() => setDialog({ kind: "effacer", p })} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!v.you.responsible && <p className="h7-muted">Coordonnées des contacts et invitations visibles des seuls responsables du projet.</p>}
          {mode && manage && (() => {
            const p = v.participants.find((x) => x.id === mode.id);
            if (!p) return null;
            return mode.kind === "modifier"
              ? <EditForm key={p.id} projectId={projectId} p={p} onClose={() => setMode(null)} onDone={(t) => { setMode(null); done(t); }} />
              : <RolesForm key={p.id} projectId={projectId} p={p} onClose={() => setMode(null)} onDone={done} onError={setError} />;
          })()}
        </div>
      ) : (
        <div role="tabpanel" id="panel-equipe" aria-labelledby="tab-equipe">
          <p className="biz-sub">Vue des participations en cours qui portent une responsabilité : mêmes fiches que l’annuaire, aucun second annuaire.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Équipe du projet">
            <table className="programme-table participants-equipe">
              <thead>
                <tr><th>Responsabilité</th><th>Participants</th></tr>
              </thead>
              <tbody>
                {RESPONSIBILITIES.map((r) => {
                  const holders = team.filter((p) => p.responsibilities.includes(r));
                  return (
                    <tr key={r} data-responsabilite={r}>
                      <th scope="row">{RESP_LABEL[r]}</th>
                      <td>
                        {holders.length ? (
                          <ul className="participants-roles">
                            {holders.map((p) => (
                              <li key={p.id} data-membre-equipe={nomTexte(p)}>
                                <Nom p={p} />
                                {p.businessRole ? <small translate="no">{` · ${p.businessRole}`}</small> : null}
                                <small className="h7-muted">{` · ${STATUS_LABEL[p.status]}`}</small>
                              </li>
                            ))}
                          </ul>
                        ) : <span className="h7-muted">Aucun participant</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {dialog?.kind === "statut" && <StatusDialog projectId={projectId} p={dialog.p} change={dialog.change} onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); done(t); }} />}
      {dialog?.kind === "effacer" && <EraseDialog projectId={projectId} p={dialog.p} onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); done(t); }} />}
      {notice && <p className="h7-muted members-notice" role="status">{notice}</p>}
      {error && <p className="h7-error" role="alert">{error}</p>}
    </section>
  );
}

function Responsabilites({ value, onChange }: { value: Responsibility[]; onChange: (v: Responsibility[]) => void }) {
  return (
    <fieldset className="participants-responsabilites wide">
      <legend>Responsabilités d’équipe</legend>
      {RESPONSIBILITIES.map((r) => (
        <label key={r} className="participants-case">
          <input type="checkbox" checked={value.includes(r)} onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))} />
          {RESP_LABEL[r]}
        </label>
      ))}
    </fieldset>
  );
}

/** Fiches proches renvoyées par le serveur (409) ou par la recherche : jamais fusionnées, ouvertes ou réutilisées. */
function Correspondances({ matches, onOpen, onReuse, onPickOrg }: { matches: ExistingMatches; onOpen: (id: string) => void; onReuse: (personId: string) => void; onPickOrg: (id: string, name: string) => void }) {
  if (!matches.people.length && !matches.organizations.length && !matches.accountExists) return <p className="h7-muted" role="status">Aucune fiche proche.</p>;
  return (
    <div className="participants-correspondances" role="status" data-correspondances>
      {matches.accountExists && <p>Un compte Fadi existe pour cette adresse : donnez-lui accès par le partage (« Membres du projet »).</p>}
      {matches.people.length > 0 && (
        <ul className="participants-roles">
          {matches.people.map((m) => (
            <li key={m.id} data-correspondance={m.displayName ?? ""}>
              <b translate="no">{m.displayName}</b>
              {m.jobTitle ? <small translate="no">{` · ${m.jobTitle}`}</small> : null}
              <small className="h7-muted">{m.hasAccount ? " · compte" : " · contact"}</small>{" "}
              {m.participationId
                ? <button type="button" className="button-secondary" onClick={() => onOpen(m.participationId!)}>Ouvrir la fiche</button>
                : <button type="button" className="button-secondary" onClick={() => onReuse(m.id)}>Ajouter cette fiche au projet</button>}
            </li>
          ))}
        </ul>
      )}
      {matches.organizations.length > 0 && (
        <ul className="participants-roles">
          {matches.organizations.map((o) => (
            <li key={o.id} data-correspondance-organisation={o.name}>
              <b translate="no">{o.name}</b>{" "}
              <button type="button" className="button-secondary" onClick={() => onPickOrg(o.id, o.name)}>Choisir cette organisation</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactForm({ projectId, onClose, onDone, onOpen }: { projectId: string; onClose: () => void; onDone: (t: string) => void; onOpen: (participationId: string) => void }) {
  const [kind, setKind] = useState<"personne" | "organisation">("personne");
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [orgName, setOrgName] = useState("");
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [businessRole, setBusinessRole] = useState("");
  const [resp, setResp] = useState<Responsibility[]>([]);
  const [matches, setMatches] = useState<ExistingMatches | null>(null);
  const [distinct, setDistinct] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useMutation({
    mutationFn: () => participantsApi.search(projectId, name.trim(), kind === "personne" ? workEmail.trim() : ""),
    onSuccess: (m) => { setMatches(m); setError(null); },
    onError: (err) => setError(apiMessage(err, "La recherche n’a pas pu aboutir.")),
  });
  const create = useMutation({
    mutationFn: (input: ContactInput) => participantsApi.createContact(projectId, input),
    onSuccess: () => onDone(kind === "personne" ? "Contact enregistré, sans aucun accès au projet." : "Organisation ajoutée à l’annuaire, sans aucun accès."),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && err.body && typeof err.body === "object") {
        const b = err.body as { matches?: ExistingMatches; blocking?: boolean; participationId?: string };
        if (b.matches) setMatches(b.matches);
        setBlocking(Boolean(b.blocking));
        if (b.participationId) { onOpen(b.participationId); return; }
      }
      setError(apiMessage(err, "Le contact n’a pas pu être enregistré."));
    },
  });
  const common = { businessRole: businessRole.trim() || null, responsibilities: resp, confirmDistinct: distinct };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate(kind === "personne"
      ? { kind, displayName: name.trim(), jobTitle: jobTitle.trim() || null, workEmail: workEmail.trim() || null, workPhone: workPhone.trim() || null, ...(org ? { representedOrganizationId: org.id } : { representedOrganizationName: orgName.trim() || null }), ...common }
      : { kind, name: name.trim(), ...common });
  };
  return (
    <form className="h7-form participants-form" onSubmit={submit} data-formulaire-contact aria-label="Nouveau contact">
      <fieldset className="wide participants-type">
        <legend>Type de fiche</legend>
        <label className="participants-case"><input type="radio" name="contact-kind" checked={kind === "personne"} onChange={() => setKind("personne")} />Personne sans compte</label>
        <label className="participants-case"><input type="radio" name="contact-kind" checked={kind === "organisation"} onChange={() => setKind("organisation")} />Organisation</label>
      </fieldset>
      <label>
        {kind === "personne" ? "Nom" : "Nom de l’organisation"}
        <input value={name} required maxLength={200} onChange={(e) => { setName(e.target.value); setDistinct(false); }} data-champ="nom" />
      </label>
      {kind === "personne" && (
        <>
          <label>Fonction<input value={jobTitle} maxLength={200} onChange={(e) => setJobTitle(e.target.value)} data-champ="fonction" /></label>
          <label>E-mail professionnel<input type="email" value={workEmail} maxLength={254} onChange={(e) => setWorkEmail(e.target.value)} data-champ="email" /></label>
          <label>Téléphone professionnel<input type="tel" value={workPhone} maxLength={40} onChange={(e) => setWorkPhone(e.target.value)} data-champ="telephone" /></label>
          <label>
            Organisation représentée
            <input value={org ? org.name : orgName} maxLength={200} onChange={(e) => { setOrg(null); setOrgName(e.target.value); }} data-champ="organisation" />
          </label>
        </>
      )}
      <label>Rôle métier déclaré (saisie libre)<input value={businessRole} maxLength={200} placeholder="ingénieur structure, client…" onChange={(e) => setBusinessRole(e.target.value)} data-champ="role-metier" /></label>
      <Responsabilites value={resp} onChange={setResp} />
      <p className="h7-muted">Une fiche de contact ne donne aucun accès et n’envoie aucune invitation. Coordonnées visibles des seuls responsables du projet. Les listes de rôles métier et de types d’organisation restent en saisie libre tant que le maître d’ouvrage ne les a pas fournies.</p>
      {matches && <Correspondances matches={matches} onOpen={onOpen} onReuse={(personId) => create.mutate({ kind: "personne", personId, ...common })} onPickOrg={(id, n) => { setOrg({ id, name: n }); setMatches(null); }} />}
      {matches && !blocking && (matches.people.length > 0 || matches.organizations.length > 0 || matches.accountExists) && (
        <label className="participants-case wide">
          <input type="checkbox" checked={distinct} onChange={(e) => setDistinct(e.target.checked)} data-confirmer-distinct />
          Il s’agit d’une autre fiche : créer une fiche distincte
        </label>
      )}
      <div className="h7-actions">
        <button type="button" className="button-secondary" disabled={!name.trim() || search.isPending} onClick={() => search.mutate()}>Rechercher l’existant</button>
        <button type="submit" className="button-primary" disabled={!name.trim() || create.isPending}>Enregistrer le contact</button>
        <button type="button" className="button-secondary" onClick={onClose}>Annuler</button>
      </div>
      {error && <p className="h7-error wide" role="alert">{error}</p>}
    </form>
  );
}

function EditForm({ projectId, p, onClose, onDone }: { projectId: string; p: Participant; onClose: () => void; onDone: (t: string) => void }) {
  const contact = Boolean(p.person && !p.person.account && !p.person.erased);
  const [businessRole, setBusinessRole] = useState(p.businessRole ?? "");
  const [orgName, setOrgName] = useState(p.representedOrganization?.name ?? "");
  const [resp, setResp] = useState<Responsibility[]>(p.responsibilities);
  const [startsOn, setStartsOn] = useState(p.startsOn ?? "");
  const [name, setName] = useState(p.person?.displayName ?? "");
  const [jobTitle, setJobTitle] = useState(p.person?.jobTitle ?? "");
  const [workEmail, setWorkEmail] = useState(p.person?.workEmail ?? "");
  const [workPhone, setWorkPhone] = useState(p.person?.workPhone ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const orgChanged = orgName.trim() !== (p.representedOrganization?.name ?? "");
      return participantsApi.update(projectId, p.id, {
        businessRole: businessRole.trim() || null, responsibilities: resp, ...(startsOn ? { startsOn } : {}),
        ...(orgChanged ? (orgName.trim() ? { representedOrganizationName: orgName.trim(), confirmDistinct: true } : { representedOrganizationId: null }) : {}),
        ...(contact ? { displayName: name.trim(), jobTitle: jobTitle.trim() || null, workEmail: workEmail.trim() || null, workPhone: workPhone.trim() || null } : {}),
      });
    },
    onSuccess: () => onDone("Participation modifiée."),
    onError: (err) => setError(apiMessage(err, "La modification n’a pas pu être enregistrée.")),
  });
  return (
    <form className="h7-form participants-form" data-formulaire-participation={p.id} aria-label={`Modifier la participation de ${nomTexte(p)}`} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h3 className="wide">{`Participation de ${nomTexte(p)}`}</h3>
      {contact && (
        <>
          <label>Nom<input value={name} required maxLength={200} onChange={(e) => setName(e.target.value)} /></label>
          <label>Fonction<input value={jobTitle} maxLength={200} onChange={(e) => setJobTitle(e.target.value)} /></label>
          <label>E-mail professionnel<input type="email" value={workEmail} maxLength={254} onChange={(e) => setWorkEmail(e.target.value)} /></label>
          <label>Téléphone professionnel<input type="tel" value={workPhone} maxLength={40} onChange={(e) => setWorkPhone(e.target.value)} /></label>
        </>
      )}
      <label>Rôle métier déclaré (saisie libre)<input value={businessRole} maxLength={200} onChange={(e) => setBusinessRole(e.target.value)} data-champ="role-metier" /></label>
      {p.kind === "personne" && <label>Organisation représentée<input value={orgName} maxLength={200} onChange={(e) => setOrgName(e.target.value)} /></label>}
      <label>Début de la participation<input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></label>
      <Responsabilites value={resp} onChange={setResp} />
      <div className="h7-actions">
        <button type="submit" className="button-primary" disabled={save.isPending}>Enregistrer</button>
        <button type="button" className="button-secondary" onClick={onClose}>Fermer</button>
      </div>
      {error && <p className="h7-error wide" role="alert">{error}</p>}
    </form>
  );
}

function RolesForm({ projectId, p, onClose, onDone, onError }: { projectId: string; p: Participant; onClose: () => void; onDone: (t: string) => void; onError: (t: string) => void }) {
  const [role, setRole] = useState<BusinessRole>("lecteur");
  const [scope, setScope] = useState<RoleScope>("projet");
  const [scopeId, setScopeId] = useState("");
  const assign = useMutation({
    mutationFn: () => participantsApi.assignRole(projectId, p.id, role, scope, scope === "projet" ? null : scopeId.trim()),
    onSuccess: () => onDone(`Rôle ${ROLE_LABEL[role]} attribué.`),
    onError: (err) => onError(apiMessage(err, "Le rôle n’a pas pu être attribué.")),
  });
  const remove = useMutation({
    mutationFn: (roleId: string) => participantsApi.removeRole(projectId, p.id, roleId),
    onSuccess: () => onDone("Rôle retiré : l’accès qu’il donnait cesse à la requête suivante."),
    onError: (err) => onError(apiMessage(err, "Le rôle n’a pas pu être retiré.")),
  });
  return (
    <form className="h7-form participants-form" data-formulaire-roles={p.id} aria-label={`Rôles du participant ${nomTexte(p)}`} onSubmit={(e) => { e.preventDefault(); assign.mutate(); }}>
      <h3 className="wide">{`Rôles du participant ${nomTexte(p)}`}</h3>
      <ul className="participants-roles wide">
        {p.roles.length === 0 && <li className="h7-muted">Aucun rôle : aucun accès au projet.</li>}
        {p.roles.map((r) => (
          <li
            key={r.id}
            data-role={`${r.role}:${r.scopeType}`}
            onKeyDown={(e) => {
              if (r.origin === "attribution" && !remove.isPending && declenche(e, "retirer-role")) { e.preventDefault(); e.stopPropagation(); remove.mutate(r.id); }
            }}
          >
            {`${ROLE_LABEL[r.role]} · ${SCOPE_LABEL[r.scopeType]}${r.scopeId ? ` : ${r.scopeId}` : ""} · ${r.origin === "acces" ? "du partage" : "attribué"}`}{" "}
            {r.origin === "attribution"
              ? <Commande commande="retirer-role" disabled={remove.isPending} label={`Retirer le rôle ${ROLE_LABEL[r.role]}`} onClick={() => remove.mutate(r.id)} />
              : <small className="h7-muted">se change dans « Membres du projet »</small>}
          </li>
        ))}
      </ul>
      <label>
        Rôle
        <select value={role} onChange={(e) => setRole(e.target.value as BusinessRole)} data-champ="role">
          {BUSINESS_ROLES.map((r) => <option key={r} value={r}>{`${ROLE_LABEL[r]} — ${ROLE_HELP[r]}`}</option>)}
        </select>
      </label>
      <label>
        Portée
        <select value={scope} onChange={(e) => setScope(e.target.value as RoleScope)} data-champ="portee">
          {ROLE_SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
        </select>
      </label>
      {scope !== "projet" && <label>Identifiant de la portée<input value={scopeId} required maxLength={120} onChange={(e) => setScopeId(e.target.value)} /></label>}
      <p className="h7-muted">Seuls les rôles de portée Projet donnent un accès ; une portée plus étroite est enregistrée sans droit tant qu’aucun écran ne l’évalue. Un contact sans compte ne reçoit aucun rôle avant d’avoir accepté une invitation.</p>
      <div className="h7-actions">
        <button type="submit" className="button-primary participants-commande" disabled={assign.isPending || (scope !== "projet" && !scopeId.trim())} {...propsRaccourci("attribuer-role")}>
          <IconeCollaboration commande="attribuer-role" />
          Attribuer le rôle
          <RaccourciCollaboration commande="attribuer-role" />
        </button>
        <button type="button" className="button-secondary" onClick={onClose}>Fermer</button>
      </div>
    </form>
  );
}

const CHANGE_TITLE: Record<StatusChange, string> = { suspendre: "Suspendre la participation", reactiver: "Réactiver la participation", terminer: "Terminer la participation" };

/** Aperçu de l'impact (droits, invitations, travaux affectés, réservation) avant de confirmer un changement de statut. */
function StatusDialog({ projectId, p, change, onClose, onDone }: { projectId: string; p: Participant; change: StatusChange; onClose: () => void; onDone: (t: string) => void }) {
  const impact = useQuery({ queryKey: ["participant-impact", projectId, p.id, change], queryFn: () => participantsApi.impact(projectId, p.id, change), retry: false });
  const [error, setError] = useState<string | null>(null);
  const apply = useMutation({
    mutationFn: () => participantsApi.setStatus(projectId, p.id, change),
    onSuccess: () => onDone(change === "suspendre" ? `${nomTexte(p)} : participation suspendue, accès retiré.` : change === "reactiver" ? `${nomTexte(p)} : participation réactivée.` : `${nomTexte(p)} : participation terminée, accès retiré.`),
    onError: (err) => setError(apiMessage(err, "Le changement n’a pas pu être enregistré.")),
  });
  const i = impact.data;
  const lines: ReactNode[] = [];
  if (i) {
    if (i.accessWithdrawn) lines.push(<li key="a">{`Accès retiré dès la requête suivante (aujourd’hui : ${i.access ? ACCESS_LABEL[i.access.role] : "aucun"}).`}</li>);
    else if (i.accessRestored) lines.push(<li key="a">L’accès des rôles toujours portés revient dès la requête suivante.</li>);
    else lines.push(<li key="a">Aucun accès en cours.</li>);
    lines.push(<li key="r">{`Rôles par portée : ${i.roles.length ? i.roles.map((r) => `${ROLE_LABEL[r.role]} — ${SCOPE_LABEL[r.scopeType]}`).join(" · ") : "aucun"}.`}</li>);
    lines.push(<li key="i">{change === "terminer" ? `Invitations en attente annulées : ${i.invitationsCancelled}.` : `Invitations en attente : ${i.pendingInvitations}.`}</li>);
    lines.push(<li key="w">{`Travaux affectés à réaffecter : ${i.openObservations} observation(s) Studio, ${i.openTasks} tâche(s).`}</li>);
    if (i.editingLockReleased) lines.push(<li key="l">La réservation d’édition de cette personne est libérée.</li>);
    if (i.responsibilities.length) lines.push(<li key="s">{`Responsabilités d’équipe : ${i.responsibilities.map((r) => RESP_LABEL[r]).join(" · ")}.`}</li>);
    if (change === "terminer") lines.push(<li key="h">La participation reste dans l’historique ; un retour ouvrira une nouvelle participation, sans restaurer les anciens droits.</li>);
  }
  return (
    <ConfirmDialog title={CHANGE_TITLE[change]} confirmLabel={CHANGE_TITLE[change]} danger={change !== "reactiver"} busy={apply.isPending} confirmDisabled={!i} onConfirm={() => apply.mutate()} onClose={onClose}>
      <p><Nom p={p} /></p>
      {impact.isLoading && <p role="status">Calcul de l’impact…</p>}
      {impact.isError && <p role="alert">{apiMessage(impact.error, "L’impact n’a pas pu être calculé.")}</p>}
      {i && <ul data-impact={change}>{lines}</ul>}
      {error && <p className="h7-error" role="alert">{error}</p>}
    </ConfirmDialog>
  );
}

function EraseDialog({ projectId, p, onClose, onDone }: { projectId: string; p: Participant; onClose: () => void; onDone: (t: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const erase = useMutation({
    mutationFn: () => participantsApi.erase(projectId, p.id),
    onSuccess: () => onDone("Contact effacé : nom et coordonnées supprimés, trace de participation conservée sans donnée personnelle."),
    onError: (err) => setError(apiMessage(err, "L’effacement n’a pas pu être enregistré.")),
  });
  return (
    <ConfirmDialog title="Effacer le contact" confirmLabel="Effacer définitivement" danger busy={erase.isPending} onConfirm={() => erase.mutate()} onClose={onClose}>
      <p><Nom p={p} /></p>
      <p>Le nom, la fonction et les coordonnées professionnelles de ce contact seront supprimés dans tous les projets ; ses participations en cours prennent fin. La trace de sa participation reste, sans donnée personnelle. Cette action est irréversible.</p>
      {error && <p className="h7-error" role="alert">{error}</p>}
    </ConfirmDialog>
  );
}
