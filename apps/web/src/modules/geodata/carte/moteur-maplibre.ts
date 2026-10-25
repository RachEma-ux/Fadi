/**
 * Implantation MapLibre GL JS 6.12.0 du moteur de GeoData (D-GD-03), chargée à la demande par `import()` : la famille
 * « maplibre » est interdite dans le bundle initial (contrôle du découpage, `carte-morceaux.ts`). Tuiles vectorielles des
 * couches servies par `/geodata/api/tuiles` (autorisées au serveur), fond neutre par défaut ; une valeur absente est grise
 * ET hachurée, jamais confondue avec zéro ; l'objet sélectionné a un contour épais (la couleur n'est pas le seul signe).
 */
import { AttributionControl, Map as CarteMapLibre, NavigationControl, ScaleControl, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import urlWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { COULEUR_ABSENTE, type Composition } from "@parcours/geodata-model";
import { adresseTuiles, type Fond } from "../client";
import type { DonneesAffichage, EvenementsMoteur, MoteurCarte, OutilCarte } from "./moteur";

setWorkerUrl(urlWorker);

const PREFIXE = "gd-couche-";
const FOND_NEUTRE = "#eef2f0";

function hachures(): ImageData {
  const n = 8;
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    const trait = (x + y) % n < 2;
    data[i] = 70; data[i + 1] = 70; data[i + 2] = 70; data[i + 3] = trait ? 200 : 0;
  }
  return new ImageData(data, n, n);
}

