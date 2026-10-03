/**
 * Projection pure `modèle typé → entrée d'analyse` (cahier §5.6).
 *
 * Produit les domaines natifs consommés aujourd'hui (`levels`, `floorDesign`, `nativeParcel`,
 * `buildingFootprint`, `nativeId`) dans la même forme, de sorte que `analyseModel` de `@parcours/domain-model`
 * et ses consommateurs changent seulement leur source (lot 4). Sans perte pour un modèle issu de
 * `importerP118` : paramètres canoniques + propriétés `import.*` + propriétés techniques `importeur.*`
 * restituent chaque champ source (seuls l'ordre des clés des objets JSON, `domains.ui` et
 * `floorDesign.levels[*].activeLayer`, états d'affichage, R10, ne sont pas restitués).
 *
 * Un objet créé par commande (sans propriétés `importeur.*`) est projeté dans la forme native minimale
 * (rang après les objets importés, par identifiant) ; ce qui ne peut pas l'être est listé dans `omis`.
 */
import type { ModelAnalysisInput, NativeFloorDesignLike, NativeLevelLike, RoomLinkTargets } from "@parcours/domain-model";
import type { EtatModele } from "../contrats/etat.js";
import type { IdObjet, ObjetDe, ObjetModele } from "../ontologie/classes.js";
import { ID_NON_TYPE } from "../ontologie/definitions.js";
import { estNonEvaluee } from "../ontologie/provenance.js";
import type { ValeurJson } from "../ontologie/proprietes.js";
import type { PointTague, PolygoneAvecTrous, TrouPolygone } from "../ontologie/reperes.js";

type Json = Record<string, unknown>;
type P2 = [number, number];

/** Domaines natifs projetés (forme de `p118-native-model.json`, sans `ui`). */
export interface DomainesNatifs {
  readonly nativeId: string;
  /** Champs racine du jeu de données (`sourceVersion`, `exampleId`, `registry`…), hors `domains`. */
  readonly racine: Readonly<Json>;
  readonly domains: {
    readonly nativeParcel?: unknown;
    readonly levels: NativeLevelLike[];
    readonly buildingFootprint?: unknown;
    readonly floorDesign: NativeFloorDesignLike & { levels: Record<string, Json>; meta?: Json };
    readonly [autre: string]: unknown;
  };
  /** Objets du modèle non représentables dans la forme native (jamais en silence). */
  readonly omis: readonly { readonly objetId: IdObjet; readonly motif: string }[];
}

const estDict = (v: ValeurJson | undefined): v is { readonly [cle: string]: ValeurJson } => typeof v === "object" && v !== null && !Array.isArray(v);

const pt = (p: PointTague): P2 => (p.frame === "geographic" ? [p.lon, p.lat] : [p.x, p.y]);

function valeursImport(o: { readonly proprietes: readonly { readonly nom: string; readonly valeur: ValeurJson }[] }, prefixe = "import."): Json {
  const r: Json = {};
  for (const p of o.proprietes) if (p.nom.startsWith(prefixe) && !p.nom.slice(prefixe.length).includes(".")) r[p.nom.slice(prefixe.length)] = p.valeur;
  return r;
}

function technique(o: { readonly proprietes: readonly { readonly nom: string; readonly valeur: ValeurJson }[] }, nom: string): ValeurJson | undefined {
  return o.proprietes.find((p) => p.nom === `importeur.${nom}`)?.valeur;
}

function trousNatifs(trous: readonly TrouPolygone[], meta: ValeurJson | undefined): unknown[] {
  return trous.map((t, i) => {
    const pts = t.polygone.map(pt);
    const m = Array.isArray(meta) ? meta[i] : undefined;
    if (m === null) return pts;
    if (m !== undefined && typeof m === "object" && !Array.isArray(m)) return { ...m, poly: pts };
    return t.id !== undefined || t.source !== undefined ? { ...(t.id !== undefined ? { id: t.id } : {}), kind: "poly", poly: pts, ...(t.source !== undefined ? { source: t.source } : {}) } : pts;
  });
}

