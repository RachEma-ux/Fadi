/**
 * Page « Extensions » de la barre latérale (maquettes validées le 25 novembre 2026) : ce que le compte a installé et
 * ce que la plateforme propose encore. Les données viennent de `GET /sandbox/preferences` (choix du compte et catalogue
 * réglé par la plateforme) ; installer ou désinstaller réécrit le seul champ `extensions` des préférences, les autres
 * sont renvoyés tels que lus. Les règles sont celles du paquet du Sandbox (`choixEffectif`).
 */
import {
  EXTENSIONS_SANDBOX, basculerExtension, choixEffectif, contenuExtension, extensionProposee, lireCatalogue, lireFichesPaquetsCompte, lirePreferencesSandbox, nomFichierPaquet,
  type EtatExtension, type EtatPaquet, type ExtensionSandbox, type FicheCatalogue, type FichePaquetCompte, type OriginePaquet, type PreferencesSandbox, type TexteBilingue,
} from "@parcours/sandbox-planche-model";
import { reporterExtensionDansCopie } from "../modules/sandbox/preferences/usePreferencesSandbox";
import { apiRequest } from "./api";

export interface EtatExtensionsCompte {
  readonly preferences: PreferencesSandbox;
  readonly catalogue: readonly FicheCatalogue[];
}

const lire = (corps: unknown): EtatExtensionsCompte => {
  const c = (corps ?? {}) as Record<string, unknown>;
  return {
    preferences: lirePreferencesSandbox({ profil: c["profil"], barrePersonnelle: c["barrePersonnelle"], favoris: c["favoris"], regroupements: c["regroupements"], extensions: c["extensions"] }),
    catalogue: lireCatalogue(c["catalogue"]),
  };
};

export const addonsApi = {
  lire: async (): Promise<EtatExtensionsCompte> => lire(await apiRequest<unknown>("/sandbox/preferences")),
  /** Installe (`true`) ou désinstalle (`false`) une extension pour le compte ; renvoie l'état relu du serveur. */
  basculer: async (etat: EtatExtensionsCompte, id: string, installee: boolean): Promise<EtatExtensionsCompte> => {
    const p = etat.preferences;
    const corps = { profil: p.profil, barrePersonnelle: p.barrePersonnelle, favoris: p.favoris, regroupements: p.regroupements, extensions: basculerExtension(p.extensions, id, installee) };
    const reponse = await apiRequest<unknown>("/sandbox/preferences", { method: "PUT", body: JSON.stringify(corps) });
    // La Planche garde sa propre copie des préférences : le geste y est reporté, sinon une copie en attente l'annulerait.
    const compte = (reponse as { compte?: unknown } | null)?.compte;
    if (typeof compte === "string") reporterExtensionDansCopie(compte, id, installee);
    return lire(reponse);
  },
};

export interface ExtensionListee {
  readonly extension: ExtensionSandbox;
  readonly fiche: FicheCatalogue;
  readonly contenu: ReturnType<typeof contenuExtension>;
}

/**
 * Répartition des extensions pour un compte : « installées » = actives pour lui (son choix, sinon le réglage d'origine
 * de la plateforme) ; « disponibles » = proposées par la plateforme et pas installées. Une extension retirée par la
 * plateforme n'apparaît dans aucune des deux listes. Ordre : celui de la liste livrée.
 */
export function repartirExtensions(etat: EtatExtensionsCompte): { readonly installees: readonly ExtensionListee[]; readonly disponibles: readonly ExtensionListee[] } {
  const effectif = choixEffectif(etat.preferences.extensions, etat.catalogue);
  const installees: ExtensionListee[] = [];
  const disponibles: ExtensionListee[] = [];
  for (const extension of EXTENSIONS_SANDBOX) {
    const fiche = etat.catalogue.find((f) => f.id === extension.id);
    if (!fiche || !extensionProposee(fiche)) continue;
    (effectif[extension.id] ? installees : disponibles).push({ extension, fiche, contenu: contenuExtension(extension) });
  }
  return { installees, disponibles };
}

// ————————————————————————————————————————————————————————————— Extensions ajoutées à la plateforme

const CHEMIN_PAQUETS_COMPTE = "/sandbox/preferences/extensions";

