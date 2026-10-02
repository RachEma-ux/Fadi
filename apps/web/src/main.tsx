import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./lib/auth-context";
import { persistOptions } from "./lib/query-persister";
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

// Enveloppe hors-ligne (production) : l'application, le moteur de l'Atelier et l'outil Parcelle sont servis
// depuis le cache du navigateur quand le réseau manque ; les appels à l'API, jamais.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("Application root missing");

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
