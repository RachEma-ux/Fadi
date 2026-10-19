/// <reference lib="webworker" />
/**
 * Worker de Studio : lecture DXF et composition de la feuille hors du fil principal. Chargé à la première demande
 * (`client-studio.ts`), jamais à l'ouverture de Studio.
 */
import { brancher, type PorteeWorker } from "./protocole";
import { TRAITEMENTS_STUDIO } from "./traitements";

brancher(self as unknown as PorteeWorker, TRAITEMENTS_STUDIO);
