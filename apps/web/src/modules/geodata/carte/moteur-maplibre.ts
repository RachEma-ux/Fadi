/**
 * Implantation MapLibre GL JS 6.12.0 du moteur de GeoData (D-GD-03), chargée à la demande par `import()` : la famille
 * « maplibre » est interdite dans le bundle initial (contrôle du découpage, `carte-morceaux.ts`). Tuiles vectorielles des
 * couches servies par `/geodata/api/tuiles` (autorisées au serveur), fond neutre par défaut ; une valeur absente est grise
 * ET hachurée, jamais confondue avec zéro ; l'objet sélectionné a un contour épais (la couleur n'est pas le seul signe).
 */
import { AttributionControl, Map as CarteMapLibre, ScaleControl, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import urlWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { COULEUR_ABSENTE, epaisseurContour, ordreAffichage, POLICE_ETIQUETTES, type Composition } from "@parcours/geodata-model";
import { adresseEtiquettes, adresseGlyphes, adresseRaster, adresseTuiles, type Fond } from "../client";
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
    // Glyphes des libellés servis par Fadi (D-GD-24) : demandés seulement quand un libellé est affiché.
    style: { version: 8, glyphs: adresseGlyphes(), sources: {}, layers: [{ id: "gd-fond-neutre", type: "background", paint: { "background-color": FOND_NEUTRE } }] },
    center: [composition.camera.lon, composition.camera.lat],
    zoom: composition.camera.zoom,
    bearing: composition.camera.cap,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    maxZoom: 18,
  });
  const attribution = new AttributionControl({ compact: false, customAttribution: [] });
  // Zoom, nord et plein écran : barre d'outils verticale de la page (BarreOutilsCarte), pas de contrôle MapLibre.
  carte.addControl(new ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-right");
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
  let fondSignale: string | null = null;
  carte.on("error", (e) => {
    const m = (e as { error?: { status?: number; message?: string } }).error;
    // Fond d'un fournisseur (D-GD-15) : un refus de tuiles (clé, quota, adresse) est signalé une fois, sans bloquer la carte.
    if ((e as { sourceId?: string }).sourceId === "gd-fond-raster") {
      if (fondSignale !== fondCourant) { fondSignale = fondCourant; ev.surErreurFond?.(`Le fond choisi ne se charge pas${m?.status ? ` (réponse ${m.status})` : ""} : vérifiez le fournisseur et sa clé dans Paramètres, ou revenez au fond neutre.`); }
      return;
    }
    // Glyphe d'une plage non livrée : le libellé perd ce caractère, la couche reste accessible (pas une erreur de couche).
    if (/\/geodata\/glyphes\//.test(m?.message ?? "")) return;
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
    ev.surClic(f ? { coucheId: f.layer.id.replace(/-(remplissage|lignes|points)$/, "").slice(PREFIXE.length), code: String(f.properties["code"]) } : null, { lon: e.lngLat.lng, lat: e.lngLat.lat });
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
      for (const suffixe of ["-remplissage", "-absentes", "-contour", "-selection", "-lignes", "-points", "-raster", "-etiquettes"]) if (carte.getLayer(id + suffixe)) carte.removeLayer(id + suffixe);
      if (carte.getSource(id)) carte.removeSource(id);
      if (carte.getSource(`${id}-etq`)) carte.removeSource(`${id}-etq`);
    }
    // Ordre d'affichage (D-GD-16) : celui de la composition, sauf entre limites administratives (région au-dessus).
    const ordre = ordreAffichage(composition.couches, d.rangs);
    for (const k of ordre) {
      const id = `${PREFIXE}${k.coucheId}`;
      if (d.rasters.has(k.coucheId)) {
        // Couche raster : tuiles d'image rendues par le serveur, seule l'opacité est réglable (symbologie de la couche).
        if (!carte.getSource(id)) {
          carte.addSource(id, { type: "raster", tiles: [adresseRaster(k.coucheId)], tileSize: 256, minzoom: 0, maxzoom: 14 });
          carte.addLayer({ id: `${id}-raster`, type: "raster", source: id, paint: { "raster-opacity": k.opacite, "raster-resampling": "nearest" } });
        }
        carte.moveLayer(`${id}-raster`, "gd-zones-remplissage");
        carte.setLayoutProperty(`${id}-raster`, "visibility", k.visible ? "visible" : "none");
        carte.setPaintProperty(`${id}-raster`, "raster-opacity", k.opacite);
        continue;
      }
      if (!carte.getSource(id)) {
        carte.addSource(id, { type: "vector", tiles: [adresseTuiles(k.coucheId)], minzoom: 0, maxzoom: 14, promoteId: "code" });
        carte.addLayer({ id: `${id}-remplissage`, type: "fill", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2b8cbe", "fill-opacity": 0.8 } });
        carte.addLayer({ id: `${id}-absentes`, type: "fill", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-pattern": "gd-hachures", "fill-opacity": 0 } });
        carte.addLayer({ id: `${id}-contour`, type: "line", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": "#29434a", "line-width": 0.8 } });
        carte.addLayer({ id: `${id}-lignes`, type: "line", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#2b8cbe", "line-width": 2 } });
        carte.addLayer({ id: `${id}-points`, type: "circle", source: id, "source-layer": "objets", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#2b8cbe", "circle-radius": 5, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } });
        carte.addLayer({ id: `${id}-selection`, type: "line", source: id, "source-layer": "objets", filter: ["==", ["get", "code"], "__aucun__"], paint: { "line-color": "#c77b35", "line-width": 4 } });
      }
      // Ordre : la première couche est dessous ; les remplissages ici, les contours et objets linéaires ensuite, au-dessus
      // de tous les remplissages (une bordure n'est jamais masquée par le remplissage d'une autre couche).
      for (const suffixe of ["-remplissage", "-absentes"]) carte.moveLayer(id + suffixe, "gd-zones-remplissage");
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
      } else if (k.style.mode === "thematique") {
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
      // Contour de la couleur de l'entité, opaque même à 0 % de remplissage ; épaisseur selon le rang administratif.
      carte.setPaintProperty(`${id}-contour`, "line-color", couleur);
      carte.setPaintProperty(`${id}-contour`, "line-width", epaisseurContour(d.rangs.get(k.coucheId) ?? null));
      carte.setPaintProperty(`${id}-contour`, "line-opacity", 1);
      carte.setPaintProperty(`${id}-lignes`, "line-color", couleur);
      carte.setPaintProperty(`${id}-points`, "circle-color", couleur);
      carte.setPaintProperty(`${id}-lignes`, "line-opacity", k.opacite);
      carte.setPaintProperty(`${id}-points`, "circle-opacity", k.opacite);
      carte.setFilter(`${id}-selection`, ["==", ["get", "code"], d.selection?.coucheId === k.coucheId ? d.selection.code : "__aucun__"]);
      etiqueter(id, k, filtreCode, d);
    }
    for (const k of ordre) {
      const id = `${PREFIXE}${k.coucheId}`;
      if (d.rasters.has(k.coucheId)) continue;
      for (const suffixe of ["-contour", "-lignes", "-points", "-selection"]) carte.moveLayer(id + suffixe, "gd-zones-remplissage");
    }
    // Libellés au-dessus de tous les objets (et sous le tracé en cours), dans l'ordre des couches.
    for (const k of ordre) if (carte.getLayer(`${PREFIXE}${k.coucheId}-etiquettes`)) carte.moveLayer(`${PREFIXE}${k.coucheId}-etiquettes`, "gd-trace-ligne");
    couchesAffichees = voulues;
    (carte.getSource("gd-zones") as GeoJSONSource).setData(d.zones as FeatureCollection);
    attribution.options.customAttribution = [...d.attributions, ...(fond.attribution ? [fond.attribution] : [])];
    (attribution as unknown as { _updateAttributions(): void })._updateAttributions();
  }

  /**
   * Libellés d'une couche vectorielle (D-GD-24) : nom de l'entité, puis sa valeur abrégée (couche thématique) ; points
   * d'étiquette lus seulement une fois les libellés demandés. Les collisions sont résolues par MapLibre (un libellé qui
   * en chevauche un autre n'est pas tracé) ; une valeur absente n'affiche que le nom.
   */
  function etiqueter(id: string, k: Composition["couches"][number], filtreCode: ExpressionSpecification | null, d: DonneesAffichage) {
    const couche = `${id}-etiquettes`;
    if (!k.etiquettes) { if (carte.getLayer(couche)) carte.setLayoutProperty(couche, "visibility", "none"); return; }
    if (!carte.getSource(`${id}-etq`)) carte.addSource(`${id}-etq`, { type: "vector", tiles: [adresseEtiquettes(k.coucheId)], minzoom: 0, maxzoom: 14 });
    if (!carte.getLayer(couche)) {
      carte.addLayer({
        id: couche, type: "symbol", source: `${id}-etq`, "source-layer": "etiquettes",
        layout: { "text-font": [POLICE_ETIQUETTES], "text-size": 12, "text-max-width": 9, "text-line-height": 1.15, "text-padding": 2, "text-allow-overlap": false },
        paint: { "text-color": "#1d2b30", "text-halo-color": "#ffffff", "text-halo-width": 1.4, "text-halo-blur": 0.3 },
      });
    }
    const branches = [...(d.etiquettes.get(k.coucheId) ?? new Map<string, string>())].flat();
    const valeur = ["match", ["get", "code"], ...branches, ""] as unknown as ExpressionSpecification;
    carte.setLayoutProperty(couche, "text-field", branches.length
      ? (["format", ["get", "nom"], {}, ["case", ["==", valeur, ""], "", ["concat", "\n", valeur]], { "font-scale": 0.92 }] as unknown as ExpressionSpecification)
      : ["get", "nom"]);
    carte.setFilter(couche, filtreCode);
    carte.setLayoutProperty(couche, "visibility", k.visible ? "visible" : "none");
  }

  // Mini-carte de situation (lot G) : une seconde carte, sans interaction propre, recalée sur la vue principale.
  let mini: { carte: CarteMapLibre; conteneur: HTMLElement; coucheId: string | null } | null = null;
  function synchroniserMini() {
    if (!mini) return;
    const b = carte.getBounds();
    const anneau: [number, number][] = [[b.getWest(), b.getSouth()], [b.getEast(), b.getSouth()], [b.getEast(), b.getNorth()], [b.getWest(), b.getNorth()], [b.getWest(), b.getSouth()]];
    (mini.carte.getSource("gd-emprise") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [anneau] } }] });
    mini.carte.jumpTo({ center: carte.getCenter(), zoom: Math.max(1, Math.min(carte.getZoom() - 4, 8)) });
  }
  carte.on("move", synchroniserMini);

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
    zoomer(delta) { if (delta > 0) carte.zoomIn({ duration: 250 }); else carte.zoomOut({ duration: 250 }); },
    orienterNord() { carte.easeTo({ bearing: 0, pitch: 0, duration: 400 }); },
    redimensionner() { carte.resize(); },
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
    async attendreChargement(delaiMs) {
      // Carte principale, puis mini-carte de situation si elle est affichée (elle charge ses tuiles à part) : une image
      // n'est produite que si les deux sont complètes, jamais avec un encart vide.
      const attendre = (m: CarteMapLibre) => new Promise<boolean>((resoudre) => {
        if (m.loaded() && m.areTilesLoaded()) return resoudre(true);
        const fin = setTimeout(() => resoudre(m.loaded() && m.areTilesLoaded()), delaiMs);
        m.once("idle", () => { clearTimeout(fin); resoudre(m.areTilesLoaded()); });
        m.triggerRepaint();
      });
      if (!(await attendre(carte))) return false;
      if (!mini) return true;
      synchroniserMini();
      return attendre(mini.carte);
    },
    canevas: () => carte.getCanvas(),
    metresParPixel() {
      const lat = carte.getCenter().lat;
      return (40_075_016.7 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** carte.getZoom());
    },
    afficherMiniCarte(conteneurMini, coucheId) {
      if (mini && (mini.conteneur !== conteneurMini || mini.coucheId !== coucheId)) { mini.carte.remove(); mini = null; }
      if (!conteneurMini || mini) return;
      const m = new CarteMapLibre({
        container: conteneurMini,
        style: {
          version: 8,
          sources: {
            "gd-emprise": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
            ...(coucheId ? { "gd-mini-couche": { type: "vector", tiles: [adresseTuiles(coucheId)], minzoom: 0, maxzoom: 14 } } : {}),
          },
          layers: [
            { id: "gd-mini-fond", type: "background", paint: { "background-color": FOND_NEUTRE } },
            ...(coucheId ? [{ id: "gd-mini-contours", type: "line" as const, source: "gd-mini-couche", "source-layer": "objets", paint: { "line-color": "#29434a", "line-width": 0.7 } }] : []),
            { id: "gd-mini-emprise", type: "fill", source: "gd-emprise", paint: { "fill-color": "#c77b35", "fill-opacity": 0.25 } },
            { id: "gd-mini-emprise-bord", type: "line", source: "gd-emprise", paint: { "line-color": "#b0361b", "line-width": 2 } },
          ],
        },
        interactive: false,
        attributionControl: false,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      });
      // Clic sur la mini-carte : la carte principale se recentre sur le point touché (même zoom).
      m.getCanvas().style.cursor = "pointer";
      m.on("click", (e) => carte.easeTo({ center: e.lngLat, duration: 400 }));
      mini = { carte: m, conteneur: conteneurMini, coucheId };
      m.on("load", synchroniserMini);
    },
    canevasMiniCarte: () => mini?.carte.getCanvas() ?? null,
    detruire: () => { mini?.carte.remove(); carte.remove(); },
  };
}
