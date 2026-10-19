/** Vue 3D (three.js) chargée à la demande : le code 3D n'alourdit pas l'éditeur 2D. */
import { Component, lazy, Suspense, type ReactNode } from "react";
import type { StudioDocument } from "@parcours/atelier-model";

const chargerVue3D = () => import("../vue3d/Vue3DStudio").then((m) => ({ default: m.Vue3DStudio }));
let Vue3DStudio = lazy(chargerVue3D);

/** Un échec de la vue 3D (chargement, rendu) reste local : le brouillon 2D non enregistré est conservé. */
class LimiteVue3D extends Component<{ children: ReactNode }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() { return { erreur: true }; }
  // Refermer puis rouvrir la vue 3D relance un chargement neuf (React.lazy garderait l’échec).
  componentDidCatch() { Vue3DStudio = lazy(chargerVue3D); }
  render() { return this.state.erreur ? <p role="alert">Vue 3D indisponible. Le dessin et ses modifications non enregistrées sont conservés ; refermez puis rouvrez la vue 3D pour réessayer.</p> : this.props.children; }
}

export function Vue3D({ doc }: { doc: StudioDocument }) {
  return <LimiteVue3D><Suspense fallback={<p role="status">Chargement de la vue 3D…</p>}><Vue3DStudio doc={doc} /></Suspense></LimiteVue3D>;
}
