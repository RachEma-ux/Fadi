/**
 * Démarrage léger de Studio (B.3-02, EX-038) et planche différée (B.3-03, EX-039).
 *
 * - `DemarrageStudio` (coquille, rien d'affiché) : début de PERF-01, lecture du profil d'outils du compte dès
 *   l'ouverture d'un projet (catalogue léger : le registre textuel est déjà dans la coquille), écoute des mises à jour
 *   du service worker, vérification du cache hors connexion et protection de la file locale (B.3-09, B.3-10).
 *   Aucun moteur lourd n'est chargé ici.
 * - `PlancheDifferee` : l'éditeur de variante (moteur `planche-2d`) est chargé à l'ouverture d'une planche par le
 *   gestionnaire des ressources ; un échec reste local et se réessaie (rien n'est modifié).
 */
import { Component, lazy, Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import { useAuth } from "../../../lib/auth-context";
import { useProfilOutils } from "../planche2d/CatalogueOutils";
import type { VariantWorkspaceProps } from "../VariantWorkspace";
import { ecouterMisesAJour, protegerFileLocale, verifier } from "./hors-connexion-studio";
import { ressourcesStudio } from "./ressources-studio";
import { TEXTES_RESSOURCES } from "./textes";
import { useOuvertureStudio } from "./useRessources";

function useCompte(): string | null {
  try {
    return useAuth().user?.id ?? null;
  } catch {
    return null;
  }
}

export function DemarrageStudio({ projectId }: { projectId: string | null }) {
  useOuvertureStudio();
  // Profil d'outils du compte lu dès l'ouverture du projet (les barres le trouvent prêt).
  useProfilOutils(projectId);
  const compte = useCompte();
  useEffect(() => { ecouterMisesAJour(); void verifier(); }, []);
  useEffect(() => { void protegerFileLocale(compte); }, [compte]);
  return null;
}

const charger = () => ressourcesStudio.charger("planche-2d").then((m) => ({ default: (m as { VariantWorkspace: ComponentType<VariantWorkspaceProps> }).VariantWorkspace }));
let Planche = lazy(charger);

class LimitePlanche extends Component<{ children: ReactNode }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() { return { erreur: true }; }
  componentDidCatch() { Planche = lazy(charger); }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div className="studio-alert" role="alert" data-studio-planche-indisponible>
        {TEXTES_RESSOURCES.plancheIndisponible}
        <button type="button" onClick={() => this.setState({ erreur: false })}>{TEXTES_RESSOURCES.reessayer}</button>
      </div>
    );
  }
}

export function PlancheDifferee(props: VariantWorkspaceProps) {
  return <LimitePlanche><Suspense fallback={<p role="status">{TEXTES_RESSOURCES.chargementPlanche}</p>}><Planche {...props} /></Suspense></LimitePlanche>;
}
