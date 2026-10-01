import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./lib/auth-context";
import "./style.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Les données du projet (révision, murs…) doivent refléter le serveur,
    // pas rester en cache indéfiniment pendant qu'un autre onglet modifie le
    // même projet — mieux vaut un aller-réseau de plus qu'une révision
    // obsolète silencieusement affichée.
    queries: { staleTime: 0, retry: 1 },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Application root missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
