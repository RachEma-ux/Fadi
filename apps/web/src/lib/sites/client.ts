/**
 * Client des sites de projet (27 novembre 2026) : seul appelant de `/sites/api`, partagé par la Planche du Sandbox et par
 * GeoData — qui n'appellent pas d'autre serveur pour les sites. Session du compte (cookie), JSON, aucune adresse externe.
 * Chaque réponse est relue par les contrôles du modèle pur ; une erreur garde son statut HTTP et le champ fautif.
 */
import type { ContenuSite, FicheSite, GenreLien, LienSite, PositionSite } from "@parcours/domain-model";

export const RACINE_SITES = "/sites/api";

export interface ResumeSite {
  readonly id: string;
  readonly nom: string;
  readonly nature: string | null;
  readonly lieu: string;
  readonly revision: number;
  readonly modifieLe: string;
}

export interface SiteOuvert extends ContenuSite {
  readonly id: string;
  readonly revision: number;
  readonly liens: readonly LienSite[];
  readonly position: PositionSite | null;
}

/** Erreur d'un appel : statut HTTP (0 = réseau indisponible), message du serveur, champs fautifs. */
export class ErreurSites extends Error {
  constructor(readonly statut: number, message: string, readonly champs: readonly string[] = []) {
    super(message);
  }
}

async function appeler<T>(chemin: string, init: { method?: string; corps?: unknown } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${RACINE_SITES}${chemin}`, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: { Accept: "application/json", ...(init.corps !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(init.corps !== undefined ? { body: JSON.stringify(init.corps) } : {}),
    });
  } catch {
    throw new ErreurSites(0, "Serveur injoignable : vérifiez la connexion.");
  }
  const texte = await r.text();
  const corps = texte ? (JSON.parse(texte) as Record<string, unknown>) : {};
  if (!r.ok) throw new ErreurSites(r.status, typeof corps["message"] === "string" ? corps["message"] : `Réponse ${r.status}`, Array.isArray(corps["champs"]) ? (corps["champs"] as string[]) : []);
  return corps as T;
}

export const listerSites = async (filtre?: { genre: GenreLien; cible: string }): Promise<readonly ResumeSite[]> =>
  (await appeler<{ sites: ResumeSite[] }>(`/sites${filtre ? `?genre=${encodeURIComponent(filtre.genre)}&cible=${encodeURIComponent(filtre.cible)}` : ""}`)).sites;

export const lireSite = (id: string) => appeler<SiteOuvert>(`/sites/${encodeURIComponent(id)}`);

export const creerSite = (contenu: Partial<ContenuSite> & { fiche: FicheSite }, lien?: LienSite) => appeler<SiteOuvert>("/sites", { method: "POST", corps: { ...contenu, ...(lien ? { lien } : {}) } });

export const sauvegarderSite = (s: SiteOuvert, contenu: ContenuSite, lien?: LienSite) =>
  appeler<SiteOuvert>(`/sites/${encodeURIComponent(s.id)}`, { method: "PUT", corps: { revisionAttendue: s.revision, ...contenu, ...(lien ? { lien } : {}) } });

export const sauvegarderSiteSous = (s: SiteOuvert, contenu: ContenuSite, lien?: LienSite) =>
  appeler<SiteOuvert>(`/sites/${encodeURIComponent(s.id)}/copie`, { method: "POST", corps: { ...contenu, ...(lien ? { lien } : {}) } });

/** Rattache un site existant au module (la Planche ouverte suit ce site). */
export const lierSite = (id: string, lien: LienSite) => appeler<SiteOuvert>(`/sites/${encodeURIComponent(id)}/lien`, { method: "POST", corps: { lien } });

export const importerSite = (nom: string, contenu: string, lien?: LienSite) => appeler<SiteOuvert>("/import", { method: "POST", corps: { nom, contenu, ...(lien ? { lien } : {}) } });

/** Adresse du fichier d'échange (téléchargé par le navigateur, session comprise). */
export const adresseExport = (id: string) => `${RACINE_SITES}/sites/${encodeURIComponent(id)}/export`;

/** Contenu d'un site ouvert, prêt à être sauvegardé (sans identifiant, révision ni position calculée). */
export const contenuDe = (s: SiteOuvert): ContenuSite => ({ fiche: s.fiche, parcelle: s.parcelle, observations: s.observations, altimetrie: s.altimetrie, zone: s.zone });
