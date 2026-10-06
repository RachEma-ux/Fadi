/**
 * Raccourcis clavier configurables (D-158) : une touche par outil, préférence locale de l'appareil. Une touche déjà
 * prise est retirée de l'outil qui la portait (dit à l'écran) ; les touches réservées sont refusées avec leur motif.
 */
import { useMemo, useState } from "react";
import { etatUi, type EtatUi } from "../etat-ui";
import { FAMILLES, OUTILS } from "../outils";
import { affecterTouche, libelleTouche, raccourciDe } from "../raccourcis";

export function RaccourcisPanneau({ ui }: { ui: EtatUi }) {
  const [filtre, setFiltre] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const liste = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    return OUTILS.filter((o) => !f || o.libelle.toLowerCase().includes(f) || o.synonymes.some((s) => s.toLowerCase().includes(f)));
  }, [filtre]);
  const affecter = (id: string, brut: string) => {
    const t = brut === "Delete" ? "" : brut;
    const avant = OUTILS.filter((o) => o.id !== id && raccourciDe(o, ui.raccourcis) === t.toLowerCase());
    const r = affecterTouche(ui.raccourcis, id, t);
    if ("motif" in r) {
      setMessage(`Touche refusée : ${r.motif}.`);
      return;
    }
    etatUi.set({ raccourcis: r });
    const o = OUTILS.find((x) => x.id === id)!;
    setMessage(t ? `${o.libelle} : touche ${libelleTouche(t)}${avant.length ? ` (retirée de ${avant.map((x) => x.libelle).join(", ")})` : ""}.` : `${o.libelle} : aucun raccourci.`);
  };
  return (
    <div className="raccourcis-panneau" data-raccourcis>
      <p className="inspecteur-aide">Cliquez le champ d'un outil puis appuyez sur une lettre ; Suppr ou Retour arrière retire le raccourci. Réservées : Échap, Entrée, Suppr, Espace, chiffres, + − =.</p>
      <label>Rechercher un outil<input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-raccourcis-filtre /></label>
      {message && <p className="inspecteur-aide" role="status" data-raccourcis-message>{message}</p>}
      <table className="raccourcis-table">
        <thead><tr><th scope="col">Outil</th><th scope="col">Touche</th></tr></thead>
        <tbody>
          {liste.map((o) => {
            const t = raccourciDe(o, ui.raccourcis);
            return (
              <tr key={o.id}>
                <th scope="row"><span aria-hidden="true">{o.picto}</span> {o.libelle} <span className="palette-famille">{FAMILLES[o.famille]}</span></th>
                <td>
                  <input
                    className="raccourci-touche"
                    readOnly
                    value={libelleTouche(t) ?? ""}
                    placeholder="—"
                    aria-label={`Raccourci de ${o.libelle}`}
                    data-raccourci-outil={o.id}
                    onKeyDown={(e) => {
                      if (e.key === "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.key === "Escape") return (e.currentTarget as HTMLInputElement).blur();
                      affecter(o.id, e.key === "Backspace" || e.key === "Delete" ? "" : e.key);
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" onClick={() => { etatUi.set({ raccourcis: {} }); setMessage("Raccourcis par défaut rétablis."); }} data-raccourcis-defaut>Rétablir les raccourcis par défaut</button>
    </div>
  );
}