export function creerMoteur(conteneur: HTMLElement, composition: Composition, ev: EvenementsMoteur): MoteurCarte {
  const carte = new CarteMapLibre({
    container: conteneur,
    style: { version: 8, sources: {}, layers: [{ id: "gd-fond-neutre", type: "background", paint: { "background-color": FOND_NEUTRE } }] },
    center: [composition.camera.lon, composition.camera.lat],
    zoom: composition.camera.zoom,
    bearing: composition.camera.cap,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    maxZoom: 18,
  });
  const attribution = new AttributionControl({ compact: false, customAttribution: [] });
  carte.addControl(new NavigationControl({ visualizePitch: false, showCompass: true }), "top-right");
  carte.addControl(new ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-left");
  carte.addControl(attribution, "bottom-right");
  carte.keyboard.enable();

  let pret = false;
  let enAttente: (() => void) | null = null;
  let outil: OutilCarte = "navigation";
  let sommets: [number, number][] = [];
  let couchesAffichees: string[] = [];
  let fondCourant = "neutre";

  carte.on("load", () => {
    carte.addImage("gd-hachures", hachures(), { pixelRatio: 1 });
    carte.addSource("gd-zones", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    carte.addSource("gd-trace", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    pret = true;
    enAttente?.();
    enAttente = null;
  });
  carte.on("error", (e) => {
    const m = (e as { error?: { status?: number; message?: string } }).error;
    if (m?.status === 404 || m?.status === 403) ev.surErreur("Une couche n'est plus accessible : ses tuiles sont refusées par le serveur.");
  });
  conteneur.addEventListener("webglcontextlost", () => ev.surErreur("Le rendu graphique (WebGL) a été perdu : la recherche, la table et les fiches restent disponibles."), true);
  carte.on("moveend", () => {
    const c = carte.getCenter();
    ev.surDeplacement({ lon: Number(c.lng.toFixed(6)), lat: Number(c.lat.toFixed(6)), zoom: Number(carte.getZoom().toFixed(2)), cap: Number(carte.getBearing().toFixed(1)) });
  });

  const dessinerTrace = () => {
    const src = carte.getSource("gd-trace") as GeoJSONSource | undefined;
    if (!src) return;
    const fermer = outil === "surface" || outil === "zone";
    const features: Feature[] = sommets.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }));
    if (sommets.length >= 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: fermer && sommets.length >= 3 ? [...sommets, sommets[0]!] : sommets } });
    src.setData({ type: "FeatureCollection", features });
  };

  carte.on("click", (e: MapMouseEvent) => {
    if (outil !== "navigation") {
      sommets.push([Number(e.lngLat.lng.toFixed(7)), Number(e.lngLat.lat.toFixed(7))]);
      if (outil === "annotation") { ev.surTraceTermine(outil, sommets); sommets = []; }
      else ev.surTrace(outil, sommets);
      dessinerTrace();
      return;
    }
    const couches = couchesAffichees.filter((id) => carte.getLayer(`${id}-remplissage`) || carte.getLayer(`${id}-points`) || carte.getLayer(`${id}-lignes`));
    const ids = couches.flatMap((id) => [`${id}-remplissage`, `${id}-lignes`, `${id}-points`]).filter((l) => carte.getLayer(l));
    const f = ids.length ? carte.queryRenderedFeatures(e.point, { layers: ids })[0] : undefined;
    ev.surClic(f ? { coucheId: f.layer.id.replace(/-(remplissage|lignes|points)$/, "").slice(PREFIXE.length), code: String(f.properties["code"]) } : null);
  });
  carte.on("dblclick", (e) => {
    if (outil === "navigation") return;
    e.preventDefault();
    terminer();
  });

  function terminer() {
    if (outil === "navigation") return;
    const min = outil === "distance" ? 2 : 3;
    if (sommets.length >= min) ev.surTraceTermine(outil, sommets);
    sommets = [];
    dessinerTrace();
  }

  function appliquerMaintenant(composition: Composition, fond: Fond, d: DonneesAffichage) {
    // Fond : neutre (aucun fournisseur) ou raster configuré, sous toutes les couches.
    if (fondCourant !== fond.id) {
      if (carte.getLayer("gd-fond-raster")) carte.removeLayer("gd-fond-raster");
      if (carte.getSource("gd-fond-raster")) carte.removeSource("gd-fond-raster");
      if (fond.type === "raster" && fond.tuiles) {
        carte.addSource("gd-fond-raster", { type: "raster", tiles: fond.tuiles, tileSize: 256, attribution: fond.attribution, ...(fond.zoomMax ? { maxzoom: fond.zoomMax } : {}) });
        carte.addLayer({ id: "gd-fond-raster", type: "raster", source: "gd-fond-raster" }, carte.getStyle().layers[1]?.id);
      }
      fondCourant = fond.id;
    }
    const voulues = composition.couches.map((k) => `${PREFIXE}${k.coucheId}`);
    for (const id of couchesAffichees) {
      if (voulues.includes(id)) continue;
      for (const suffixe of ["-remplissage", "-absentes", "-contour", "-selection", "-lignes", "-points"]) if (carte.getLayer(id + suffixe)) carte.removeLayer(id + suffixe);
      if (carte.getSource(id)) carte.removeSource(id);
    }
    for (const k of composition.couches) {
      const id = `${PREFIXE}${k.coucheId}`;
      if (!carte.getSource(id)) {
        carte.addSource(id, { type: "vector", tiles: [adresseTuiles(k.coucheId)], minzoom: 0, maxzoom: 14, promoteId: "code" });
        carte.addLayer({ id: `${id}-remplissage`, type: "fill", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2b8cbe", "fill-opacity": 0.8 } });
        carte.addLayer({ id: `${id}-absentes`, type: "fill", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-pattern": "gd-hachures", "fill-opacity": 0 } });
        carte.addLayer({ id: `${id}-contour`, type: "line", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": "#29434a", "line-width": 0.8 } });
        carte.addLayer({ id: `${id}-lignes`, type: "line", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#2b8cbe", "line-width": 2 } });
        carte.addLayer({ id: `${id}-points`, type: "circle", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#2b8cbe", "circle-radius": 5, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } });
        carte.addLayer({ id: `${id}-selection`, type: "line", source: id, "source-layer": "objets", filter: ["==", ["get", "code"], "__aucun__"], paint: { "line-color": "#c77b35", "line-width": 4 } });
      }
      // Ordre : la première couche de la composition est dessous.
      for (const suffixe of ["-remplissage", "-absentes", "-contour", "-lignes", "-points", "-selection"]) carte.moveLayer(id + suffixe, "gd-zones-remplissage");
      const visible = k.visible ? "visible" : "none";
      for (const suffixe of ["-remplissage", "-absentes", "-contour", "-lignes", "-points", "-selection"]) carte.setLayoutProperty(id + suffixe, "visibility", visible);
      const codes = d.filtres.get(k.coucheId);
      const filtreCode: ExpressionSpecification | null = codes ? ["in", ["get", "code"], ["literal", [...codes]]] : null;
      const avec = (geom: string): ExpressionSpecification => (filtreCode ? ["all", ["==", ["geometry-type"], geom], filtreCode] : ["==", ["geometry-type"], geom]);
      carte.setFilter(`${id}-remplissage`, avec("Polygon"));
      carte.setFilter(`${id}-contour`, avec("Polygon"));
      carte.setFilter(`${id}-lignes`, avec("LineString"));
      carte.setFilter(`${id}-points`, avec("Point"));
      let couleur: string | ExpressionSpecification = "#2b8cbe";
      const absentes: string[] = [];
      if (k.style.mode === "simple") couleur = k.style.couleur;
      else if (k.style.mode === "categories") {
        // Une couleur par entité ; tant que les couleurs ne sont pas reçues, la couleur par défaut.
        const branches = [...(d.categories.get(k.coucheId) ?? new Map<string, string>())].flat();
        couleur = branches.length ? (["match", ["get", "code"], ...branches, "#2b8cbe"] as unknown as ExpressionSpecification) : "#2b8cbe";
      } else {
        const valeurs = d.valeurs.get(k.style.indicateurId);
        const branches: (string | number)[] = [];
        const { seuils, couleurs } = k.style;
        for (const [code, v] of valeurs ?? []) {
          if (v.valeur === null) { absentes.push(code); continue; }
          let c = 0;
          while (c < seuils.length && v.valeur >= seuils[c]!) c++;
          branches.push(code, couleurs[c] ?? COULEUR_ABSENTE);
        }
        couleur = branches.length ? (["match", ["get", "code"], ...branches, COULEUR_ABSENTE] as unknown as ExpressionSpecification) : COULEUR_ABSENTE;
        // Une unité sans ligne de valeur (non appariée) est aussi « absente » : grise et hachurée.
        carte.setFilter(`${id}-absentes`, ["all", ["==", ["geometry-type"], "Polygon"], ...(filtreCode ? [filtreCode] : []), ["any", ["in", ["get", "code"], ["literal", absentes]], ["!", ["in", ["get", "code"], ["literal", [...(valeurs?.keys() ?? [])]]]]]]);
      }
      carte.setPaintProperty(`${id}-remplissage`, "fill-color", couleur);
      carte.setPaintProperty(`${id}-remplissage`, "fill-opacity", k.opacite);
      carte.setPaintProperty(`${id}-absentes`, "fill-opacity", k.style.mode === "thematique" ? Math.min(1, k.opacite + 0.1) : 0);
      carte.setPaintProperty(`${id}-lignes`, "line-color", couleur);
      carte.setPaintProperty(`${id}-points`, "circle-color", couleur);
      carte.setPaintProperty(`${id}-lignes`, "line-opacity", k.opacite);
      carte.setPaintProperty(`${id}-points`, "circle-opacity", k.opacite);
      carte.setFilter(`${id}-selection`, ["==", ["get", "code"], d.selection?.coucheId === k.coucheId ? d.selection.code : "__aucun__"]);
    }
    couchesAffichees = voulues;
    (carte.getSource("gd-zones") as GeoJSONSource).setData(d.zones as FeatureCollection);
    attribution.options.customAttribution = [...d.attributions, ...(fond.attribution ? [fond.attribution] : [])];
    (attribution as unknown as { _updateAttributions(): void })._updateAttributions();
  }

  const posees = () => {
    if (carte.getLayer("gd-zones-remplissage")) return;
    carte.addLayer({ id: "gd-zones-remplissage", type: "fill", source: "gd-zones", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#c77b35", "fill-opacity": 0.15 } });
    carte.addLayer({ id: "gd-zones-contour", type: "line", source: "gd-zones", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": "#c77b35", "line-width": 2, "line-dasharray": [2, 1] } });
    carte.addLayer({ id: "gd-zones-points", type: "circle", source: "gd-zones", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#c77b35", "circle-radius": 6, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
    carte.addLayer({ id: "gd-trace-ligne", type: "line", source: "gd-trace", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#b0361b", "line-width": 2 } });
    carte.addLayer({ id: "gd-trace-points", type: "circle", source: "gd-trace", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#b0361b", "circle-radius": 4 } });
  };

  return {
    appliquer(composition, fond, donnees) {
      const f = () => { posees(); appliquerMaintenant(composition, fond, donnees); };
      if (pret) f();
      else enAttente = f;
    },
    allerA(cible) {
      if ("emprise" in cible) carte.fitBounds([[cible.emprise[0], cible.emprise[1]], [cible.emprise[2], cible.emprise[3]]], { padding: 40, maxZoom: 13, duration: 600 });
      // Carte rouverte : caméra enregistrée restituée à l'identique (orientation comprise), sans animation.
      else if (cible.cap !== undefined) carte.jumpTo({ center: [cible.lon, cible.lat], zoom: cible.zoom ?? carte.getZoom(), bearing: cible.cap });
      else carte.flyTo({ center: [cible.lon, cible.lat], zoom: cible.zoom ?? Math.max(carte.getZoom(), 11), duration: 600 });
    },
    definirOutil(o) {
      outil = o;
      sommets = [];
      dessinerTrace();
      carte.getCanvas().style.cursor = o === "navigation" ? "" : "crosshair";
      if (o === "navigation") carte.doubleClickZoom.enable();
      else carte.doubleClickZoom.disable();
    },
    terminerTrace: terminer,
    annulerTrace() { sommets = []; dessinerTrace(); },
    attendreChargement(delaiMs) {
      return new Promise((resoudre) => {
        if (carte.loaded() && carte.areTilesLoaded()) return resoudre(true);
        const fin = setTimeout(() => resoudre(carte.areTilesLoaded()), delaiMs);
        carte.once("idle", () => { clearTimeout(fin); resoudre(carte.areTilesLoaded()); });
        carte.triggerRepaint();
      });
    },
    canevas: () => carte.getCanvas(),
    metresParPixel() {
      const lat = carte.getCenter().lat;
      return (40_075_016.7 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** carte.getZoom());
    },
    detruire: () => carte.remove(),
  };
}
