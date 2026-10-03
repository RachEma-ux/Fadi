/**
 * « Proposer un transfert surfacique à total constant » — le pli que h7-app
 * ajoute au panneau Harmonie de l'étape 07 (`programmeTransferHTML`,
 * `previewTransfer`, `applyTransfer`) : fiche donneuse, fiche bénéficiaire,
 * surface et justification → comparaison avant / après calculée par le
 * serveur, puis application sur la même empreinte du programme (refusée si
 * le programme a changé entre-temps). Deux cibles programmatiques changent ;
 * le dessin, le terrain, l'emprise et la capacité déclarée, non.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WriteFieldset } from "../../components/WriteFieldset";
import { api, ApiError, type SurfaceTransferView } from "../../lib/api";
import { appliedCase } from "./ProgrammeCase";

const fmt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export function ProgrammeTransferFold({ projectId, onApplied }: { projectId: string; onApplied: (message: string) => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["programme", projectId], queryFn: () => api.getProgramme(projectId) });
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<SurfaceTransferView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useMutation({
    mutationFn: (input: { from: string; to: string; amount: string; reason: string }) => api.previewProgrammeTransfer(projectId, input),
    onSuccess: (t) => {
      setError(null);
      setPending(t);
    },
    onError: (err) => {
      setPending(null);
      setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Comparaison impossible.");
    },
  });
  const apply = useMutation({
    mutationFn: (t: SurfaceTransferView) => api.applyProgrammeTransfer(projectId, t),
    onSuccess: (view) => {
      setError(null);
      setPending(null);
      setAmount("");
      setReason("");
      setTo("");
      queryClient.setQueryData(["programme", projectId], view);
      void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["programme-links", projectId] });
      onApplied("Transfert appliqué au programme à total constant. Géométrie conservée.");
    },
    onError: (err) => {
      setPending(null);
      setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Transfert refusé.");
    },
  });
  if (!query.data) return null;
  // La référence protégée d'un exemple résolu garde le panneau du prototype, sans transfert : « Essayer une autre répartition en copie ».
  if (query.data.resolvedExample) return null;
  const a = appliedCase(query.data);
  if (!a) return <p className="h7-callout">Appliquez un cas de la bibliothèque pour proposer un transfert chiffré entre ses fiches d’espaces.</p>;
  const options = a.spaces.filter((s) => s.quantity > 0);
  const fromId = from ?? options[0]?.id ?? "";
  const busy = preview.isPending || apply.isPending;
  return (
    <details className="h7-fold h7-transfer-fold">
      <summary>Proposer un transfert surfacique à total constant</summary>
      <div className="h7-fold-body">
        <p>Le transfert concerne uniquement le programme ; il ne change pas le terrain, l’emprise, les pièces dessinées ni la capacité déclarée.</p>
        <WriteFieldset projectId={projectId}>
        <div className="h7-form">
          <label>
            Fiche donneuse
            <select id="h7-from" value={fromId} onChange={(e) => setFrom(e.target.value)}>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {fmt(s.quantity * s.unitArea)} m²
                </option>
              ))}
            </select>
          </label>
          <label>
            Fiche bénéficiaire
            <select id="h7-to" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choisir</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {fmt(s.quantity * s.unitArea)} m²
                </option>
              ))}
            </select>
          </label>
          <label>
            Surface totale à transférer (m²)
            <input id="h7-transfer-area" type="number" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Justification
            <input id="h7-transfer-reason" maxLength={700} placeholder="Besoin et conséquence sur la capacité" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <button type="button" className="button-primary" disabled={busy} onClick={() => preview.mutate({ from: fromId, to, amount, reason })}>
          Comparer avant / après
        </button>
        </WriteFieldset>
        {error && (
          <p className="h7-error" role="alert">
            {error}
          </p>
        )}
        <div id="h7-transfer-preview">
          {pending && (
            <>
              <div className="h7-table-wrap">
                <table className="h7-table">
                  <thead>
                    <tr>
                      <th>Poste</th>
                      <th>Avant</th>
                      <th>Après</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["from", "Donneur"],
                        ["to", "Bénéficiaire"],
                        ["total", "Total programme"],
                      ] as const
                    ).map(([k, label]) => (
                      <tr key={k}>
                        <td>{label}</td>
                        <td>{fmt(pending.before[k])} m²</td>
                        <td>{fmt(pending.after[k])} m²</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="h7-callout warn">L’application modifie deux cibles programmatiques, pas le dessin. Vérifiez les conséquences de capacité et de conformité.</p>
              <button type="button" className="button-primary" disabled={busy} onClick={() => apply.mutate(pending)}>
                Appliquer ce transfert au programme
              </button>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
