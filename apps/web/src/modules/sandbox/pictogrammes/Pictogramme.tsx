/**
 * Pictogramme du Sandbox (lot 3) : icône Tabler ou dessin sur mesure, en SVG (trait de 2 px, grille de 24 px), jamais un
 * caractère. La couleur suit la teinte de la famille (`data-teinte`, `sandbox.css`) ; la variante pleine de Tabler, quand
 * elle existe, signale l'outil actif. Décoratif : le nom accessible reste porté par le bouton.
 */
import { createElement } from "react";
import { clePictogramme, type Pictogramme as DescriptionPictogramme } from "@parcours/sandbox-planche-model";
import { PICTOGRAMMES } from "./donnees";
import { ICONES_INTERFACE, type IconeInterface } from "./interface";

interface Proprietes {
  readonly picto: DescriptionPictogramme;
  /** Outil actif : variante pleine de Tabler si elle existe. */
  readonly actif?: boolean;
  readonly className?: string;
}

function Svg({ cle, actif, teinte, className }: { cle: string; actif: boolean; teinte: string | undefined; className: string | undefined }) {
  const donnees = PICTOGRAMMES[cle];
  if (!donnees) throw new Error(`Pictogramme absent des données générées : ${cle}`);
  const plein = actif && donnees.plein !== undefined;
  const noeuds = plein ? donnees.plein! : donnees.trait;
  return (
    <svg
      className={className ? `sandbox-picto ${className}` : "sandbox-picto"}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill={plein ? "currentColor" : "none"}
      stroke={plein ? "none" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-picto={cle}
      data-teinte={teinte}
      data-plein={plein ? "" : undefined}
    >
      {noeuds.map(([balise, attributs], i) => createElement(balise, { key: i, ...attributs }))}
    </svg>
  );
}

/** Pictogramme d'une entrée du registre (outil, commande, panneau). */
export function Pictogramme({ picto, actif = false, className }: Proprietes) {
  return <Svg cle={clePictogramme(picto)} actif={actif} teinte={picto.teinte} className={className} />;
}

/** Icône de l'interface hors registre (bascules, fermetures, poignées…), à la couleur du texte. */
export function IconeSandbox({ nom, className }: { nom: IconeInterface; className?: string }) {
  return <Svg cle={clePictogramme({ source: "tabler", nom: ICONES_INTERFACE[nom] })} actif={false} teinte={undefined} className={className} />;
}
