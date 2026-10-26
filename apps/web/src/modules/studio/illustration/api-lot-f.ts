/**
 * Client des routes du lot F (décision P-12) : illustrations d'une variante, agents (jetons, propositions, journal) et
 * extensions. Même origine, cookie de session ; une réponse refusée lève `ErreurLotF` (statut, code, corps). Seuls les
 * gestes explicites de la personne appellent ces routes (ouverture d'une boîte, bouton) : aucun appel n'est lié au
 * mouvement du pointeur (F.3-03). Pur : ni React ni DOM.
 */
export class ErreurLotF extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly corps: Record<string, unknown>) { super(message); }
}
async function appel<T>(chemin: string, init?: RequestInit): Promise<T> {
  const res = await fetch(chemin, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const corps: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const c = (corps ?? {}) as Record<string, unknown>;
    throw new ErreurLotF(res.status, typeof c["error"] === "string" ? c["error"] : `http_${res.status}`, typeof c["message"] === "string" ? c["message"] : `Refus du serveur (${res.status}).`, c);
  }
  return corps as T;
}
const e = encodeURIComponent;
export const cheminIllustrations = (p: string, s: string, v: string) => `/projects/${e(p)}/studio/studies/${e(s)}/variants/${e(v)}/illustrations`;
const cheminAgents = (p: string) => `/projects/${e(p)}/studio/agents`;

export interface FournisseurIllustration {
  id: "local-derive" | "externe"; nom: string; nature: "local-deterministe" | "ia-externe"; version: string; reseau: boolean; disponible: boolean;
  manque: string[]; cout: { montant: number; devise: string | null } | null; styles: string[]; classificationsAdmises?: string[];
}
export interface IllustrationLue {
  id: string; revisionId: string; fournisseur: { id: string; nature: string }; parametres: Record<string, unknown>; provenance: Record<string, any>;
  largeur: number; hauteur: number; empreinteImage: string; creePar: string; creeParEmail: string | null; creeLe: string; image: string; replayed?: boolean;
}
export interface CorpsIllustration {
  requestId: string; fournisseur: "local-derive" | "externe"; image: string; parametres: { style: string; intensite: number };
  classification?: "publique" | "interne" | "confidentielle" | "inconnue";
  consentement?: { transfertExterne: boolean; coutAccepte: { montant: number; devise: string } | null };
}
export interface JetonLu { id: string; nom: string; creeLe: string; expireLe: string; revoqueLe: string | null }
export interface PropositionLue {
  id: string; studyId: string; variantId: string; requestId: string; baseRevisionId: string; statut: "en-attente" | "confirmee" | "refusee" | "expiree" | "echec";
  apercu: { commandes?: number; outils?: string[]; nombreElementsModifies?: number }; commandes: { toolId: string }[]; revisionId: string | null; echec: Record<string, unknown> | null;
  creeLe: string; expireLe: string; decideLe: string | null;
}
export interface EvenementAgent { id: string; acteur: "agent" | "humain"; action: string; jetonId: string | null; outil: string | null; propositionId: string | null; revisionId: string | null; le: string }

export const apiIllustrations = {
  fournisseurs: (p: string, s: string, v: string) => appel<{ fournisseurs: FournisseurIllustration[] }>(`${cheminIllustrations(p, s, v)}/fournisseurs`),
  lister: (p: string, s: string, v: string) => appel<{ illustrations: IllustrationLue[] }>(cheminIllustrations(p, s, v)),
  creer: (p: string, s: string, v: string, corps: CorpsIllustration) => appel<IllustrationLue>(cheminIllustrations(p, s, v), { method: "POST", body: JSON.stringify(corps) }),
};
export const apiAgents = {
  jetons: (p: string) => appel<{ jetons: JetonLu[] }>(`${cheminAgents(p)}/jetons`),
  creerJeton: (p: string, nom: string, joursValidite: number) => appel<{ id: string; nom: string; jeton: string; expireLe: string }>(`${cheminAgents(p)}/jetons`, { method: "POST", body: JSON.stringify({ nom, joursValidite }) }),
  revoquer: (p: string, id: string) => appel<{ id: string; revoque: boolean }>(`${cheminAgents(p)}/jetons/${e(id)}/revoquer`, { method: "POST", body: "{}" }),
  propositions: (p: string) => appel<{ propositions: PropositionLue[] }>(`${cheminAgents(p)}/propositions`),
  decider: (p: string, id: string, action: "confirmer" | "refuser") => appel<{ proposition: PropositionLue; revisionId?: string; replayed?: boolean }>(`${cheminAgents(p)}/propositions/${e(id)}/${action}`, { method: "POST", body: "{}" }),
  journal: (p: string) => appel<{ evenements: EvenementAgent[] }>(`${cheminAgents(p)}/journal`),
};
