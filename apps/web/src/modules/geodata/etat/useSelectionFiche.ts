/**
 * Sélection, fiche, valeur au point et table (feuille de route équipe A, PR P11 : extraction du domaine D4 de
 * `PageGeoData.tsx`, aucun changement visible). Le hook ne garde que les états ; la décision du premier clic est pure
 * (`selection-ops.ts`), les chargements restent dans la page.
 */
import { useState } from "react";
import type { RangAdministratif } from "@parcours/geodata-model";
import type { FicheRecue, ValeurRasterRecue } from "../client";

export type ValeurPoint = { titre: string; etat: "chargement" | "erreur" | "ok"; recue?: ValeurRasterRecue; erreur?: string };

export function useSelectionFiche() {
  const [valeurPoint, setValeurPoint] = useState<ValeurPoint | null>(null);
  const [selection, setSelection] = useState<{ coucheId: string; code: string } | null>(null);
  // Sélection par nombre de clics (D-GD-34) : niveau sélectionné (recette) et contour d'une entité sans couche chargée.
  const [entite, setEntite] = useState<{ rang: RangAdministratif; code: string; nom: string; coucheId?: string } | null>(null);
  const [entiteContour, setEntiteContour] = useState<unknown | null>(null);
  const [fiche, setFiche] = useState<FicheRecue | null>(null);
  const [ficheEtat, setFicheEtat] = useState<{ chargement: boolean; erreur: string | null }>({ chargement: false, erreur: null });
  const [coucheTable, setCoucheTable] = useState<string | null>(null);
  return { valeurPoint, setValeurPoint, selection, setSelection, entite, setEntite, entiteContour, setEntiteContour, fiche, setFiche, ficheEtat, setFicheEtat, coucheTable, setCoucheTable };
}
