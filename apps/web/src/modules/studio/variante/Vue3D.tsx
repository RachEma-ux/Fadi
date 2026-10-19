/**
 * Vue 3D (three.js) chargée à la demande : le code 3D n'alourdit pas l'éditeur 2D. Le chargement passe par le
 * gestionnaire des ressources (moteur `rendu-3d`, B.3-04) : un seul chargement pour la session, partagé par tous les
 * outils 3D ; la vue montée garde le moteur actif, sa fermeture le rend inactif (sans le réinitialiser ensuite).
 */
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import type { Vue3DStudioProps } from "../vue3d/Vue3DStudio";
import { ressourcesStudio } from "../chargement/ressources-studio";
import { useUsageMoteur } from "../chargement/useRessources";

const chargerVue3D = () => ressourcesStudio.charger("rendu-3d").then((m) => ({ default: (m as { Vue3DStudio: ComponentType<Vue3DStudioProps> }).Vue3DStudio }));
let Vue3DStudio = lazy(chargerVue3D);

/** Un échec de la vue 3D (chargement, rendu) reste local : le brouillon 2D non enregistré est conservé. */
class LimiteVue3D extends Component<{ children: ReactNode }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() { return { erreur: true }; }
  // Refermer puis rouvrir la vue 3D relance un chargement neuf (React.lazy garderait l’échec).
  componentDidCatch() { Vue3DStudio = lazy(chargerVue3D); }
  render() { return this.state.erreur ? <p role="alert">Vue 3D indisponible. Le dessin et ses modifications non enregistrées sont conservés ; refermez puis rouvrez la vue 3D pour réessayer.</p> : this.props.children; }
}

/**
 * Vue 3D du brouillon : navigation orbite ou plan, volume libre (outils `studio.solide.*`, commandes passées à
 * `surCommandes`) et coupe horizontale dérivée. Sans `surCommandes`, la vue reste une lecture.
 */
export function Vue3D(props: Vue3DStudioProps) {
  useUsageMoteur("rendu-3d", "vue-3d");
  return <LimiteVue3D><Suspense fallback={<p role="status">Chargement de la vue 3D…</p>}><Vue3DStudio {...props} /></Suspense></LimiteVue3D>;
}
