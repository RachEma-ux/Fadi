/**
 * « Écarts entre import et textes conservés » (`currentProgramme()`) et
 * « Textes manuels préservés » du bilan (flow-v62 `conflictsHTML`) : les
 * champs déjà saisis que l'application d'un programme n'a pas écrasés, face
 * au texte proposé ; « Adopter cette proposition » remplace uniquement le
 * champ choisi, l'ancien texte est archivé (`fieldHistory`), l'écart
 * disparaît. Sinon, l'arbitrage se fait dans l'étape concernée.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProgrammeFieldConflict } from "@parcours/domain-model";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useProjectAccess } from "../../lib/access";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function TextConflictsTable({ projectId, conflicts, stepTitle }: { projectId: string; conflicts: ProgrammeFieldConflict[]; stepTitle?: (n: number) => string }) {
  const queryClient = useQueryClient();
  const access = useProjectAccess(projectId);
  const [error, setError] = useState<string | null>(null);
  const adopt = useMutation({
    mutationFn: (index: number) => api.adoptProgrammeConflict(projectId, index),
    onSuccess: (next) => {
      setError(null);
      queryClient.setQueryData(["programme", projectId], next);
      void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["step", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["design-review", projectId] });
    },
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "La proposition n’a pas pu être adoptée."),
  });
  return (
    <div className="bl-table-wrap text-conflicts" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Étape</th>
            <th scope="col">Champ / valeur conservée</th>
            <th scope="col">Proposition de programme</th>
          </tr>
        </thead>
        <tbody>
          {conflicts.map((x, i) => (
            <tr key={`${x.stage}-${x.field}-${i}`} data-conflict={`${x.stage}:${x.field}`}>
              <td>
                <Link to={`/projets/${projectId}?module=parcours&etape=${x.stage}`}>
                  {pad2(x.stage)}
                  {stepTitle ? ` · ${stepTitle(x.stage)}` : ""}
                </Link>
              </td>
              <td>
                <b>{x.field}</b>
                <small>{x.current}</small>
              </td>
              <td>
                {x.proposed}
                {access.canWrite && (
                  <div>
                    <button type="button" className="button-secondary" disabled={adopt.isPending} onClick={() => adopt.mutate(i)}>
                      Adopter cette proposition
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && (
        <p className="h7-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
