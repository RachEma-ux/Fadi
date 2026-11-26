/**
 * Nom de la Planche ouverte dans le fil d'Ariane de la page (26 novembre 2026, maquette validée par le maître d'ouvrage) :
 * « Studio / Console / Sandbox / <nom> ». La page fournit ce rappel ; la Planche y signale son nom tant qu'elle est
 * rattachée à la page, et `null` quand elle est détachée (le nom revient alors dans son bandeau). Sans page qui le
 * fournit, la Planche garde son nom dans le bandeau.
 */
import { createContext } from "react";

export const FilArianePlanche = createContext<((nom: string | null) => void) | null>(null);
