/**
 * « Importer projet JSON » (page Projets et outils du projet du prototype,
 * `chooseImport` / `importBundle`) : une archive Fadi ou un export du
 * logiciel existant (Parcours V6 / V7, base projets V5) devient un ou
 * plusieurs NOUVEAUX projets ; les projets existants sont conservés. Le
 * serveur fait la conversion et refuse avec les messages du prototype.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type ImportedProjects } from "../../lib/api";
import { HarmonieToast } from "../parcours/HarmoniePanel";

const IMPORT_LIMIT = 32 * 1024 * 1024;

export function ImportProjectButton({ className = "button-secondary", label = "Importer projet JSON" }: { className?: string; label?: string }) {
  const input = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > IMPORT_LIMIT) throw new ApiError(413, "archive_rule", "Le fichier dépasse 32 Mo.");
      const result: ImportedProjects = await api.importProjectArchive(file);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      const first = result.projects[0];
      const warnings = result.projects.flatMap((p) => p.warnings);
      const notice = warnings.length ? `Import créé dans un nouveau dossier ; réserves : ${warnings.join(" · ")}` : "Import créé dans un nouveau dossier. Les projets existants sont conservés.";
      // Le nouveau dossier s'ouvre : le message le suit (état de navigation), ce bouton étant démonté avec la page d'origine.
      if (first) navigate(`/projets/${first.id}?module=parcours`, { state: { notice } });
      else setToast(notice);
    } catch (err) {
      setToast(`Import refusé : ${err instanceof ApiError && err.serverMessage ? err.serverMessage : "fichier illisible."}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Import…" : label}
      </button>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <HarmonieToast text={toast} onDone={() => setToast(null)} />
    </>
  );
}