/** Extensions ajoutées par l'administrateur, telles que le compte les voit (fiches sans code). */
export const paquetsCompteApi = {
  lire: async (): Promise<readonly FichePaquetCompte[]> => lireFichesPaquetsCompte((await apiRequest<{ paquets?: unknown }>(`${CHEMIN_PAQUETS_COMPTE}/catalogue`))?.paquets),
  basculer: async (id: string, installee: boolean): Promise<readonly FichePaquetCompte[]> =>
    lireFichesPaquetsCompte((await apiRequest<{ paquets?: unknown }>(`${CHEMIN_PAQUETS_COMPTE}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ installee }) }))?.paquets),
};

/** Extension fournie par Fadi, vue de l'administration (`GET /admin/addons`). */
export interface AddonAdmin {
  readonly id: string;
  readonly version: string;
  readonly etat: EtatExtension;
  readonly activeParDefaut: boolean;
}
/** Extension ajoutée, vue de l'administration (`GET /admin/addons/paquets`). */
export interface PaquetAdmin {
  readonly id: string;
  readonly nom: TexteBilingue;
  readonly description: TexteBilingue;
  readonly version: string;
  readonly auteur: string;
  readonly protocole: string;
  readonly permissions: readonly string[];
  readonly commandes: number;
  readonly outils: number;
  readonly panneaux: number;
  readonly servie: boolean;
  readonly importedAt: string;
  readonly etat: EtatPaquet;
  readonly activeParDefaut: boolean;
  readonly origine: OriginePaquet;
}
/** Fiche rendue par un essai d'import : rien n'est écrit. */
export interface EssaiImport {
  readonly id: string;
  readonly version: string;
  readonly protocole: string;
  readonly remplace: boolean;
}
export interface ReglageAjout {
  readonly etat: EtatPaquet;
  readonly origine: OriginePaquet;
  /** Absent : le serveur garde le réglage en place (remplacement). */
  readonly installee?: boolean;
}

const requeteAjout = (r: ReglageAjout): string => `etat=${r.etat}&origine=${r.origine}${r.installee === undefined ? "" : `&installee=${r.installee ? "oui" : "non"}`}`;

/** Administration des extensions : routes réservées à l'administrateur de la plateforme (404 sinon). */
export const adminAddonsApi = {
  lire: async (): Promise<{ readonly addons: readonly AddonAdmin[]; readonly paquets: readonly PaquetAdmin[] }> => {
    const [a, p] = await Promise.all([apiRequest<{ addons: AddonAdmin[] }>("/admin/addons"), apiRequest<{ paquets: PaquetAdmin[] }>("/admin/addons/paquets")]);
    return { addons: a.addons, paquets: p.paquets };
  },
  regler: (id: string, reglage: { etat?: EtatExtension; activeParDefaut?: boolean }) => apiRequest<unknown>(`/admin/addons/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(reglage) }),
  reglerPaquet: (id: string, reglage: { etat?: EtatPaquet; activeParDefaut?: boolean }) => apiRequest<unknown>(`/admin/addons/paquets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(reglage) }),
  /** Le paquet entier (fiche, code, pages) : pour l'éditeur et l'export. */
  paquet: async (id: string): Promise<unknown> => (await apiRequest<{ paquet: unknown }>(`/admin/addons/paquets/${encodeURIComponent(id)}`)).paquet,
  /** Juge un paquet sans rien installer. */
  essayer: async (paquet: unknown): Promise<EssaiImport> => (await apiRequest<{ paquet: EssaiImport }>("/admin/addons/paquets?essai=1", { method: "POST", body: JSON.stringify(paquet) })).paquet,
  installer: (paquet: unknown, reglage: ReglageAjout) => apiRequest<unknown>(`/admin/addons/paquets?${requeteAjout(reglage)}`, { method: "POST", body: JSON.stringify(paquet) }),
  retirer: (id: string) => apiRequest<unknown>(`/admin/addons/paquets/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

/** Motif et détail d'un paquet refusé par le serveur, ou `null` si l'erreur est d'une autre nature. */
export function refusPaquet(err: unknown): { readonly motif: string; readonly detail: string } | null {
  const corps = (err as { body?: unknown } | null)?.body as { error?: unknown; motif?: unknown; detail?: unknown } | null | undefined;
  return corps && corps.error === "invalid_package" && typeof corps.motif === "string" ? { motif: corps.motif, detail: typeof corps.detail === "string" ? corps.detail : "" } : null;
}

/** Donne au navigateur un fichier `.fadi-addon.json` à enregistrer. */
export function telechargerPaquet(paquet: unknown, id: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(paquet, null, 2)], { type: "application/json" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichierPaquet(id);
  lien.click();
  URL.revokeObjectURL(url);
}