/** Insère les éléments bruts (non convertis) à leur rang source. */
function fusionner(entrees: { rang: number; cle: string; valeur: unknown }[]): unknown[] {
  return entrees.sort((a, b) => a.rang - b.rang || (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0)).map((e) => e.valeur);
}

export function projeterDomainesNatifs(modele: EtatModele): DomainesNatifs {
  const projet = { proprietes: modele.proprietesProjet };
  const prefixeV = technique(projet, "prefixe");
  const prefixe = typeof prefixeV === "string" ? prefixeV : `${modele.projetId}_`;
  const sid = (id: IdObjet): string => (prefixe && id.startsWith(prefixe) ? id.slice(prefixe.length) : id);
  const omis: { objetId: IdObjet; motif: string }[] = [];
  const objets = Object.values(modele.objets).filter((o) => !modele.supprimes.includes(o.id));
  const parClasse = <C extends ObjetModele["classe"]>(c: C) => objets.filter((o): o is Extract<ObjetModele, { classe: C }> => o.classe === c);
  const rangDe = (o: ObjetModele): number => {
    const r = technique(o, "rang");
    return typeof r === "number" ? r : Number.POSITIVE_INFINITY;
  };
  const nomCalque = (o: ObjetModele): Json => {
    if (o.calqueId === undefined) return {};
    const c = modele.objets[o.calqueId];
    return c && c.classe === "calque" ? { layer: c.params.nom } : {};
  };
  const absents = (o: ObjetModele): string[] => {
    const a = technique(o, "absents");
    return Array.isArray(a) ? (a.filter((x) => typeof x === "string") as string[]) : [];
  };

  // --- Niveaux ---------------------------------------------------------------
  const niveaux = parClasse("niveau").sort((a, b) => a.params.ordre - b.params.ordre || (a.id < b.id ? -1 : 1));
  const levels: NativeLevelLike[] = [];
  const floorLevels: Record<string, Json> = {};
  const lidDe = new Map<IdObjet, string>();
  for (const n of niveaux) lidDe.set(n.id, sid(n.id));

  const calques = parClasse("calque").sort((a, b) => a.params.ordre - b.params.ordre);

  for (const n of niveaux) {
    const lid = sid(n.id);
    const base = { id: lid, name: n.params.nom, elevation: n.params.elevation.value, height: n.params.hauteur.value };
    levels.push({ ...base, ...valeursImport(n, "import.levels.") });
    const dansNiveau = objets.filter((o) => o.niveauId === n.id);
    const familles: Record<string, { rang: number; cle: string; valeur: unknown }[]> = { walls: [], columns: [], doors: [], windows: [], stairs: [], paths: [], dims: [], texts: [], rooms: [] };
    const pousser = (f: string, o: ObjetModele, valeur: unknown, rang = rangDe(o)) => familles[f]!.push({ rang, cle: o.id, valeur });
    const chemin = (poly: PolygoneAvecTrous, meta: ValeurJson | undefined) => ({ points: poly.contour.map(pt), holes: trousNatifs(poly.trous, meta) });

    for (const o of dansNiveau) {
      const reste = valeursImport(o);
      const id = sid(o.id);
      switch (o.classe) {
        case "mur": {
          const p = o.params;
          pousser("walls", o, {
            id,
            kind: "wall",
            a: pt(p.axe.a),
            b: pt(p.axe.b),
            thickness: p.epaisseur.value,
            ...(p.hauteur ? { height: p.hauteur.value } : {}),
            ...(p.nom !== undefined ? { name: p.nom } : {}),
            ...nomCalque(o),
            ...(p.typeId !== ID_NON_TYPE ? { type: p.typeId } : {}),
            ...reste,
          });
          break;
        }
        case "porte":
        case "fenetre": {
          const p = o.params;
          pousser(o.classe === "porte" ? "doors" : "windows", o, {
            id,
            kind: o.classe === "porte" ? "door" : "window",
            hostWallId: sid(p.murHoteId),
            t: p.position.t,
            width: p.largeur.value,
            height: p.hauteur.value,
            sill: p.allege.value,
            ...nomCalque(o),
            ...(p.repere !== undefined ? { mark: p.repere } : {}),
            ...reste,
          });
          break;
        }
        case "poteau": {
          const p = o.params;
          pousser("columns", o, {
            id,
            kind: "column",
            ...(p.nom !== undefined ? { name: p.nom } : {}),
            p: pt(p.point),
            shapeId: p.formeId,
            width: p.largeur.value,
            depth: p.profondeur.value,
            height: p.hauteur.value,
            angle: p.angle.value,
            ...nomCalque(o),
            ...(p.statutConception !== undefined ? { designStatus: p.statutConception } : {}),
            ...reste,
          });
          break;
        }
        case "escalier": {
          const p = o.params;
          const nb = (v: unknown, cle: string) => (estNonEvaluee(v) ? {} : { [cle]: typeof v === "number" ? v : (v as { value: number }).value });
          pousser("stairs", o, {
            id,
            kind: "stairs",
            ...(p.nom !== undefined ? { name: p.nom } : {}),
            a: pt(p.axe.a),
            b: pt(p.axe.b),
            width: p.largeur.value,
            ...nb(p.hauteurAFranchir, "height"),
            baseOffset: p.decalageBase.value,
            ...nb(p.marches, "steps"),
            ...nb(p.contremarches, "risers"),
            ...nb(p.epaisseurPaillasse, "waistThickness"),
            ...nomCalque(o),
            ...(p.groupe !== undefined ? { stairGroup: p.groupe } : {}),
            ...(p.niveauDepartId !== undefined ? { sourceLevel: lidDe.get(p.niveauDepartId) ?? sid(p.niveauDepartId) } : {}),
            ...(p.niveauArriveeId !== undefined ? { targetLevel: lidDe.get(p.niveauArriveeId) ?? sid(p.niveauArriveeId) } : {}),
            // « non évaluée » (D-024) : drapeau absent de la source, il reste absent (sans perte).
            ...(estNonEvaluee(p.referencePlanSeulement) ? {} : { planReferenceOnly: p.referencePlanSeulement }),
            ...reste,
          });
          break;
        }
        case "dalle":
        case "toiture": {
          const p = o.params;
          pousser("paths", o, {
            id,
            kind: "path",
            ...chemin({ contour: p.contour, trous: p.trous }, technique(o, "trous")),
            height: p.epaisseur.value,
            baseOffset: p.decalageBase.value,
            role: o.classe === "dalle" ? "floor-slab" : "roof-slab",
            ...nomCalque(o),
            ...reste,
          });
          break;
        }
        case "zone":
        case "espace": {
          o.params.polygones.forEach((poly, i) =>
            pousser(
              "paths",
              o,
              { id: i === 0 ? id : `${id}-${i}`, kind: "path", name: o.params.nom, ...chemin(poly, i === 0 ? technique(o, "trous") : undefined), role: o.classe === "zone" ? "core-zone" : "room", ...nomCalque(o), ...reste },
              rangDe(o) + i * 1e-6,
            ),
          );
          if (o.params.polygones.length === 0) omis.push({ objetId: o.id, motif: `${o.classe} sans polygone : aucun tracé natif` });
          break;
        }
        case "reference-plan": {
          const p = o.params;
          if (!p.contour) {
            omis.push({ objetId: o.id, motif: "référence de plan sans contour : aucun tracé natif" });
            break;
          }
          pousser("paths", o, { id, kind: "path", ...(p.nom !== undefined ? { name: p.nom } : {}), ...chemin(p.contour, technique(o, "trous")), role: "plan-reference", ...nomCalque(o), ...reste });
          break;
        }
        case "solide": {
          const p = o.params;
          pousser("paths", o, {
            id,
            kind: "path",
            ...(p.nom !== undefined ? { name: p.nom } : {}),
            ...chemin({ contour: p.contour, trous: p.trous }, technique(o, "trous")),
            closed: p.ferme,
            height: p.hauteur.value,
            baseOffset: p.decalageBase.value,
            ...(p.epaisseur ? { thickness: p.epaisseur.value } : {}),
            role: p.role,
            ...nomCalque(o),
            ...(p.couleur !== undefined ? { color: p.couleur } : {}),
            ...reste,
          });
          break;
        }
        case "piece": {
          const p = o.params;
          const sansNom = absents(o).includes("name");
          pousser("rooms", o, {
            level: lid,
            ...(p.code !== undefined ? { code: p.code } : {}),
            ...(sansNom ? {} : { name: p.nom }),
            ...(p.aireDeclaree ? { area: p.aireDeclaree.value } : {}),
            ...(p.categorie !== undefined ? { category: p.categorie } : {}),
            ...(p.notes !== undefined ? { notes: p.notes } : {}),
            ...(p.polygonesSource ? { polygons: p.polygonesSource.map((q) => ({ points: q.contour.map(pt), holes: q.trous.map((t) => t.polygone.map(pt)) })) } : {}),
            ...(p.etiquette ? { label: pt(p.etiquette) } : {}),
            ...reste,
          });
          // Tracés `room` rattachés : champs source restitués, géométrie prise des polygones courants.
          const traces = technique(o, "traces");
          const liste = Array.isArray(traces) ? traces : [];
          p.polygones.forEach((poly, i) => {
            const t = liste[i];
            if (t && typeof t === "object" && !Array.isArray(t) && typeof t.rang === "number") {
              const champs = (t.champs ?? {}) as Json;
              familles.paths!.push({ rang: t.rang, cle: `${o.id}#${i}`, valeur: { ...champs, ...chemin(poly, t.trous) } });
            } else {
              familles.paths!.push({
                rang: Number.POSITIVE_INFINITY,
                cle: `${o.id}#${i}`,
                valeur: { id: `${sid(o.id)}-${i}`, kind: "path", name: p.code !== undefined ? `${p.code} · ${p.nom}` : p.nom, ...chemin(poly, undefined), role: "room" },
              });
            }
          });
          break;
        }
        case "cotation": {
          const p = o.params;
          pousser("dims", o, { id, kind: "dim", a: pt(p.a), b: pt(p.b), offset: p.decalage.value, ...nomCalque(o), ...reste });
          break;
        }
        case "texte": {
          const p = o.params;
          pousser("texts", o, { id, kind: "text", x: p.position.x, y: p.position.y, text: p.texte, ...nomCalque(o), ...reste });
          break;
        }
        default:
          omis.push({ objetId: o.id, motif: `classe « ${o.classe} » sans équivalent dans floorDesign (lot 3a et suivants)` });
      }
    }

    // Éléments inconvertibles conservés bruts sur le niveau.
    const bruts = technique(n, "nonConverti");
    if (Array.isArray(bruts)) {
      for (const b of bruts) {
        if (b && typeof b === "object" && !Array.isArray(b) && typeof b.famille === "string" && typeof b.rang === "number" && familles[b.famille]) {
          familles[b.famille]!.push({ rang: b.rang, cle: "", valeur: b.valeur });
        }
      }
    }

    const absentesV = technique(n, "absent.familles");
    const absentes = Array.isArray(absentesV) ? absentesV : [];
    const design: Json = {};
    const absentBase = (k: string) => technique(n, `absent.niveau.${k}`) === true;
    for (const [k, v] of Object.entries(base)) if (!absentBase(k)) design[k] = v;
    for (const f of Object.keys(familles)) if (!absentes.includes(f)) design[f] = fusionner(familles[f]!);
    if (technique(n, "absent.exteriorWallIds") !== true) {
      design.exteriorWallIds = (design.walls as Json[] | undefined ?? [])
        .filter((w) => {
          const mur = modele.objets[`${prefixe}${String(w.id)}`];
          return mur?.classe === "mur" && mur.params.exterieur && mur.niveauId === n.id;
        })
        .map((w) => w.id);
    }
    // Calques présents sur ce niveau, dans leur rang par niveau.
    const presents = calques.filter((c) => c.params.niveauxPresence === undefined || c.params.niveauxPresence.includes(n.id));
    if (technique(n, "absent.layers") !== true) {
      const rangCalque = (c: ObjetDe<"calque">) => {
        const r = technique(c, "rangParNiveau");
        const v = estDict(r) ? r[lid] : undefined;
        return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
      };
      const layers: Json = {};
      for (const c of [...presents].sort((a, b) => rangCalque(a) - rangCalque(b) || a.params.ordre - b.params.ordre)) {
        const div = technique(c, "definitionsNiveau");
        const propre = estDict(div) ? div[lid] : undefined;
        layers[c.params.nom] =
          propre !== undefined
            ? propre
            : { color: c.params.couleur, ...(c.params.remplissage !== undefined ? { fill: c.params.remplissage } : {}), visible: c.params.visible, locked: c.params.verrouille, ...valeursImport(c) };
      }
      design.layers = layers;
    }
    const autres = valeursImport(n);
    Object.assign(design, autres);
    for (const [k, v] of Object.entries(valeursImport(n, "import.floorDesign."))) design[k] = v;
    floorLevels[lid] = design;
  }

  // --- Objets de projet --------------------------------------------------
  const projetImport = (prefixeNom: string) => valeursImport(projet, prefixeNom);
  const brutProjet = (chemin: string): ValeurJson | undefined => technique(projet, `nonConverti.${chemin}`);

  const parcelles = parClasse("parcelle");
  let nativeParcel: unknown = brutProjet("domains.nativeParcel");
  const parcelle = parcelles[0];
  if (parcelle) {
    const p = parcelle.params;
    const r = valeursImport(parcelle);
    const setback = r.setback && typeof r.setback === "object" && !Array.isArray(r.setback) ? (r.setback as Json) : undefined;
    nativeParcel = {
      ...(p.numero !== undefined ? { parcelNumber: p.numero } : {}),
      ...(p.commune !== undefined ? { commune: p.commune } : {}),
      crs: p.crs,
      ...(p.crsSource !== undefined ? { sourceCrs: p.crsSource } : {}),
      vertices: p.sommetsCadastraux.map(pt),
      ...(p.identifiantsSommets ? { vertexIds: [...p.identifiantsSommets] } : {}),
      ...(p.aire ? { area: p.aire.value } : {}),
      ...(p.aireOfficielle ? { officialArea: p.aireOfficielle.value } : {}),
      ...(p.aireCorrigeeImprimee ? { correctedAreaPrinted: p.aireCorrigeeImprimee.value } : {}),
      ...r,
      ...(setback || p.recul || p.enveloppeRecul
        ? { setback: { ...(setback ?? {}), ...(p.recul ? { distance: p.recul.value } : {}), ...(p.enveloppeRecul ? { envelope: p.enveloppeRecul.map(pt) } : {}) } }
        : {}),
    };
  }
  for (const extra of parcelles.slice(1)) omis.push({ objetId: extra.id, motif: "parcelle supplémentaire : la forme native n'en porte qu'une" });

  let buildingFootprint: unknown = brutProjet("domains.buildingFootprint");
  const emprise = parClasse("emprise")[0];
  if (emprise) {
    const p = emprise.params;
    if (p.sommetsCadastraux) {
      buildingFootprint = { vertices: p.sommetsCadastraux.map(pt), ...(p.revisionArchitecture !== undefined ? { architectureRevision: p.revisionArchitecture } : {}), ...valeursImport(emprise) };
    } else omis.push({ objetId: emprise.id, motif: "emprise sans sommets cadastraux : forme native non produite" });
  }

  // meta : propriétés de projet, structure, hypothèses, sources.
  const meta: Json = { ...projetImport("import.meta.") };
  const structure = parClasse("structureDeclaree")[0];
  if (structure) {
    const p = structure.params;
    const charge = (u: string) => p.charges?.find((c) => c.unit === u)?.value;
    const kg = charge("kg/m²");
    const kn = charge("kN/m²");
    meta.structure = {
      ...(p.systeme !== undefined ? { system: p.systeme } : {}),
      ...(p.porteeRequise ? { requiredSpanM: p.porteeRequise.value } : {}),
      ...(kg !== undefined ? { loadKgM2: kg } : {}),
      ...(kn !== undefined ? { loadKNM2: kn } : {}),
      ...(p.natureCharge !== undefined ? { loadNature: p.natureCharge } : {}),
      ...(p.poidsPropreInclus !== undefined ? { selfWeightIncluded: p.poidsPropreInclus } : {}),
      ...(p.reglePoteaux !== undefined ? { columnRule: p.reglePoteaux } : {}),
      ...(p.statutEpaisseur !== undefined ? { thicknessStatus: p.statutEpaisseur } : {}),
      ...(p.statutConception !== undefined ? { designStatus: p.statutConception } : {}),
      ...valeursImport(structure),
    };
  } else if (brutProjet("floorDesign.meta.structure") !== undefined) meta.structure = brutProjet("floorDesign.meta.structure");

  const brutsListe = (prefixeChemin: string) =>
    modele.proprietesProjet
      .filter((p) => p.nom.startsWith(`importeur.nonConverti.${prefixeChemin}[`))
      .map((p) => ({ rang: Number(p.nom.slice(`importeur.nonConverti.${prefixeChemin}[`.length, -1)), cle: p.nom, valeur: p.valeur }));
  const hypotheses = parClasse("hypothese").filter((h) => technique(h, "origine") === undefined);
  const hypothesesBrutes = brutsListe("floorDesign.meta.assumptions");
  if (hypotheses.length || hypothesesBrutes.length) {
    meta.assumptions = fusionner([...hypotheses.map((h) => ({ rang: rangDe(h), cle: h.id, valeur: [h.params.code, h.params.theme ?? "", h.params.texte] })), ...hypothesesBrutes]);
  }
  const sources = parClasse("source");
  const sourcesBrutes = brutsListe("floorDesign.meta.sources");
  if (sources.length || sourcesBrutes.length) {
    meta.sources = fusionner([
      ...sources.map((s) => {
        const p = s.params;
        const r = valeursImport(s);
        const valeur =
          technique(s, "forme") === "triplet"
            ? [p.code, p.fichier ?? "", r.note ?? ""]
            : {
                id: p.code,
                ...(p.fichier !== undefined ? { file: p.fichier } : {}),
                ...(p.titre !== undefined ? { title: p.titre } : {}),
                ...(p.fourni !== undefined ? { provided: p.fourni } : {}),
                ...(p.usage !== undefined ? { use: p.usage } : {}),
                ...(p.inspectee !== undefined ? { inspected: p.inspectee } : {}),
                ...r,
              };
        return { rang: rangDe(s), cle: s.id, valeur };
      }),
      ...sourcesBrutes,
    ]);
  }

  const floorDesign = { levels: floorLevels, meta, ...projetImport("import.floorDesign.") } as DomainesNatifs["domains"]["floorDesign"];
  const racine = projetImport("import.racine.");
  const nativeId = typeof racine.nativeId === "string" ? racine.nativeId : modele.projetId;

  return {
    nativeId,
    racine,
    domains: {
      ...(nativeParcel !== undefined ? { nativeParcel } : {}),
      levels,
      ...(buildingFootprint !== undefined ? { buildingFootprint } : {}),
      floorDesign,
      ...projetImport("import.domains."),
    },
    omis,
  };
}

/**
 * Entrée de `analyseModel` (`@parcours/domain-model`), dans la forme que lui donne aujourd'hui
 * `apps/api/src/lib/model-context.ts` (`footprint` = sommets de l'emprise).
 */
export function projeterEntreeAnalyse(modele: EtatModele, programme: RoomLinkTargets | null = null): ModelAnalysisInput {
  const d = projeterDomainesNatifs(modele);
  const fp = d.domains.buildingFootprint as { vertices?: unknown } | undefined;
  return {
    nativeId: d.nativeId,
    levels: d.domains.levels,
    floor: d.domains.floorDesign,
    parcel: d.domains.nativeParcel ?? null,
    footprint: fp?.vertices ?? [],
    programme,
  };
}
