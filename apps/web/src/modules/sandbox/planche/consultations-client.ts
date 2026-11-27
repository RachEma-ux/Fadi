/**
 * Client des liens de consultation de la Planche (cas 4 du catalogue, étape 7d : D11-F18-018). Seul appelant de
 * `/sandbox/consultations` (liens du compte : créer, lister, révoquer) et de `/consultation/api` (lecture publique d'une
 * copie figée, sans compte). Le dessin d'origine n'est jamais modifié par un lien.
 */
import type { Modele } from "@parcours/sandbox-planche-model";

export const ADRESSE_CONSULTATIONS = "/sandbox/consultations";
export const ADRESSE_CONSULTATION_PUBLIQUE = "/consultation/api";

export interface LienConsultation {
  readonly jeton: string;
  readonly nom: string;
  readonly creeLe: string;
  readonly echeance: string | null;
  readonly mesure: boolean;
  readonly revoqueLe: string | null;
}

export interface ConsultationPublique {
  readonly nom: string;
  readonly creeLe: string;
  readonly mesure: boolean;
  readonly modele: unknown;
}

/** Erreur d'appel : code du serveur (`invalid_input`, `indisponible`…) ou `http_<statut>`, `reseau`. */
export class ErreurConsultation extends Error {
  constructor(readonly code: string, readonly statut: number) {
    super(code);
  }
}

async function appeler<T>(adresse: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(adresse, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new ErreurConsultation("reseau", 0);
  }
  const corps: unknown = await r.json().catch(() => null);
  if (!r.ok) throw new ErreurConsultation(corps && typeof corps === "object" && "error" in corps ? String((corps as { error: unknown }).error) : `http_${r.status}`, r.status);
  return corps as T;
}

export const listerLiens = async (): Promise<readonly LienConsultation[]> => (await appeler<{ liens: LienConsultation[] }>(ADRESSE_CONSULTATIONS)).liens;

export const creerLien = async (d: { nom: string; modele: Modele; echeance: string | null; mesure: boolean }): Promise<LienConsultation> =>
  (await appeler<{ lien: LienConsultation }>(ADRESSE_CONSULTATIONS, { method: "POST", body: JSON.stringify(d) })).lien;

export const revoquerLien = async (jeton: string): Promise<LienConsultation> =>
  (await appeler<{ lien: LienConsultation }>(`${ADRESSE_CONSULTATIONS}/${encodeURIComponent(jeton)}/revoquer`, { method: "POST", body: "{}" })).lien;

export const lireConsultation = (jeton: string): Promise<ConsultationPublique> => appeler<ConsultationPublique>(`${ADRESSE_CONSULTATION_PUBLIQUE}/${encodeURIComponent(jeton)}`);

/** Adresse publique du lien (page de l'application, servie sans compte). */
export const adresseLien = (jeton: string, origine: string): string => `${origine}/consultation/${jeton}`;

/** Un lien est actif s'il n'est ni révoqué ni échu (échéance passée, jour de l'appareil). */
export const lienActif = (l: LienConsultation, aujourdhui: string): boolean => l.revoqueLe === null && (l.echeance === null || l.echeance >= aujourdhui);
