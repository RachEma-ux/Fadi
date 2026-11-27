/**
 * Outils de la carte, tracé et zones d'étude (feuille de route équipe A, PR P6 : extraction du domaine D6 de
 * `PageGeoData.tsx`, aucun changement visible). Le hook ne garde que les états et la lecture des zones ; les règles
 * sont dans `outils-ops.ts`. Le choix d'un outil ouvre un volet (domaine des panneaux) : la page le fait par
 * `voletDeOutil`, ce hook n'écrit jamais dans les panneaux.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { api, type ZoneRecue } from "../client";
import type { OutilCarte } from "../carte/moteur";
import type { TraceEnCours } from "../panneaux/travail";
import { zoneActiveDe } from "./outils-ops";

export type CodesZone = { zone: string; couches: Map<string, { codes: string[]; tronque: boolean } | { erreur: string }> };

export function useOutilsZones() {
  const [outil, setOutil] = useState<OutilCarte>("navigation");
  const [trace, setTrace] = useState<TraceEnCours | null>(null);
  const [tracePret, setTracePret] = useState<TraceEnCours | null>(null);
  const [zones, setZones] = useState<ZoneRecue[]>([]);
  // Zone d'étude qui filtre la carte, la table et la synthèse (D-GD-41) ; codes des objets qui la recoupent, par couche.
  const [zonesLues, setZonesLues] = useState(false);
  const [zoneFiltre, setZoneFiltre] = useState<string | null>(null);
  const derniereZone = useRef<string | null>(null);
  const [codesZone, setCodesZone] = useState<CodesZone | null>(null);
  const [analysesIds, setAnalysesIds] = useState<string[]>([]);
  const chargerZones = useCallback(() => {
    api.zones().then((r) => { setZones(r.zones); setZonesLues(true); }).catch(() => undefined);
    api.analyses().then((r) => setAnalysesIds(r.analyses.map((a) => a.id))).catch(() => undefined);
  }, []);
  const zoneActive = useMemo(() => zoneActiveDe(zones, zoneFiltre), [zones, zoneFiltre]);
  return {
    outil, setOutil, trace, setTrace, tracePret, setTracePret, zones, zonesLues, zoneFiltre, setZoneFiltre, derniereZone,
    codesZone, setCodesZone, analysesIds, chargerZones, zoneActive,
  };
}
