/**
 * Barre « Outils de dessin » de la planche 2D : une barre par famille (Dessin, Modification, Calques, Édition, Vue),
 * construite depuis `STUDIO_TOOLS` et `COMMANDES_EDITEUR`. Chaque bouton porte son icône propre, son nom visible
 * (écrans tactiles compris) et son raccourci (`aria-keyshortcuts`, touche affichée).
 */
import { Icon } from "../../../components/Icon";
import {
  ariaRaccourci, BARRES_STUDIO, commandesDeBarre, libelleRaccourci, OUTILS_MODES, outilsDeBarre,
  type CommandeEditeur, type IdCommandeEditeur, type StudioToolEntry, type StudioToolId,
} from "./raccourcis";

export interface BarreOutilsProps {
  outil: StudioToolId;
  /** Disponibilité de chaque outil ou commande (lecture seule, sélection, historique…). */
  outilDisponible: (t: StudioToolEntry) => boolean;
  commandeDisponible: (c: CommandeEditeur) => boolean;
  /** Libellé courant d'une commande quand il change (« Réessayer la sauvegarde »). */
  libelleCommande?: Partial<Record<IdCommandeEditeur, string>>;
  surOutil: (toolId: StudioToolId) => void;
  surCommande: (id: IdCommandeEditeur) => void;
}

function Bouton({ libelle, icone, raccourci, presse, disponible, onClick, data }: { libelle: string; icone: Parameters<typeof Icon>[0]["name"]; raccourci: string; presse?: boolean; disponible: boolean; onClick: () => void; data: Record<string, string> }) {
  return (
    <button type="button" aria-label={libelle} title={`${libelle} — ${libelleRaccourci(raccourci)}`} aria-keyshortcuts={ariaRaccourci(raccourci)} aria-pressed={presse} disabled={!disponible} onClick={onClick} {...data}>
      <Icon name={icone} size={20} />
      <span>{libelle}</span>
      <kbd aria-hidden="true">{libelleRaccourci(raccourci)}</kbd>
    </button>
  );
}

export function BarreOutils({ outil, outilDisponible, commandeDisponible, libelleCommande, surOutil, surCommande }: BarreOutilsProps) {
  return (
    <div className="studio-tools" role="toolbar" aria-label="Outils de dessin">
      {BARRES_STUDIO.map((barre) => (
        <div key={barre.id} className="studio-tools-group" role="group" aria-label={barre.libelleFR} data-studio-barre={barre.id}>
          {outilsDeBarre(barre.id).map((t) => (
            <Bouton key={t.toolId} libelle={t.libelleFR} icone={t.iconeSymbolique} raccourci={t.raccourci} presse={OUTILS_MODES.has(t.toolId) ? outil === t.toolId : undefined} disponible={outilDisponible(t)} onClick={() => surOutil(t.toolId)} data={{ "data-studio-outil": t.toolId }} />
          ))}
          {commandesDeBarre(barre.id).map((c) => (
            <Bouton key={c.id} libelle={libelleCommande?.[c.id] ?? c.libelleFR} icone={c.iconeSymbolique} raccourci={c.raccourci} disponible={commandeDisponible(c)} onClick={() => surCommande(c.id)} data={{ "data-studio-commande": c.id }} />
          ))}
        </div>
      ))}
    </div>
  );
}
