/**
 * Collaboration > Équipe et participants : organisations du projet (Issue #262, reliquat de la phase 5 ; OP-D1 a).
 *
 * Affiche la **partie propriétaire** déclarée depuis l'espace d'organisation, la **personne propriétaire** (le droit
 * reste à son compte : l'affichage le dit) et les **organisations parties** avec leurs représentants mandatés en cours.
 * Lecture seule pour tout lecteur du projet : aucune commande ici (la déclaration se fait dans l'espace d'organisation),
 * donc rien de soumis à la règle d'or des commandes. Renvoi vers l'espace d'organisation pour ses seuls membres ; sinon
 * nom seul. Une organisation suspendue ou close est montrée avec son statut, jamais masquée. Aucune coordonnée.
 */
import { Link } from "react-router-dom";
import type { OrganizationIdentity, OrganizationStatus, ProjectOrganizations, Responsibility } from "./participants-api";

const ORG_STATUS_LABEL: Record<OrganizationStatus, string> = { active: "Active", suspendue: "Suspendue", close: "Close" };
const RESP_LABEL: Record<Responsibility, string> = { diriger: "Diriger", produire: "Produire", coordonner: "Coordonner", verifier: "Vérifier", approuver: "Approuver", diffuser: "Diffuser" };

/** Nom de l'organisation : lien vers son espace si le lecteur en est membre, sinon nom seul. */
export function NomOrganisation({ org, member }: { org: Pick<OrganizationIdentity, "id" | "name">; member: boolean }) {
  return member
    ? <Link to={`/organisations/${encodeURIComponent(org.id)}`} translate="no" data-lien-organisation={org.id}>{org.name}</Link>
    : <b translate="no">{org.name}</b>;
}

function Statut({ status }: { status: OrganizationStatus }) {
  return <span className="h7-chip" data-statut-organisation={status}>{ORG_STATUS_LABEL[status]}</span>;
}

export function OrganisationsProjet({ v, ownerFallback }: { v: ProjectOrganizations; ownerFallback: string | null }) {
  const ownerName = v.ownerPerson.name || ownerFallback;
  return (
    <div className="projet-organisations" data-organisations-projet>
      <h3 id="collab-organisations">Organisations du projet</h3>
      <dl className="projet-organisations-tete">
        <div data-partie-proprietaire={v.owner?.id ?? "aucune"}>
          <dt>Partie propriétaire</dt>
          <dd>
            {v.owner ? (
              <>
                <NomOrganisation org={v.owner} member={v.owner.youAreMember} />
                {v.owner.kind ? <small translate="no">{v.owner.kind}</small> : null}
                <Statut status={v.owner.status} />
              </>
            ) : <span className="h7-muted">Aucune organisation déclarée</span>}
          </dd>
        </div>
        <div data-personne-proprietaire>
          <dt>Personne propriétaire</dt>
          <dd>
            {ownerName ? <b translate="no">{ownerName}</b> : <span className="h7-muted">Nom non renseigné</span>}
          </dd>
        </div>
      </dl>
      <p className="h7-muted projet-organisations-note">
        Les droits du projet restent au compte de la personne propriétaire : déclarer une partie propriétaire ne donne ni accès ni rôle. La déclaration se fait depuis l’espace de l’organisation.
      </p>
      <h4>Organisations parties</h4>
      {v.parties.length === 0 ? (
        <p className="h7-muted" data-parties="0">Aucune organisation n’est enregistrée comme partie au projet.</p>
      ) : (
        <ul className="projet-organisations-parties" data-parties={v.parties.length}>
          {v.parties.map((p) => (
            <li key={p.participationId} data-partie={p.id} data-statut={p.status}>
              <div className="projet-organisations-ligne">
                <NomOrganisation org={p} member={p.youAreMember} />
                <Statut status={p.status} />
                {v.owner?.id === p.id ? <span className="h7-chip">partie propriétaire</span> : null}
              </div>
              {p.businessRole ? <small translate="no">{p.businessRole}</small> : null}
              {p.responsibilities.length ? <small>{p.responsibilities.map((r) => RESP_LABEL[r]).join(" · ")}</small> : null}
              <div className="projet-organisations-representants">
                <small>Représentants mandatés :</small>
                {p.representatives.length ? (
                  <ul>
                    {p.representatives.map((r) => (
                      <li key={r.mandateId} data-representant={r.mandateId}>
                        {r.name ? <span translate="no">{r.name}</span> : <span className="h7-muted">Nom non renseigné</span>}
                        {r.responsibilities.length ? <small className="h7-muted">{r.responsibilities.map((x) => RESP_LABEL[x]).join(" · ")}</small> : null}
                      </li>
                    ))}
                  </ul>
                ) : <small className="h7-muted">aucun mandat en cours</small>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <small className="h7-muted">Un mandat identifie le représentant d’une organisation ; il n’ouvre aucun accès : celui-ci reste accordé par le projet.</small>
    </div>
  );
}
