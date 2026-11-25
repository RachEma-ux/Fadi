/**
 * Page « Extensions » de la barre latérale (maquettes validées le 25 novembre 2026) : ce que le compte a installé et
 * ce que la plateforme propose encore. Les données viennent de `GET /sandbox/preferences` (choix du compte et catalogue
 * réglé par la plateforme) ; installer ou désinstaller réécrit le seul champ `extensions` des préférences, les autres
 * sont renvoyés tels que lus. Les règles sont celles du paquet du Sandbox (`choixEffectif`).
 */
import {
  EXTENSIONS_SANDBOX, basculerExtension, choixEffectif, contenuExtension, extensionProposee, lireCatalogue, lirePreferencesSandbox,
  type ExtensionSandbox, type FicheCatalogue, type PreferencesSandbox,
} from "@parcours/sandbox-planche-model";
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
    return lire(await apiRequest<unknown>("/sandbox/preferences", { method: "PUT", body: JSON.stringify(corps) }));
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
