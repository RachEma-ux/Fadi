/**
 * Organisations côté projet — mise en forme pure (hors base, testée) de ce que lit `project-organizations.ts`.
 * Aucune décision d'accès ici : la vue dit explicitement que la partie propriétaire ne donne aucun droit (OP-D1 a).
 */
import type { OrganizationStatus, ParticipationStatus, TeamResponsibility } from "../db/schema.js";

export interface OrganizationIdentity { id: string; name: string; kind: string | null; status: OrganizationStatus }

export interface RepresentativeView {
  mandateId: string;
  /** Nom d'affichage seul (compte, sinon fiche) ; jamais d'adresse. */
  name: string | null;
  responsibilities: TeamResponsibility[];
  startsOn: string | null;
}

export interface OrganizationPartyView extends OrganizationIdentity {
  participationId: string;
  participationStatus: ParticipationStatus;
  businessRole: string | null;
  responsibilities: TeamResponsibility[];
  startsOn: string | null;
  /** Le lecteur est membre (adhésion non terminée) : l'interface renvoie vers l'espace d'organisation. */
  youAreMember: boolean;
  representatives: RepresentativeView[];
}

export interface ProjectOrganizationsView {
  /** Partie propriétaire déclarée (OP-D1 a) ; null sans déclaration. */
  owner: null | (OrganizationIdentity & { youAreMember: boolean; isParty: boolean });
  /** La personne propriétaire : le droit reste à son compte (OP-D1 a). */
  ownerPerson: { userId: string | null; name: string | null };
  /** Toujours `false` : déclarer une partie propriétaire ne change ni l'accès ni les rôles. */
  ownerGrantsAccess: false;
  parties: OrganizationPartyView[];
}

export interface ShapeInput {
  owner: OrganizationIdentity | null;
  ownerUserId: string | null;
  ownerPersonName: string | null;
  parties: { participationId: string; status: ParticipationStatus; businessRole: string | null; responsibilities: TeamResponsibility[]; startsOn: string | null; org: OrganizationIdentity }[];
  mandates: { id: string; organizationId: string; participationId: string; responsibilities: TeamResponsibility[]; startsOn: string | null; accountName: string | null; personName: string | null }[];
  memberOf: string[];
}

export function shapeProjectOrganizations(input: ShapeInput): ProjectOrganizationsView {
  const member = new Set(input.memberOf);
  const live = input.parties.filter((p) => p.status !== "terminee");
  return {
    owner: input.owner
      ? { id: input.owner.id, name: input.owner.name, kind: input.owner.kind, status: input.owner.status, youAreMember: member.has(input.owner.id), isParty: live.some((p) => p.org.id === input.owner!.id) }
      : null,
    ownerPerson: { userId: input.ownerUserId, name: input.ownerPersonName },
    ownerGrantsAccess: false,
    parties: live.map((p) => ({
      id: p.org.id, name: p.org.name, kind: p.org.kind, status: p.org.status,
      participationId: p.participationId, participationStatus: p.status, businessRole: p.businessRole,
      responsibilities: p.responsibilities, startsOn: p.startsOn, youAreMember: member.has(p.org.id),
      representatives: input.mandates
        .filter((m) => m.organizationId === p.org.id && m.participationId === p.participationId)
        .map((m) => ({ mandateId: m.id, name: m.accountName || m.personName || null, responsibilities: m.responsibilities, startsOn: m.startsOn })),
    })),
  };
}
