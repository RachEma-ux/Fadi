/**
 * Client des routes des modèles externes Studio (lot F3, TR-EX-066 :
 * `/projects/:p/studio/studies/:s/variants/:v/modeles-externes`). Même origine, cookie de session ; une réponse refusée
 * lève `ErreurModeleExterne` avec le message du serveur. Pur : ni React ni DOM.
 */
import type { StudioComparaisonModeleExterne, StudioIfcRapport, StudioStatutModeleExterne, StudioTransformationDeclaree, StudioUniteDeclaree } from "@parcours/atelier-model";

export interface EvenementModele { seq: number; action: "recevoir" | "comparer" | "accepter" | "refuser"; par: string; parEmail: string | null; revisionId: string | null; motif: string | null; le: string }
export interface ModeleExterneLu {
  id: string; studyId: string; variantId: string;
  reference: string; auteur: string; discipline: string; format: "ifc"; version: string; uniteDeclaree: StudioUniteDeclaree;
  transformation: StudioTransformationDeclaree | null; nomFichier: string; contentSha256: string;
  statut: StudioStatutModeleExterne; rapport: StudioIfcRapport; comparaison: StudioComparaisonModeleExterne; revisionComparee: string;
  decision: { par: string; parEmail: string | null; le: string | null; motif: string | null } | null;
  recuPar: string; recuParEmail: string | null; recuLe: string;
  journal?: EvenementModele[];
}
export interface ListeModeles { peutRecevoir: boolean; peutDecider: boolean; teteRevisionId: string; modeles: ModeleExterneLu[] }
export interface ReceptionModele {
  reference: string; auteur: string; discipline: string; format: "ifc"; version: string; uniteDeclaree: StudioUniteDeclaree;
  transformation: StudioTransformationDeclaree | null; nomFichier: string; contenu: string; requestId: string;
}

export class ErreurModeleExterne extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function appel<T>(chemin: string, init?: RequestInit): Promise<T> {
  const res = await fetch(chemin, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const corps: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const c = (corps ?? {}) as { error?: unknown; message?: unknown };
    throw new ErreurModeleExterne(res.status, typeof c.error === "string" ? c.error : `http_${res.status}`, typeof c.message === "string" ? c.message : `Refus du serveur (${res.status}).`);
  }
  return corps as T;
}
const e = encodeURIComponent;
export const cheminModeles = (p: string, s: string, v: string) => `/projects/${e(p)}/studio/studies/${e(s)}/variants/${e(v)}/modeles-externes`;

export const apiModelesExternes = {
  lister: (p: string, s: string, v: string) => appel<ListeModeles>(cheminModeles(p, s, v)),
  lire: (p: string, s: string, v: string, id: string) => appel<ModeleExterneLu>(`${cheminModeles(p, s, v)}/${e(id)}`),
  contenu: (p: string, s: string, v: string, id: string) => appel<{ contenu: string; transformation: StudioTransformationDeclaree | null; statut: StudioStatutModeleExterne }>(`${cheminModeles(p, s, v)}/${e(id)}/contenu`),
  recevoir: (p: string, s: string, v: string, corps: ReceptionModele) => appel<ModeleExterneLu & { replayed: boolean }>(cheminModeles(p, s, v), { method: "POST", body: JSON.stringify(corps) }),
  passer: (p: string, s: string, v: string, id: string, action: "comparer" | "accepter" | "refuser", motif?: string) =>
    appel<ModeleExterneLu>(`${cheminModeles(p, s, v)}/${e(id)}/${action}`, { method: "POST", body: JSON.stringify(motif ? { motif } : {}) }),
};
