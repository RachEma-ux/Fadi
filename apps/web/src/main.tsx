import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./lib/auth-context";
import { registerMutationDefaults } from "./lib/mutations";
import { persistOptions } from "./lib/query-persister";
import { demarrerLangue } from "./lib/i18n/demarrer";
import { reachability } from "./lib/reachability";
import "./style.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Les données du projet (révision, murs…) doivent refléter le serveur,
    // pas rester en cache indéfiniment pendant qu'un autre onglet modifie le
    // même projet — mieux vaut un aller-réseau de plus qu'une révision
    // obsolète silencieusement affichée. Le cache persistant (IndexedDB) ne
    // sert qu'à relire sans réseau ce qui a déjà été lu : il est réhydraté
    // périmé et relu dès que le serveur répond.
    queries: { staleTime: 0, retry: 1, gcTime: 1000 * 60 * 60 * 24 },
  },
});

// Saisies, arbitrages et commentaires rejouables : valeurs par défaut des mutations mises en pause hors-ligne et persistées.
registerMutationDefaults(queryClient);
// TanStack Query se croit en ligne au démarrage : après un rechargement hors-ligne, les mutations restaurées
// repartiraient aussitôt et échoueraient. L'état réel du navigateur fait foi — et le serveur doit répondre
// (`lib/reachability.ts`) : un serveur injoignable met les écritures en attente comme une coupure réseau.
onlineManager.setEventListener(() => {
  const handler = () => reachability.browserOnlineChanged();
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  return () => {
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
  };
});
reachability.browserOnlineChanged();

// Enveloppe hors-ligne (production) : l'application, le moteur de l'Atelier et l'outil Parcelle sont servis
// depuis le cache du navigateur quand le réseau manque ; les appels à l'API, jamais.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("Application root missing");

// Langue de l'interface (D-163) : le dictionnaire anglais est prêt avant le premier rendu.
void demarrerLangue()
  .catch(() => undefined)
  .then(() => createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // Cache relu : les mutations restées en pause (coupure, rechargement) repartent, puis tout est relu.
        void queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries());
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
));
