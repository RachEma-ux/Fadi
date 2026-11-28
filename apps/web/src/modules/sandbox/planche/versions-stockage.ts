/**
 * Cas 2 du catalogue, lot 7 : registre des versions d'une Planche (jalons, émissions et partages) et contenus figés des
 * jalons, rangés dans ce navigateur comme les Planches elles-mêmes (`localStore`, clés propres à Sandbox). Un contenu
 * de jalon est relu contre son empreinte : modifié, il est refusé (`lireContenuJalon`).
 */
import { lireContenuJalon, lireRegistreVersions, registreVide, serialiserRegistreVersions, type Jalon, type Modele, type RegistreVersions } from "@parcours/sandbox-planche-model";
import { localStore } from "../../../lib/local-store";

export const CLE_VERSIONS = "sandbox-planche-versions";
export const CLE_JALON = "sandbox-planche-jalon";

const cleRegistre = (planche: string) => `${CLE_VERSIONS}/${planche}`;
const cleJalon = (planche: string, jalon: string) => `${CLE_JALON}/${planche}/${jalon}`;

export async function chargerRegistre(planche: string): Promise<RegistreVersions> {
  return lireRegistreVersions(await localStore.getValueChecked(cleRegistre(planche))) ?? registreVide();
}

export async function enregistrerRegistre(planche: string, r: RegistreVersions): Promise<void> {
  await localStore.setValueChecked(cleRegistre(planche), serialiserRegistreVersions(r));
}

export async function enregistrerContenuJalon(planche: string, jalon: string, contenu: string): Promise<void> {
  await localStore.setValueChecked(cleJalon(planche, jalon), contenu);
}

/** Modèle figé d'un jalon, ou `null` s'il manque ou si son contenu ne correspond plus à l'empreinte. */
export async function chargerJalon(planche: string, j: Jalon): Promise<Modele | null> {
  return lireContenuJalon(j, await localStore.getValueChecked(cleJalon(planche, j.id)));
}

/** Retire le registre et les jalons d'une Planche supprimée. */
export async function supprimerVersions(planche: string): Promise<void> {
  const r = await chargerRegistre(planche).catch(() => registreVide());
  for (const j of r.jalons) await localStore.removeValue(cleJalon(planche, j.id)).catch(() => undefined);
  await localStore.removeValue(cleRegistre(planche)).catch(() => undefined);
}
