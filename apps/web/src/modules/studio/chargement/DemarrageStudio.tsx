/**
 * Démarrage léger de Studio (B.3-02, EX-038) et planche différée (B.3-03, EX-039).
 *
 * - `DemarrageStudio` (coquille, rien d'affiché) : lecture du profil d'outils du compte dès l'ouverture d'un projet
 *   (catalogue léger : le registre textuel est déjà dans la coquille), écoute des mises à jour du service worker,
 *   vérification du cache hors connexion et protection de la file locale (B.3-09, B.3-10). Aucun moteur lourd n'est
 *   chargé ici.
 * - `PlancheDifferee` : l'éditeur de variante (moteur `planche-2d`) est chargé à l'ouverture d'une planche par le
 *   gestionnaire des ressources ; PERF-01 part de l'entrée sur la route de la variante. Un échec de chargement du
 *   moteur reste local et se réessaie réellement (nouveau composant différé) ; toute autre erreur remonte à la limite
 *   de Studio (rien n'est modifié).
 */
import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { useAuth } from "../../../lib/auth-context";
import { useProfilOutils } from "../planche2d/CatalogueOutils";
import type { VariantWorkspaceProps } from "../VariantWorkspace";
import { ErreurMoteur } from "./gestionnaire-ressources";
import { ecouterMisesAJour, protegerFileLocale, verifier } from "./hors-connexion-studio";
import { ressourcesStudio } from "./ressources-studio";
import { TEXTES_RESSOURCES } from "./textes";
import { useOuvertureVariante } from "./useRessources";

function useCompte(): string | null {
  try {
    return useAuth().user?.id ?? null;
  } catch {
    return null;
  }
}

export function DemarrageStudio({ projectId }: { projectId: string | null }) {
  // Profil d'outils du compte lu dès l'ouverture du projet (les barres le trouvent prêt).
  useProfilOutils(projectId);
  const compte = useCompte();
  useEffect(() => { ecouterMisesAJour(); void verifier(); }, []);
  useEffect(() => { void protegerFileLocale(compte); }, [compte]);
  return null;
}

const charger = () => ressourcesStudio.charger("planche-2d").then((m) => ({ default: (m as { VariantWorkspace: ComponentType<VariantWorkspaceProps> }).VariantWorkspace }));
type PlancheLazy = LazyExoticComponent<ComponentType<VariantWorkspaceProps>>;
/** Composant différé partagé par les ouvertures de planche (une fois chargé, il ne se recharge plus). */
let plancheCourante: PlancheLazy = lazy(charger);
/**
 * « Réessayer » : un nouveau composant différé (React garde le rejet d'un `lazy` pour toujours) ; le gestionnaire des
 * ressources relance alors réellement le chargement du moteur (sa promesse en échec est oubliée).
 */
export function nouvellePlanche(): PlancheLazy {
  plancheCourante = lazy(charger);
  return plancheCourante;
}
export const plancheActuelle = (): PlancheLazy => plancheCourante;

interface PropsLimite { readonly children: ReactNode; readonly onReessayer: () => void }

/**
 * Limite locale de la planche : elle ne capture que l'échec de chargement du moteur (`ErreurMoteur`). Toute autre
 * erreur est relancée au rendu vers la limite de Studio (`StudioErrorBoundary`), qui l'affiche comme les autres écrans.
 */
export class LimitePlanche extends Component<PropsLimite, { erreur: unknown }> {
  state: { erreur: unknown } = { erreur: null };
  static getDerivedStateFromError(erreur: unknown) { return { erreur }; }
  reessayer = () => {
    this.props.onReessayer();
    this.setState({ erreur: null });
  };
  render() {
    const { erreur } = this.state;
    if (erreur === null) return this.props.children;
    if (!(erreur instanceof ErreurMoteur)) throw erreur;
    return (
      <div className="studio-alert" role="alert" data-studio-planche-indisponible={erreur.code}>
        {TEXTES_RESSOURCES.plancheIndisponible}
        <button type="button" onClick={this.reessayer} data-studio-reessayer-planche>{TEXTES_RESSOURCES.reessayer}</button>
      </div>
    );
  }
}

export function PlancheDifferee(props: VariantWorkspaceProps) {
  useOuvertureVariante();
  const [Planche, setPlanche] = useState<PlancheLazy>(plancheActuelle);
  return (
    <LimitePlanche onReessayer={() => setPlanche(() => nouvellePlanche())}>
      <Suspense fallback={<p role="status">{TEXTES_RESSOURCES.chargementPlanche}</p>}><Planche {...props} /></Suspense>
    </LimitePlanche>
  );
}
