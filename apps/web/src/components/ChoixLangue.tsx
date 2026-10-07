/** Choix de la langue de l'interface (D-163) : français ou anglais ; la page se recharge dans la langue choisie. */
import { choisirLangue, LANGUE, LANGUES, type Langue } from "../lib/i18n";

export function ChoixLangue({ className = "choix-langue" }: { className?: string }) {
  return (
    <label className={className}>
      <span className="sr-only">Langue de l'interface</span>
      <select value={LANGUE} onChange={(e) => choisirLangue(e.target.value as Langue)} data-choix-langue aria-label="Langue de l'interface" translate="no">
        {LANGUES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.nom}
          </option>
        ))}
      </select>
    </label>
  );
}
