/**
 * Sélecteur d'étage (cas 4, lot C1, étape 1a, D4-F5-002 et D1-F19-036 ; maquette `c1-etape-1a-selecteur-etage.png`) :
 * posé dans la vue, il liste les niveaux du plus haut au plus bas. Choisir un étage l'isole (les objets des autres niveaux
 * ne sont ni rendus ni accrochés), en fait le niveau de travail et pose la coupe horizontale à sa hauteur de plan ;
 * « Tous les étages » lève l'isolement. La hauteur de plan se règle ici (réglage de la vue, sans raccourci propre) ou
 * dans la colonne « Coupe » du panneau Niveaux. Échap ferme le sélecteur et rend tous les étages.
 */
import { type Id, type Niveau, type Pictogramme as PictogrammeSandbox, hauteurDePlan, texteAltitude } from "@parcours/sandbox-planche-model";
import { type KeyboardEvent, useEffect, useState } from "react";
import { LANGUE_INTERFACE, t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { afficherRaccourci } from "./outils-planche";

const separateur = (): "," | "." => (LANGUE_INTERFACE === "en" ? "." : ",");
const nombre = (v: number): string => v.toFixed(2).replace(".", separateur());

export function SelecteurEtage({
  niveaux,
  choisi,
  picto,
  raccourci,
  lecture,
  onChoisir,
  onCoupe,
  onFermer,
}: {
  /** Niveaux du plus haut au plus bas. */
  niveaux: readonly Niveau[];
  /** Étage isolé ; `null` = tous les étages. */
  choisi: Id | null;
  picto: PictogrammeSandbox;
  raccourci: string;
  lecture: boolean;
  onChoisir: (id: Id | null) => void;
  onCoupe: (id: Id, texte: string) => void;
  onFermer: () => void;
}) {
  const courant = niveaux.find((n) => n.id === choisi) ?? null;
  const valeur = courant ? nombre(hauteurDePlan(courant)) : "";
  const [texte, setTexte] = useState(valeur);
  useEffect(() => setTexte(valeur), [valeur]);
  const enregistrer = () => {
    if (courant && texte !== valeur) onCoupe(courant.id, texte);
  };
  const touche = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onFermer();
    }
  };
  return (
    <div className="planche-etage" role="dialog" aria-label={t("planche.etage.ouvrir")} onKeyDown={touche} onPointerDown={(e) => e.stopPropagation()} data-planche-etage={choisi ?? "tous"}>
      <div className="planche-etage-tete">
        <Pictogramme picto={picto} />
        <b>{t("planche.etage.court")}</b>
        <kbd>{afficherRaccourci(raccourci)}</kbd>
      </div>
      <div role="listbox" aria-label={t("planche.etage.liste")}>
        {niveaux.map((n) => (
          <button key={n.id} type="button" role="option" aria-selected={n.id === choisi} className={n.id === choisi ? "est-choisi" : undefined} onClick={() => onChoisir(n.id)} data-planche-etage-niveau={n.id}>
            <span translate="no">{n.id === choisi && <span className="planche-etage-point" aria-hidden="true" />}{n.nom}</span>
            <span>{texteAltitude(n.altitude, separateur())} m</span>
          </button>
        ))}
        <button type="button" role="option" aria-selected={choisi === null} className={`planche-etage-tous${choisi === null ? " est-choisi" : ""}`} onClick={() => onChoisir(null)} data-planche-etage-niveau="tous">
          <span>{t("planche.etage.tous")}</span>
        </button>
      </div>
      {courant && (
        <label className="planche-etage-coupe">
          <span>{t("planche.etage.coupe.avant")}</span>
          <input value={texte} disabled={lecture} inputMode="decimal" onKeyDown={(e) => { if (e.key === "Enter") enregistrer(); }} onBlur={enregistrer} onChange={(e) => setTexte(e.target.value)} data-planche-etage-coupe />
          <span>{t("planche.etage.coupe.apres")}</span>
        </label>
      )}
    </div>
  );
}
