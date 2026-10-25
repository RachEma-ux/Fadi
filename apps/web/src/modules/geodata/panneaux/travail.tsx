/**
 * Panneaux de travail de GeoData : Mes cartes (ouvrir, nommer, dupliquer, classer, archiver), Études (mesures indicatives,
 * zones et annotations, analyse « superficie et unités intersectées »), Import GeoJSON personnel et Export. Chaque action
 * visible agit réellement sur le serveur ; une action impossible dit pourquoi (aucune réussite simulée).
 */
import { useEffect, useRef, useState } from "react";
import { aireM2, formatNombre, libelleDistance, libelleSurface, longueurM, METHODE_MESURE_INDICATIVE, pointGeographique, type RapportImport } from "@parcours/geodata-model";
import { api, ErreurGeoData, type AnalyseRecue, type CarteRecue, type CollectionRecue, type CoucheRecue, type ExportRecu, type ImportRecu, type ResumeCarte, type ZoneRecue } from "../client";
import { nouvelIdDemande } from "../composition-ops";
import type { OutilCarte } from "../carte/moteur";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function MesCartes(p: { carte: CarteRecue | null; nouvelle: boolean; onOuvrir(id: string): void; onNouvelle(): void; onEnregistrerSous(nom: string, collectionId: string | null): Promise<void>; onCarteModifiee(c: CarteRecue): void }) {
  const [cartes, setCartes] = useState<ResumeCarte[] | null>(null);
  const [archives, setArchives] = useState(false);
  const [collections, setCollections] = useState<CollectionRecue[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [collection, setCollection] = useState("");
  const [nouvelleCollection, setNouvelleCollection] = useState("");
  const [renommer, setRenommer] = useState<string | null>(null);
  const champNom = useRef<HTMLInputElement>(null);
  const charger = () => {
    setErreur(null);
    Promise.all([api.cartes(archives ? "archivee" : "active"), api.collections()]).then(([c, k]) => { setCartes(c.cartes); setCollections(k.collections.filter((x) => x.etat === "active")); }).catch((e) => setErreur(message(e)));
  };
  useEffect(charger, [archives, p.carte?.revision, p.carte?.id]);
  useEffect(() => { if (p.nouvelle) champNom.current?.focus(); }, [p.nouvelle]);
  const agir = async (f: () => Promise<unknown>) => { try { setErreur(null); await f(); charger(); } catch (e) { setErreur(message(e)); } };
  return (
    <div data-gd-mes-cartes>
      {!p.carte && (
        <form className="gd-formulaire" onSubmit={(e) => { e.preventDefault(); if (nom.trim()) void agir(() => p.onEnregistrerSous(nom.trim(), collection || null)); }}>
          <h3>Enregistrer cette carte</h3>
          <label className="gd-champ">Nom de la carte<input ref={champNom} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} required data-gd-nom-carte /></label>
          <label className="gd-champ">Collection<select value={collection} onChange={(e) => setCollection(e.target.value)}><option value="">Aucune</option>{collections.map((c) => <option key={c.id} value={c.id} translate="no">{c.nom}</option>)}</select></label>
          <button type="submit" data-gd-enregistrer-sous>Enregistrer la carte</button>
        </form>
      )}
      {p.carte && (
        <section className="gd-formulaire">
          <h3 translate="no">{p.carte.nom}</h3>
          <p className="gd-discret">{`Révision ${p.carte.revision} · modifiée le ${new Date(p.carte.modifieLe).toLocaleString()}`}</p>
          {renommer === null ? <button type="button" onClick={() => setRenommer(p.carte!.nom)}>Renommer</button> : (
            <form onSubmit={(e) => { e.preventDefault(); void agir(async () => { p.onCarteModifiee(await api.reviserCarte(p.carte!.id, { revisionAttendue: p.carte!.revision, nom: renommer })); setRenommer(null); }); }}>
              <label className="gd-champ">Nouveau nom<input value={renommer} onChange={(e) => setRenommer(e.target.value)} maxLength={120} required /></label>
              <button type="submit">Valider le nom</button><button type="button" onClick={() => setRenommer(null)}>Annuler</button>
            </form>
          )}
          <label className="gd-champ">Collection<select value={p.carte.collectionId ?? ""} onChange={(e) => void agir(async () => p.onCarteModifiee(await api.reviserCarte(p.carte!.id, { revisionAttendue: p.carte!.revision, collectionId: e.target.value || null })))}><option value="">Aucune</option>{collections.map((c) => <option key={c.id} value={c.id} translate="no">{c.nom}</option>)}</select></label>
          <div className="gd-actions">
            <button type="button" onClick={() => void agir(async () => p.onOuvrir((await api.dupliquerCarte(p.carte!.id)).id))}>Dupliquer</button>
            <button type="button" onClick={() => void agir(async () => { await api.archiverCarte(p.carte!.id); p.onNouvelle(); })}>Archiver</button>
            <button type="button" onClick={p.onNouvelle}>Nouvelle carte</button>
          </div>
        </section>
      )}
      <form className="gd-formulaire" onSubmit={(e) => { e.preventDefault(); if (nouvelleCollection.trim()) void agir(async () => { await api.creerCollection(nouvelleCollection.trim()); setNouvelleCollection(""); }); }}>
        <label className="gd-champ">Nouvelle collection<input value={nouvelleCollection} onChange={(e) => setNouvelleCollection(e.target.value)} maxLength={120} /></label>
        <button type="submit">Créer la collection</button>
      </form>
      {erreur && <p role="alert" className="gd-alerte">{erreur}</p>}
      <div className="gd-ligne-titre"><h3>{archives ? "Cartes archivées" : "Mes cartes"}</h3><button type="button" onClick={() => setArchives(!archives)}>{archives ? "Voir les cartes actives" : "Voir les archives"}</button></div>
      {!cartes && !erreur && <p role="status">Chargement des cartes…</p>}
      {cartes?.length === 0 && <p className="gd-etat">{archives ? "Aucune carte archivée." : "Aucune carte enregistrée pour l'instant."}</p>}
      <ul className="gd-liste">
        {cartes?.map((c) => (
          <li key={c.id} className="gd-carte-couche" data-gd-carte={c.id}>
            <strong translate="no">{c.nom}</strong>
            <p className="gd-discret">{`${c.couches} couche(s) · révision ${c.revision}${c.collectionId ? ` · ${collections.find((k) => k.id === c.collectionId)?.nom ?? ""}` : ""}`}</p>
            <div className="gd-actions">
              {!archives && <button type="button" onClick={() => p.onOuvrir(c.id)} aria-current={p.carte?.id === c.id ? "true" : undefined} data-gd-ouvrir-carte={c.id}>Ouvrir</button>}
              {archives && <button type="button" onClick={() => void agir(() => api.archiverCarte(c.id, true))}>Restaurer</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface TraceEnCours { outil: OutilCarte; sommets: readonly [number, number][] }

/** Mesure indicative d'un tracé (concept § 5.1), méthode affichée. */
export function mesureDuTrace(t: TraceEnCours | null): string | null {
  if (!t || t.sommets.length < 2) return null;
  const pts = t.sommets.map(([lon, lat]) => pointGeographique(lon, lat)!).filter(Boolean);
  if (t.outil === "distance") return `Distance : ${libelleDistance(longueurM(pts))}`;
  if ((t.outil === "surface" || t.outil === "zone") && t.sommets.length >= 3) return `Surface : ${libelleSurface(aireM2([[...t.sommets, t.sommets[0]!]]))} · périmètre ${libelleDistance(longueurM([...pts, pts[0]!]))}`;
  return null;
}

export function Etudes(p: {
  outil: OutilCarte; trace: TraceEnCours | null; tracePret: { outil: OutilCarte; sommets: readonly [number, number][] } | null; couchesPolygones: CoucheRecue[];
  onOutil(o: OutilCarte): void; onTerminer(): void; onAnnulerTrace(): void; onZonesChangees(): void; onCentrer(geometrie: { type: string; coordinates: unknown }): void; zones: ZoneRecue[];
}) {
  const [analyses, setAnalyses] = useState<AnalyseRecue[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [texte, setTexte] = useState("");
  const [bbox, setBbox] = useState({ lonMin: "", latMin: "", lonMax: "", latMax: "" });
  const [couche, setCouche] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const chargerAnalyses = () => { api.analyses().then((a) => setAnalyses(a.analyses)).catch((e) => setErreur(message(e))); };
  useEffect(chargerAnalyses, []);
  useEffect(() => { if (!couche && p.couchesPolygones[0]) setCouche(p.couchesPolygones[0].id); }, [p.couchesPolygones, couche]);
  const mesure = mesureDuTrace(p.trace);
  const enregistrer = async (nature: "zone" | "annotation", geometrie: unknown, provenance: "dessin" | "coordonnees") => {
    try {
      setErreur(null);
      await api.creerZone({ nature, nom: nom.trim() || (nature === "zone" ? "Zone d'étude" : "Annotation"), texte, geometrie, provenance });
      setNom(""); setTexte("");
      p.onAnnulerTrace();
      p.onZonesChangees();
    } catch (e) {
      const diag = e instanceof ErreurGeoData && Array.isArray(e.corps["diagnostics"]) ? ` ${(e.corps["diagnostics"] as { message: string }[]).map((d) => d.message).join(" ")}` : "";
      setErreur(`${message(e)}${diag}`);
    }
  };
  const OUTILS: [OutilCarte, string][] = [["navigation", "Naviguer et sélectionner"], ["distance", "Mesurer une distance"], ["surface", "Mesurer une surface"], ["zone", "Dessiner une zone d'étude"], ["annotation", "Poser une annotation"]];
  return (
    <div data-gd-etudes>
      <fieldset className="gd-outils"><legend>Outil de la carte</legend>
        {OUTILS.map(([o, l]) => <label key={o} className="gd-case"><input type="radio" name="gd-outil" checked={p.outil === o} onChange={() => p.onOutil(o)} data-gd-outil={o} />{l}</label>)}
      </fieldset>
      {p.outil !== "navigation" && <p className="gd-discret">{p.outil === "annotation" ? "Cliquez sur la carte pour poser l'annotation." : "Cliquez pour ajouter des sommets ; double-clic ou « Terminer le tracé » pour finir ; Échap annule."}</p>}
      {p.outil !== "navigation" && p.outil !== "annotation" && <div className="gd-actions"><button type="button" onClick={p.onTerminer}>Terminer le tracé</button><button type="button" onClick={p.onAnnulerTrace}>Annuler le tracé</button></div>}
      {mesure && <p role="status" className="gd-mesure" data-gd-mesure>{mesure}<br /><span className="gd-discret">{METHODE_MESURE_INDICATIVE}</span></p>}
      {p.tracePret && (p.tracePret.outil === "zone" || p.tracePret.outil === "annotation") && (
        <form className="gd-formulaire" onSubmit={(e) => {
          e.preventDefault();
          const s = p.tracePret!.sommets;
          void enregistrer(p.tracePret!.outil === "zone" ? "zone" : "annotation", p.tracePret!.outil === "zone" ? { type: "Polygon", coordinates: [[...s, s[0]]] } : { type: "Point", coordinates: s[0] }, "dessin");
        }}>
          <h3>{p.tracePret.outil === "zone" ? "Enregistrer la zone dessinée" : "Enregistrer l'annotation"}</h3>
          <label className="gd-champ">Nom<input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} data-gd-nom-zone /></label>
          <label className="gd-champ">Texte<textarea value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={2000} /></label>
          <button type="submit" data-gd-enregistrer-zone>Enregistrer</button><button type="button" onClick={p.onAnnulerTrace}>Abandonner</button>
        </form>
      )}
      <details className="gd-formulaire">
        <summary>Zone par coordonnées (sans souris)</summary>
        <form onSubmit={(e) => {
          e.preventDefault();
          const [a, b, c, d] = [bbox.lonMin, bbox.latMin, bbox.lonMax, bbox.latMax].map((x) => Number(x.replace(",", ".")));
          if (![a, b, c, d].every((x) => Number.isFinite(x)) || a! >= c! || b! >= d! || !pointGeographique(a!, b!) || !pointGeographique(c!, d!)) return setErreur("Longitudes −180 à 180 et latitudes −90 à 90, minimum inférieur au maximum.");
          void enregistrer("zone", { type: "Polygon", coordinates: [[[a, b], [c, b], [c, d], [a, d], [a, b]]] }, "coordonnees");
        }}>
          <p className="gd-discret">WGS 84, en degrés décimaux.</p>
          {(["lonMin", "latMin", "lonMax", "latMax"] as const).map((k) => <label key={k} className="gd-champ">{({ lonMin: "Longitude minimale", latMin: "Latitude minimale", lonMax: "Longitude maximale", latMax: "Latitude maximale" })[k]}<input inputMode="decimal" value={bbox[k]} onChange={(e) => setBbox({ ...bbox, [k]: e.target.value })} required /></label>)}
          <label className="gd-champ">Nom<input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} /></label>
          <button type="submit">Créer la zone</button>
        </form>
      </details>
      {erreur && <p role="alert" className="gd-alerte">{erreur}</p>}
      <h3>Zones et annotations</h3>
      {p.zones.length === 0 && <p className="gd-etat">Aucune zone ni annotation.</p>}
      <ul className="gd-liste">
        {p.zones.map((z) => (
          <li key={z.id} className="gd-carte-couche" data-gd-zone={z.id}>
            <strong translate="no">{z.nom}</strong>
            <p className="gd-discret">{`${z.nature === "zone" ? "Zone d'étude" : "Annotation"} · ${z.provenance === "dessin" ? "dessinée" : z.provenance === "coordonnees" ? "par coordonnées" : "importée"} · révision ${z.revision}${z.aireM2 ? ` · ${libelleSurface(z.aireM2)}` : ""}`}</p>
            {z.texte && <p translate="no">{z.texte}</p>}
            <div className="gd-actions">
              <button type="button" onClick={() => p.onCentrer(z.geometrie)}>Centrer</button>
              {z.nature === "zone" && p.couchesPolygones.length > 0 && <button type="button" disabled={enCours === z.id} onClick={async () => {
                setEnCours(z.id); setErreur(null);
                try { await api.analyser(z.id, couche); chargerAnalyses(); } catch (e) { setErreur(message(e)); } finally { setEnCours(null); }
              }} data-gd-analyser={z.id}>{enCours === z.id ? "Analyse en cours…" : "Analyser"}</button>}
              <button type="button" onClick={async () => { try { await api.archiverZone(z.id); p.onZonesChangees(); } catch (e) { setErreur(message(e)); } }}>Archiver</button>
            </div>
          </li>
        ))}
      </ul>
      {p.couchesPolygones.length > 0 && <label className="gd-champ">Couche analysée<select value={couche} onChange={(e) => setCouche(e.target.value)}>{p.couchesPolygones.map((c) => <option key={c.id} value={c.id} translate="no">{c.titre}</option>)}</select></label>}
      {p.couchesPolygones.length === 0 && <p className="gd-discret">Ajoutez une couche de polygones à la carte pour analyser une zone.</p>}
      <h3>Analyses</h3>
      {analyses.length === 0 && <p className="gd-etat">Aucune analyse.</p>}
      {analyses.map((a) => <Analyse key={a.id} a={a} zones={p.zones} onRecalculer={async () => { try { await api.analyser(a.zoneId, a.coucheId); chargerAnalyses(); } catch (e) { setErreur(message(e)); } }} />)}
    </div>
  );
}

function Analyse({ a, zones, onRecalculer }: { a: AnalyseRecue; zones: ZoneRecue[]; onRecalculer(): void }) {
  const r = a.resultat;
  const pct = (x: number | null) => (x === null ? "—" : `${formatNombre(x * 100, 1)} %`);
  return (
    <article className="gd-analyse" data-gd-analyse={a.id} data-a-recalculer={a.aRecalculer ? "" : undefined}>
      <h4 translate="no">{`${zones.find((z) => z.id === a.zoneId)?.nom ?? "Zone archivée"} × ${r.couche.titre}`}</h4>
      <p className="gd-discret">{`Calculée le ${new Date(a.creeLe).toLocaleString()} · méthode ${a.methode} v${a.versionMethode} · zone révision ${a.zoneRevision}`}</p>
      <p translate="no" className="gd-discret">{`Version : ${r.version.libelle}`}</p>
      {a.aRecalculer && <div role="status" className="gd-alerte"><p>À recalculer :</p><ul>{a.motifsRecalcul.map((m) => <li key={m}>{m}</li>)}</ul><button type="button" onClick={onRecalculer}>Recalculer (nouveau résultat)</button></div>}
      <p>{`Superficie de la zone : ${libelleSurface(r.aireZoneM2)} · ${r.unitesIntersectees} unité(s) intersectée(s)`}</p>
      {r.aireHorsCouvertureM2 > 1 && <p className="gd-alerte">{`Hors de la couverture de la couche : ${libelleSurface(r.aireHorsCouvertureM2)}`}</p>}
      {r.unites.length > 0 && <div className="gd-defilement"><table><thead><tr><th scope="col">Unité</th><th scope="col">Intersection</th><th scope="col">Part de la zone</th><th scope="col">Part de l'unité</th></tr></thead>
        <tbody>{r.unites.slice(0, 100).map((u) => <tr key={u.code}><td translate="no">{u.nom ?? u.code}</td><td>{libelleSurface(u.aireIntersectionM2)}</td><td>{pct(u.partDeLaZone)}</td><td>{pct(u.partDeLUnite)}</td></tr>)}</tbody></table></div>}
      <p className="gd-discret">{r.limites}</p>
    </article>
  );
}

export function Import(p: { onCoucheImportee(coucheId: string): void }) {
  const [imports, setImports] = useState<ImportRecu[]>([]);
  const [courant, setCourant] = useState<ImportRecu | null>(null);
  const [titre, setTitre] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const charger = () => { api.imports().then((r) => setImports(r.imports)).catch((e) => setErreur(message(e))); };
  useEffect(charger, []);
  const deposer = async (fichier: File) => {
    setErreur(null); setCourant(null);
    if (fichier.size > 5 * 1024 * 1024) return setErreur(`Fichier de ${formatNombre(fichier.size / 1048576, 1)} Mo : 5 Mo au plus.`);
    setEnvoi(true);
    try {
      const r = await api.deposer(nouvelIdDemande(), fichier.name, await fichier.text());
      setCourant(r);
      setTitre(fichier.name.replace(/\.(geo)?json$/i, ""));
      charger();
    } catch (e) { setErreur(message(e)); } finally { setEnvoi(false); }
  };
  return (
    <div data-gd-import>
      <p>Import personnel : fichier GeoJSON en WGS 84 (longitude puis latitude), 5 Mo, 5 000 objets et 200 000 sommets au plus. Un fichier projeté ou dans un autre système est refusé, jamais converti à l'aveugle.</p>
      <label className="gd-champ">Fichier GeoJSON<input type="file" accept=".geojson,.json,application/geo+json,application/json" disabled={envoi} onChange={(e) => { const f = e.target.files?.[0]; if (f) void deposer(f); e.target.value = ""; }} data-gd-fichier /></label>
      {envoi && <p role="status">Réception et validation du fichier…</p>}
      {erreur && <p role="alert" className="gd-alerte">{erreur}</p>}
      {courant && <RapportVue imp={courant} />}
      {courant?.etat === "valide" && (
        <form className="gd-formulaire" onSubmit={async (e) => {
          e.preventDefault();
          try { const r = await api.confirmerImport(courant.id, titre.trim()); setCourant(r); charger(); if (r.coucheId) p.onCoucheImportee(r.coucheId); } catch (er) { setErreur(message(er)); }
        }}>
          <label className="gd-champ">Titre de la couche<input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} required data-gd-titre-import /></label>
          <button type="submit" data-gd-confirmer-import>Confirmer l'import (couche privée)</button>
          <button type="button" onClick={async () => { try { setCourant(await api.annulerImport(courant.id)); charger(); } catch (er) { setErreur(message(er)); } }}>Annuler l'import</button>
        </form>
      )}
      {courant?.etat === "confirme" && <p role="status" className="gd-succes">Couche privée créée et ajoutée à la carte.</p>}
      <h3>Imports récents</h3>
      {imports.length === 0 && <p className="gd-etat">Aucun import.</p>}
      <ul className="gd-liste">{imports.map((i) => <li key={i.id} className="gd-carte-couche"><span translate="no">{i.nomFichier}</span>{` — ${({ valide: "validé, à confirmer", rejete: "rejeté", confirme: "confirmé", annule: "annulé", expire: "expiré" })[i.etat]}`}</li>)}</ul>
    </div>
  );
}

function RapportVue({ imp }: { imp: ImportRecu }) {
  const r: RapportImport = imp.rapport;
  return (
    <section className="gd-formulaire" data-gd-rapport={imp.etat}>
      <h3>{imp.etat === "rejete" ? "Fichier refusé : rien n'a été publié" : "Aperçu du fichier"}</h3>
      <p>{`${r.objets} objet(s) · ${r.sommets} sommet(s)`}</p>
      {r.emprise && <p className="gd-discret">{`Emprise : lon ${r.emprise[0]} à ${r.emprise[2]} · lat ${r.emprise[1]} à ${r.emprise[3]}`}</p>}
      {r.proprietes.length > 0 && <p className="gd-discret" translate="no">{r.proprietes.join(", ")}</p>}
      {r.diagnostics.length > 0 && <ul>{r.diagnostics.slice(0, 20).map((d, i) => <li key={i} className={d.niveau === "erreur" ? "gd-alerte" : "gd-discret"}>{`${d.niveau === "erreur" ? "Erreur" : "Avertissement"}${d.objet !== undefined ? ` (objet ${d.objet + 1})` : ""} : ${d.message}`}</li>)}</ul>}
    </section>
  );
}

export function Export(p: { carte: CarteRecue | null; enregistree: boolean; analyses: string[]; onExporter(analyseIds: string[]): Promise<ExportRecu> }) {
  const [resultat, setResultat] = useState<ExportRecu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [inclure, setInclure] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  if (!p.carte) return <p className="gd-etat">Enregistrez d'abord la carte : l'export porte sur une composition enregistrée et figée.</p>;
  if (!p.enregistree) return <p className="gd-etat">Des modifications ne sont pas enregistrées : enregistrez-les pour exporter exactement ce que vous voyez.</p>;
  return (
    <div data-gd-export>
      <p>Image PNG de la carte (légende, échelle, attributions) et fiche de sources HTML. Les droits de chaque couche et du fond sont vérifiés par le serveur avant tout export.</p>
      {p.analyses.length > 0 && <label className="gd-case"><input type="checkbox" checked={inclure} onChange={(e) => setInclure(e.target.checked)} />Inclure la provenance des analyses dans la fiche</label>}
      <button type="button" disabled={envoi} onClick={async () => {
        setEnvoi(true); setErreur(null); setResultat(null);
        try { setResultat(await p.onExporter(inclure ? p.analyses : [])); } catch (e) { setErreur(message(e)); } finally { setEnvoi(false); }
      }} data-gd-exporter>{envoi ? "Export en cours…" : "Exporter la carte"}</button>
      {erreur && <p role="alert" className="gd-alerte">{erreur}</p>}
      {resultat?.etat === "refuse" && (
        <div role="alert" className="gd-alerte" data-gd-export-refuse>
          <p>Export refusé :</p>
          <ul>{resultat.refus.map((r, i) => <li key={i}><span translate="no">{r.titre}</span>{` — ${r.motif}`}</li>)}</ul>
          <p>Retirez ou masquez la couche concernée (nouvelle révision de la carte), puis relancez l'export.</p>
        </div>
      )}
      {resultat?.etat === "autorise" && (
        <div role="status" className="gd-succes" data-gd-export-ok>
          <p>{`Export autorisé (révision ${resultat.carteRevision}) : image téléchargée.`}</p>
          {resultat.fiche && <a href={resultat.fiche} download>Télécharger la fiche de sources</a>}
          <p className="gd-discret" translate="no">{resultat.attributions.join(" · ")}</p>
        </div>
      )}
    </div>
  );
}
