/**
 * Barre « Outils de dessin » de la planche 2D : une barre par famille (Dessin, Modification, Calques, Édition, Vue,
 * Accrochage, Exporter, Catalogue), construite depuis `STUDIO_TOOLS` et `COMMANDES_EDITEUR`. Chaque bouton porte son
 * icône propre, son nom visible (écrans tactiles compris) et son raccourci (`aria-keyshortcuts`, touche affichée). Une
 * bascule (accrochage) est un bouton enfoncé ou non ; un export est un lien de téléchargement (même origine).
 */
import type { ReactNode } from "react";
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
  /** État des bascules (accrochages). */
  basculeActive?: Partial<Record<IdCommandeEditeur, boolean>>;
  /** Adresse des commandes de téléchargement (exports). */
  lienCommande?: Partial<Record<IdCommandeEditeur, string>>;
  surOutil: (toolId: StudioToolId) => void;
  surCommande: (id: IdCommandeEditeur) => void;
  /** Un lien de téléchargement vient d'être suivi (le navigateur télécharge ; la page peut seulement informer). */
  surLien?: (id: IdCommandeEditeur) => void;
}

type NomIcone = Parameters<typeof Icon>[0]["name"];

function Contenu({ libelle, icone, raccourci }: { libelle: string; icone: NomIcone; raccourci: string }): ReactNode {
  return <>
    <Icon name={icone} size={20} />
    <span>{libelle}</span>
    <kbd aria-hidden="true">{libelleRaccourci(raccourci)}</kbd>
  </>;
}

function Bouton({ libelle, icone, raccourci, presse, disponible, onClick, data }: { libelle: string; icone: NomIcone; raccourci: string; presse?: boolean; disponible: boolean; onClick: () => void; data: Record<string, string> }) {
  return (
    <button type="button" aria-label={libelle} title={`${libelle} — ${libelleRaccourci(raccourci)}`} aria-keyshortcuts={ariaRaccourci(raccourci)} aria-pressed={presse} disabled={!disponible} onClick={onClick} {...data}>
      <Contenu libelle={libelle} icone={icone} raccourci={raccourci} />
    </button>
  );
}

/** Lien de téléchargement présenté comme un bouton ; indisponible, il n'a pas d'adresse (`aria-disabled`). */
function Lien({ libelle, icone, raccourci, href, disponible, onClick, data }: { libelle: string; icone: NomIcone; raccourci: string; href: string | undefined; disponible: boolean; onClick: () => void; data: Record<string, string> }) {
  const actif = disponible && !!href;
  return (
    <a className="studio-lien-bouton" aria-label={libelle} title={`${libelle} — ${libelleRaccourci(raccourci)}`} aria-keyshortcuts={ariaRaccourci(raccourci)}
      aria-disabled={actif ? undefined : true} href={actif ? href : undefined} download={actif ? "" : undefined} onClick={(e) => { if (!actif) e.preventDefault(); else onClick(); }} {...data}>
      <Contenu libelle={libelle} icone={icone} raccourci={raccourci} />
    </a>
  );
}

export function BarreOutils({ outil, outilDisponible, commandeDisponible, libelleCommande, basculeActive, lienCommande, surOutil, surCommande, surLien }: BarreOutilsProps) {
  return (
    <div className="studio-tools" role="toolbar" aria-label="Outils de dessin">
      {BARRES_STUDIO.map((barre) => (
        <div key={barre.id} className="studio-tools-group" role="group" aria-label={barre.libelleFR} data-studio-barre={barre.id}>
          {outilsDeBarre(barre.id).map((t) => (
            <Bouton key={t.toolId} libelle={t.libelleFR} icone={t.iconeSymbolique} raccourci={t.raccourci} presse={OUTILS_MODES.has(t.toolId) ? outil === t.toolId : undefined} disponible={outilDisponible(t)} onClick={() => surOutil(t.toolId)} data={{ "data-studio-outil": t.toolId }} />
          ))}
          {commandesDeBarre(barre.id).map((c) => c.telechargement
            ? <Lien key={c.id} libelle={libelleCommande?.[c.id] ?? c.libelleFR} icone={c.iconeSymbolique} raccourci={c.raccourci} href={lienCommande?.[c.id]} disponible={commandeDisponible(c)} onClick={() => surLien?.(c.id)} data={{ "data-studio-commande": c.id }} />
            : <Bouton key={c.id} libelle={libelleCommande?.[c.id] ?? c.libelleFR} icone={c.iconeSymbolique} raccourci={c.raccourci} presse={c.bascule ? basculeActive?.[c.id] === true : undefined} disponible={commandeDisponible(c)} onClick={() => surCommande(c.id)} data={{ "data-studio-commande": c.id }} />)}
        </div>
      ))}
    </div>
  );
}
