/**
 * Import d'un exemple (P.118…) : copie des 21 étapes, du modèle de
 * l'Atelier, de la parcelle et des documents de base dans une copie propre au
 * compte — plusieurs secondes. Le même état sert à la carte de « Mes projets »
 * et au bouton de l'accueil : en cours (identifiant), erreur dite et
 * retentable, puis ouverture du projet avec un message.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "./api";

export const COMPLETE_EXAMPLE_ID = "p118-exemple-complet";

export const IMPORT_PROGRESS_TEXT = "Copie des 21 étapes, du modèle de l’Atelier, de la parcelle et des documents de base — quelques secondes, puis le projet s’ouvre.";

export function useImportExample() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (exampleId: string) => api.importExample(exampleId),
    onMutate: (exampleId) => {
      setImportingId(exampleId);
      setError(null);
    },
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projets/${project.id}?module=parcours`, { state: { notice: `Exemple importé : votre copie « ${project.code} — ${project.name} » est prête. Ouvrez une étape.` } });
    },
    onError: (err, exampleId) =>
      setError({ id: exampleId, message: err instanceof ApiError ? (err.serverMessage ?? `Import refusé (${err.status}).`) : "Import interrompu : réseau indisponible ou serveur injoignable." }),
    onSettled: () => setImportingId(null),
  });
  return {
    importingId,
    error,
    /** Lance l'import si aucun n'est en cours. */
    start(exampleId: string) {
      if (importingId === null) mutation.mutate(exampleId);
    },
  };
}
