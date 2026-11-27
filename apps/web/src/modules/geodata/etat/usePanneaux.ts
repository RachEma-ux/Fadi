/**
 * États des panneaux de la page GeoData (PR P4 : extraction du domaine D5 de `PageGeoData.tsx`, aucun changement
 * visible). Les transitions sont dans `panneaux-ops.ts` ; ce hook ne garde que les états.
 */
import { useEffect, useState } from "react";
import type { PlacementOutils } from "../panneaux/BarreRecherche";
import type { OngletPanneau, VoletPage } from "./panneaux-ops";

const lireLocal = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };

export type PanneauMini = "recherche" | "navigation" | "fonds";

export function usePanneaux(ongletPageCartes: boolean) {
  // Onglets du tableau de bord montés une fois visités (la carte reste montée derrière).
  const [bordVisite, setBordVisite] = useState(!ongletPageCartes);
  useEffect(() => { if (!ongletPageCartes) setBordVisite(true); }, [ongletPageCartes]);
  const [onglet, setOnglet] = useState<OngletPanneau>("catalogue");
  // Catalogue fermé à chaque ouverture de la page (P1, décision D1) : la carte d'arrivée reste dégagée.
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  // Consigne d'arrivée écartée pour la session (P1).
  const [consigneEcartee, setConsigneEcartee] = useState(false);
  const [volet, setVolet] = useState<VoletPage | null>(null);
  // Panneaux de la mini-barre (D-GD-38) : recherche, fil de navigation, fonds — un seul ouvert à la fois.
  const [panneauMini, setPanneauMini] = useState<PanneauMini | null>(null);
  const [placementOutils, setPlacementOutils] = useState<PlacementOutils | null>(null);
  const [annonce, setAnnonce] = useState("");
  const [menuOuvert, setMenuOuvert] = useState(false);
  // Menu ☰ : rubrique « Cartes » dépliée (D-GD-36).
  const [menuCartes, setMenuCartes] = useState(false);
  // Pastilles de thème (D-GD-48) : bande repliable, état mémorisé dans ce navigateur (simple confort).
  const [pastillesOuvertes, setPastillesOuvertes] = useState(() => lireLocal("geodata.pastilles") !== "0");
  return {
    bordVisite, onglet, setOnglet, panneauOuvert, setPanneauOuvert, consigneEcartee, setConsigneEcartee, volet, setVolet,
    panneauMini, setPanneauMini, placementOutils, setPlacementOutils, annonce, setAnnonce, menuOuvert, setMenuOuvert,
    menuCartes, setMenuCartes, pastillesOuvertes, setPastillesOuvertes,
  };
}
