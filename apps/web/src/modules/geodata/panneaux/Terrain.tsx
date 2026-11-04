/**
 * Terrain haute résolution dans GeoData (plan v1.0, lot TER-05, Issue #381) : choix MNT / MNS, jeux publiés et leurs
 * couvertures, couches altitude / pente / ombrage avec opacité et légende (verrouillée sur la version ou adaptée à la vue,
 * portée toujours dite), courbes de niveau à une équidistance admise (jamais sous le seuil de précision, TER-D17), altitude
 * au point arrondie à la précision de la source, profil du terrain (raccords entre jeux, lacunes, interpolation) et
 * rubrique « Sources et précision ».
 *
 * Interface ≠ base de données : rien n'est codé ici ; tout vient des services `/geodata/api/terrain` (versions publiées
 * seulement). Une valeur absente est « non évaluée » ou « indisponible », jamais zéro. L'étiquette d'un jeu (« Données
 * suisses de démonstration », « test seulement »…) est toujours affichée avec lui.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PALETTE_ALTITUDE, PALETTE_PENTE, type ProduitTerrain } from "@parcours/geodata-model";
import { api, ErreurGeoData, type AltitudeRecue, type JeuTerrainRecu, type ProfilRecu, type SourceTerrainRecue } from "../client";
import type { AffichageTerrain, EtatTuilesTerrain, OutilCarte } from "../carte/moteur";
import {
  degrade, distanceFr, empriseGeometrie, equidistancesProposees, formaterAltitude, graduations, intersectionEmprises, jeuPourVue, lignesSource, longueurApprochee, messageCouverture, nombreFr, resumeSource,
  pasProfil, porteeLegende, traceProfil, type ModeLegende,
} from "../terrain-ops";

/**
 * Commandes du panneau Terrain (règle d'or) : chacune son icône et son raccourci, contrôlés par test avec ceux de la barre
 * d'outils et de la barre du bas ; Alt+O et Alt+U agissent sur toute la page (le panneau s'ouvre).
 */
export const ICONES_TERRAIN = {
  /** Panneau Terrain (bouton de la carte, à côté de « Données ») : deux sommets et leurs courbes. */
  terrain: "M2 19l6-10 4 6 3-4 7 8H2ZM6 13h4M14 13h3",
  /** Altitude au point : épingle sur une cote verticale. */
  altitude: "M12 21v-7M9 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M7 21h10M19 4v8M17 6l2-2 2 2",
  /** Profil du terrain : coupe sur deux axes. */
  profil: "M3 3v18h18M6 16l4-6 3 3 3-5 4 4",
} as const;
export const RACCOURCIS_TERRAIN = { terrain: "Alt+H", altitude: "Alt+O", profil: "Alt+U" } as const;

/**
 * Bouton « Terrain » de la carte, à côté de « Données » : la barre d'outils verticale garde ses seize outils (au-delà, elle
 * déborderait sur l'échelle et les sources sur un écran de 900 px de haut).
 */
export function BoutonTerrain({ ouvert, onBasculer }: { ouvert: boolean; onBasculer(): void }) {
  return (
    <button type="button" className="gd-bouton-donnees gd-bouton-terrain" aria-pressed={ouvert} onClick={onBasculer} aria-keyshortcuts={RACCOURCIS_TERRAIN.terrain}
      title={ouvert ? "Fermer le terrain (Alt+H)" : "Terrain : altitude, pente, ombrage, courbes (Alt+H)"} data-gd-terrain-bouton>
      <Picto d={ICONES_TERRAIN.terrain} />
      <span>Terrain</span>
    </button>
  );
}

type Emprise = readonly [number, number, number, number];
interface ReglageCouche { visible: boolean; opacite: number }
type Etat<T> = { etat: "chargement" } | { etat: "erreur"; message: string } | { etat: "ok"; recu: T };

const message = (e: unknown) => (e instanceof ErreurGeoData ? e.message : e instanceof Error ? e.message : String(e));

/** État du terrain, gardé par la page (il survit à la fermeture du panneau : les couches restent affichées). */
export function useTerrain(lireEmprise: () => Emprise | null) {
  const [produit, setProduit] = useState<ProduitTerrain>("MNT");
  const [jeux, setJeux] = useState<JeuTerrainRecu[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [altitude, setAltitude] = useState<ReglageCouche>({ visible: true, opacite: 0.75 });
  const [pente, setPente] = useState<ReglageCouche>({ visible: false, opacite: 0.7 });
  const [ombrage, setOmbrage] = useState<ReglageCouche>({ visible: false, opacite: 0.55 });
  // Légende adaptée à la vue par défaut (TER-09) : une plage de version n'a pas de sens pour un fond mondial.
  const [modeLegende, setModeLegende] = useState<ModeLegende>("adaptee");
  const [vueSuivie, setVueSuivie] = useState<{ vue: Emprise; zoom: number | null } | null>(null);
  const [pointDemande, setPointDemande] = useState<[number, number] | null>(null);
  const [plageVue, setPlageVue] = useState<{ versionId: string; plage: [number, number]; zone: string | null } | null>(null);
  const [adaptation, setAdaptation] = useState<{ etat: "chargement" } | { etat: "erreur"; message: string } | null>(null);
  const [courbes, setCourbes] = useState<{ visible: boolean; equidistance: number | null; opacite: number }>({ visible: false, equidistance: null, opacite: 0.9 });
  const [couvertures, setCouvertures] = useState(true);
  const [point, setPoint] = useState<Etat<AltitudeRecue> | null>(null);
  const [profil, setProfil] = useState<(Etat<ProfilRecu> & { ligne: [number, number][] }) | null>(null);
  const [survol, setSurvol] = useState<[number, number] | null>(null);
  const [tuiles, setTuiles] = useState<EtatTuilesTerrain>({ chargement: false, indisponibles: 0 });
  const actif = useRef(false);
  /** Jeu choisi à la main : il n'est plus remplacé quand la vue se déplace (TER-09) ; changer de produit l'oublie. */
  const choixManuel = useRef(false);
  /**
   * Générations des requêtes : un changement de produit invalide tout ce qui est en vol (catalogue, point, profil,
   * adaptation) ; une nouvelle requête d'un même type invalide la précédente. Une réponse périmée est ignorée : le MNT ne
   * s'affiche jamais sous le choix MNS, ni un ancien point ou une ancienne plage après une nouvelle demande.
   */
  const generation = useRef({ produit: 0, catalogue: 0, point: 0, profil: 0, adaptation: 0 });
  const jeton = (cle: "catalogue" | "point" | "profil" | "adaptation") => {
    const g = generation.current;
    g[cle] += 1;
    const attendu = { produit: g.produit, n: g[cle] };
    return () => generation.current.produit === attendu.produit && generation.current[cle] === attendu.n;
  };

  const charger = useCallback(async (p: ProduitTerrain) => {
    setErreur(null);
    const courant = jeton("catalogue");
    try {
      // Tous les jeux publiés du produit : la couverture disponible se lit avant de s'y rendre ; le plus fin d'abord.
      const r = await api.terrainJeux(p, null);
      if (!courant()) return;
      const tries = [...r.jeux].sort((a, b) => a.pas.metres - b.pas.metres || a.titre.localeCompare(b.titre));
      setJeux(tries);
      // Jeu de la vue (le plus fin qui en contient le centre : levé local, sinon fond mondial), sinon le plus fin publié.
      setVersionId((v) => {
        const garde = v && tries.some((j) => j.versionId === v) ? v : null;
        return (choixManuel.current && garde) || jeuPourVue(tries, lireEmprise(), garde) || (tries[0]?.versionId ?? null);
      });
    } catch (e) {
      if (!courant()) return;
      setJeux([]);
      setErreur(message(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ouvrir = useCallback(() => { if (!actif.current) { actif.current = true; void charger(produit); } }, [charger, produit]);
  const changerProduit = (p: ProduitTerrain) => {
    // Le MNT et le MNS ne se remplacent jamais : changer de produit efface les résultats de l'autre.
    generation.current.produit += 1;
    choixManuel.current = false;
    setProduit(p); setJeux(null); setVersionId(null); setPoint(null); setProfil(null); setSurvol(null); setPlageVue(null); setAdaptation(null); setModeLegende("adaptee");
    actif.current = true;
    void charger(p);
  };
  const jeu = jeux?.find((j) => j.versionId === versionId) ?? null;
  const equidistances = useMemo(() => (jeu ? equidistancesProposees(jeu.courbes.equidistanceMinimale, jeu.courbes.calculees) : []), [jeu]);
  // Version changée : l'équidistance revient à la plus fine admise pour elle ; la plage adaptée ne vaut que pour sa version.
  useEffect(() => { setCourbes((c) => ({ ...c, equidistance: c.equidistance !== null && equidistances.includes(c.equidistance) ? c.equidistance : (equidistances[0] ?? null) })); }, [equidistances]);

  /**
   * Légende adaptée : altitudes de la vue (intersection avec la couverture du jeu) ou d'une zone d'étude (son polygone réel),
   * lues par le service de statistiques de la version ; la portée est gardée avec la plage.
   */
  const adapter = async (zoneEtude: { nom: string; geometrie: { type: string; coordinates: unknown } } | null) => {
    if (!jeu) return;
    const courant = jeton("adaptation");
    // La plage d'une adaptation précédente ne survit jamais à une adaptation en échec : la légende revient réellement à la
    // plage de la version (couleurs et tuiles comprises). En suivant la vue, l'ancienne plage reste le temps de la lecture
    // (aucun clignotement des tuiles) ; une zone d'étude l'efface tout de suite.
    if (zoneEtude) setPlageVue(null);
    setModeLegende("adaptee");
    let polygone: { type: "Polygon"; coordinates: [number, number][][] } | null = null;
    if (zoneEtude) {
      if (zoneEtude.geometrie.type === "Polygon") polygone = { type: "Polygon", coordinates: zoneEtude.geometrie.coordinates as [number, number][][] };
      else { setAdaptation({ etat: "erreur", message: "La zone d'étude n'est pas un polygone : légende verrouillée sur la version." }); return; }
    } else {
      // Vue courante (TER-09) : plage lue sur un aperçu de la vue, couleur seulement (portée « vue courante »).
      const vue = lireEmprise();
      const couverture = empriseGeometrie(jeu.couverture);
      const zone = vue && couverture ? intersectionEmprises(vue, couverture) : null;
      if (!zone) { setPlageVue(null); setAdaptation({ etat: "erreur", message: "La vue ne recoupe pas la couverture de ce jeu." }); return; }
      setAdaptation({ etat: "chargement" });
      try {
        const r = await api.terrainPlage(jeu.versionId, zone);
        if (!courant()) return;
        if (!r.plage || !(r.plage[1] > r.plage[0])) { setPlageVue(null); setAdaptation({ etat: "erreur", message: "Altitudes non évaluées dans cette portée : légende verrouillée sur la version." }); return; }
        setPlageVue({ versionId: jeu.versionId, plage: r.plage, zone: null });
        setAdaptation(null);
      } catch (e) { if (courant()) { setPlageVue(null); setAdaptation({ etat: "erreur", message: message(e) }); } }
      return;
    }
    setAdaptation({ etat: "chargement" });
    try {
      const r = await api.terrainStatistiques(polygone!, jeu.produit, jeu.versionId);
      if (!courant()) return;
      if ("indisponible" in r) { setAdaptation({ etat: "erreur", message: r.motif }); return; }
      const { min, max } = r.statistiques;
      if (min === null || max === null || !(max > min)) { setAdaptation({ etat: "erreur", message: "Altitudes non évaluées dans cette portée : légende verrouillée sur la version." }); return; }
      setPlageVue({ versionId: jeu.versionId, plage: [min, max], zone: zoneEtude?.nom ?? null });
      setAdaptation(null);
    } catch (e) { if (courant()) setAdaptation({ etat: "erreur", message: message(e) }); }
  };
  const plageAdaptee = plageVue && plageVue.versionId === versionId ? plageVue : null;
  const portee = porteeLegende(modeLegende, jeu?.plageAltitude ?? null, plageAdaptee);

  const interroger = async (lon: number, lat: number) => {
    const courant = jeton("point");
    setPointDemande([lon, lat]);
    setPoint({ etat: "chargement" });
    try {
      // Fond mondial (TER-09) : une lecture distante plus longue que le délai répond « chargement » ; le cache se remplit
      // pendant ce temps, la demande est refaite (trois fois au plus), jamais remplacée par une valeur estimée.
      let recu = await api.terrainPoint(lon, lat, produit);
      for (let essai = 1; !recu.disponible && recu.etat === "chargement" && essai <= 3 && courant(); essai++) {
        await new Promise((r) => setTimeout(r, 2000 * essai));
        if (!courant()) return;
        recu = await api.terrainPoint(lon, lat, produit);
      }
      if (courant()) setPoint({ etat: "ok", recu });
    } catch (e) { if (courant()) setPoint({ etat: "erreur", message: message(e) }); }
  };
  const tracerProfil = async (ligne: [number, number][]) => {
    const courant = jeton("profil");
    setProfil({ etat: "chargement", ligne });
    setSurvol(null);
    const fins = (jeux ?? []).map((j) => j.pas.metres);
    const pas = pasProfil(longueurApprochee(ligne), fins.length ? Math.min(...fins) : null);
    try { const recu = await api.terrainProfil(ligne, pas, produit); if (courant()) setProfil({ etat: "ok", recu, ligne }); } catch (e) { if (courant()) setProfil({ etat: "erreur", message: message(e), ligne }); }
  };
  /** Clic ou tracé terminé avec un outil du terrain (moteur). */
  const surTrace = (o: OutilCarte, sommets: readonly [number, number][]) => {
    if (o === "altitude" && sommets[0]) void interroger(sommets[0][0], sommets[0][1]);
    if (o === "profil" && sommets.length >= 2) void tracerProfil(sommets.map((s) => [s[0], s[1]] as [number, number]));
  };

  const affichage = useMemo<AffichageTerrain | null>(() => {
    if (!jeux) return null;
    const couv = couvertures ? { type: "FeatureCollection" as const, features: jeux.filter((j) => j.couverture).map((j) => ({ type: "Feature", properties: { versionId: j.versionId }, geometry: j.couverture })) } : null;
    const repere = survol ?? (point?.etat === "ok" ? [point.recu.lon, point.recu.lat] as const : null);
    const plageAlt = portee.mode === "adaptee" && plageAdaptee ? plageAdaptee.plage : null;
    // Bulle de l'altitude à l'endroit touché (TER-09) : valeur arrondie à la précision de la source, ou « indisponible ».
    const bulle = point && pointDemande ? {
      lon: pointDemande[0], lat: pointDemande[1],
      texte: point.etat === "chargement" ? "…" : point.etat !== "ok" ? "indisponible"
        : point.recu.disponible ? formaterAltitude(point.recu.altitude, point.recu.source) : point.recu.etat === "chargement" ? "…" : "indisponible",
    } : null;
    return {
      versionId: jeu && jeu.droits.tuiles === "autorise" ? jeu.versionId : null,
      // Sans plage de version (fond mondial en dalles, jamais lu en entier) : l'altitude attend une légende adaptée.
      altitude: { ...altitude, visible: altitude.visible && (plageAlt !== null || jeu?.plageAltitude != null), plage: plageAlt },
      zoomMinimal: jeu?.fondMondial?.zoomMinimal ?? null, zoomMinimalCourbes: jeu?.fondMondial?.zoomMinimalCourbes ?? null, bulle,
      pente, ombrage, courbes, couvertures: couv, repere, profil: profil?.ligne ?? null,
      // L'étiquette du jeu accompagne son attribution sur la carte : une démonstration n'est jamais lue comme un site réel.
      attribution: jeu ? (jeu.etiquette ? `${jeu.attribution} — ${jeu.etiquette}` : jeu.attribution) : null,
    };
  }, [jeux, jeu, altitude, pente, ombrage, courbes, couvertures, survol, point, pointDemande, profil, portee.mode, plageAdaptee]);

  // Légende adaptée à la vue : elle suit la carte (lecture après un court délai, la dernière vue l'emporte), sauf pour une
  // zone d'étude ou sous le zoom minimal du fond mondial (rien n'y est lu).
  const suitLaVue = modeLegende === "adaptee" && !(plageVue && plageVue.versionId === versionId && plageVue.zone) && altitude.visible && !!jeu;
  useEffect(() => {
    if (!suitLaVue || !vueSuivie || !jeu) return;
    if (jeu.fondMondial && vueSuivie.zoom !== null && vueSuivie.zoom < jeu.fondMondial.zoomMinimal) return;
    const minuterie = setTimeout(() => { void adapter(null); }, 400);
    return () => clearTimeout(minuterie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suitLaVue, vueSuivie, jeu?.versionId]);

  /** La vue a bougé : le jeu affiché suit le centre de la vue, sauf choix manuel (TER-09). */
  const suivreVue = useCallback((vue: Emprise | null, zoom: number | null = null) => {
    if (vue) setVueSuivie({ vue, zoom });
    if (choixManuel.current || !jeux) return;
    setVersionId((v) => jeuPourVue(jeux, vue, v));
  }, [jeux]);
  return {
    produit, changerProduit, jeux, erreur, jeu, versionId, ouvrir, recharger: () => void charger(produit),
    setVersionId: (v: string) => { choixManuel.current = true; setVersionId(v); }, suivreVue, tuiles, setTuiles,
    altitude, setAltitude, pente, setPente, ombrage, setOmbrage, modeLegende, setModeLegende, adapter, adaptation, portee,
    courbes, setCourbes, equidistances, couvertures, setCouvertures, point, profil, survol, setSurvol, surTrace, affichage,
    effacerResultats: () => { setPoint(null); setPointDemande(null); setProfil(null); setSurvol(null); },
  };
}
export type EtatTerrain = ReturnType<typeof useTerrain>;

function Picto({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}

/** Étiquette du jeu (démonstration, test seulement…) : toujours visible avec lui, jamais confondue avec un site réel. */
function Etiquette({ s }: { s: Pick<SourceTerrainRecue, "etiquette"> }) {
  return s.etiquette ? <p className="gd-terrain-etiquette" role="note" data-gd-terrain-etiquette><span translate="no">{s.etiquette}</span></p> : null;
}

function SourcesEtPrecision({ s }: { s: SourceTerrainRecue }) {
  return (
    <dl className="gd-terrain-sources" data-gd-terrain-sources={s.versionId}>
      {lignesSource(s).map(([libelle, valeur]) => (
        <div key={libelle} className="gd-terrain-ligne-source">
          <dt>{libelle}</dt>
          {/* Valeurs de la base : non traduites, sauf les états d'interface (« non évaluée », « non déclarée »…). */}
          <dd translate={/^(non évaluée|non évaluée \(aucun point de contrôle\)|non déclarée|mesurée|déclarée par le producteur|conforme aux cibles|non conforme aux cibles|mesurée, sans cible|MNT \(terrain nu\)|MNS \(surface, bâtiments et végétation compris\))$/.test(valeur) ? undefined : "no"}>{valeur}</dd>
        </div>
      ))}
      {s.licence.url && <div className="gd-terrain-ligne-source"><dt>Conditions</dt><dd><a href={s.licence.url} target="_blank" rel="noreferrer noopener" translate="no">{s.licence.url}</a></dd></div>}
    </dl>
  );
}

function Legende({ min, max, palette, unite, libelle, zone }: { min: number; max: number; palette: readonly string[]; unite: string; libelle?: string; zone?: string | null }) {
  return (
    <figure className="gd-terrain-legende" data-gd-terrain-legende={unite}>
      <div className="gd-terrain-degrade" style={{ background: degrade(palette) }} aria-hidden="true" />
      <div className="gd-terrain-graduations" translate="no">{graduations(min, max, 5).map((g, i) => <span key={i}>{`${nombreFr(g, max - min < 20 ? 1 : 0)} ${unite}`}</span>)}</div>
      {libelle && <figcaption className="gd-discret" data-gd-terrain-portee><span>{libelle}</span>{zone && <> <span translate="no">{zone}</span></>}</figcaption>}
    </figure>
  );
}

function GraphiqueProfil({ recu, onSurvol }: { recu: ProfilRecu; onSurvol(p: [number, number] | null): void }) {
  const cadre = { largeur: 320, hauteur: 160, marge: 26 };
  const t = traceProfil(recu.points, cadre);
  const titres = new Map(recu.sources.map((s) => [s.versionId, s.titre]));
  const survoler = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const c = ((e.clientX - r.left) / r.width) * cadre.largeur;
    let meilleur: ProfilRecu["points"][number] | null = null;
    for (const p of recu.points) if (!meilleur || Math.abs(t.x(p.chainage) - c) < Math.abs(t.x(meilleur.chainage) - c)) meilleur = p;
    onSurvol(meilleur ? [meilleur.lon, meilleur.lat] : null);
  };
  return (
    <figure className="gd-terrain-profil" data-gd-terrain-profil>
      <svg viewBox={`0 0 ${cadre.largeur} ${cadre.hauteur}`} role="img" aria-label="Profil du terrain : altitude selon la distance le long de la ligne" onPointerMove={survoler} onPointerLeave={() => onSurvol(null)}>
        {recu.lacunes.map((l, i) => <rect key={`l${i}`} x={t.x(l.debut)} y={cadre.marge} width={Math.max(2, t.x(l.fin) - t.x(l.debut))} height={cadre.hauteur - 2 * cadre.marge} className="gd-profil-lacune" data-gd-profil-lacune />)}
        {recu.transitions.map((r, i) => <line key={`t${i}`} x1={t.x(r.chainage)} x2={t.x(r.chainage)} y1={cadre.marge} y2={cadre.hauteur - cadre.marge} className="gd-profil-transition" data-gd-profil-transition />)}
        <path d={`M${cadre.marge},${cadre.hauteur - cadre.marge}H${cadre.largeur - cadre.marge}M${cadre.marge},${cadre.marge}V${cadre.hauteur - cadre.marge}`} className="gd-profil-axes" />
        {t.segments.map((s, i) => <path key={i} d={s.d} className={s.interpolee ? "gd-profil-trait gd-profil-interpole" : "gd-profil-trait"} data-gd-profil-segment={s.interpolee ? "interpole" : "natif"} />)}
        <g {...{ translate: "no" }}>
          {t.max !== null && <text x={2} y={cadre.marge + 4} className="gd-profil-texte">{`${nombreFr(t.max, 1)} m`}</text>}
          {t.min !== null && <text x={2} y={cadre.hauteur - cadre.marge} className="gd-profil-texte">{`${nombreFr(t.min, 1)} m`}</text>}
          <text x={cadre.largeur - cadre.marge} y={cadre.hauteur - 6} textAnchor="end" className="gd-profil-texte">{distanceFr(t.longueur)}</text>
        </g>
      </svg>
      <figcaption className="gd-discret">
        <span>Trait plein : au pas natif du jeu ; pointillé : points plus serrés que le pas natif (interpolés) ; zone grisée : lacune (aucune valeur, jamais comblée) ; trait vertical : raccord entre deux jeux.</span>
      </figcaption>
      {recu.transitions.length > 0 && (
        <ul className="gd-liste" data-gd-profil-raccords>
          {recu.transitions.map((r, i) => (
            <li key={i}><span>Raccord à</span> <span translate="no">{distanceFr(r.chainage)}</span> <span>:</span> <span translate="no">{r.de ? titres.get(r.de) ?? r.de : "—"}</span> <span>→</span> <span translate="no">{r.vers ? titres.get(r.vers) ?? r.vers : "—"}</span></li>
          ))}
        </ul>
      )}
      {recu.lacunes.length > 0 && <p className="gd-alerte" data-gd-profil-lacunes><span>Lacunes (hors couverture ou sans valeur) :</span> <span translate="no">{recu.lacunes.map((l) => `${distanceFr(l.debut)} – ${distanceFr(l.fin)}`).join(" ; ")}</span></p>}
      {recu.referencesEcartees.length > 0 && <p className="gd-alerte" data-gd-profil-references><span>Jeux écartés (autre référence verticale, aucun mélange) :</span> <span translate="no">{recu.referencesEcartees.join(", ")}</span></p>}
      <p className="gd-discret"><span>Chaînage :</span> <span>{recu.chainage}</span></p>
    </figure>
  );
}

export function PanneauTerrain({ t, outil, onOutil, onCentrer, vue, zoneEtude, zoom }: {
  t: EtatTerrain; outil: OutilCarte; onOutil(o: OutilCarte): void; onCentrer(e: Emprise): void;
  /** Zoom courant de la carte (fond mondial : zoom minimal d'affichage). */
  zoom?: number | null;
  /** Emprise de la vue courante (message de couverture). */
  vue: Emprise | null;
  /** Zone d'étude active (filtre de zone) : portée possible de la légende adaptée. */
  zoneEtude: { nom: string; geometrie: { type: string; coordinates: unknown } } | null;
}) {
  const ouvrir = t.ouvrir;
  useEffect(() => { ouvrir(); }, [ouvrir]);
  const j = t.jeu;
  const couche = (cle: "altitude" | "pente" | "ombrage", libelle: string, r: ReglageCouche, set: (r: ReglageCouche) => void) => (
    <div className="gd-terrain-couche" data-gd-terrain-couche={cle}>
      <label className="gd-case"><input type="checkbox" checked={r.visible} disabled={!j || j.droits.tuiles !== "autorise"} onChange={() => set({ ...r, visible: !r.visible })} data-gd-terrain-visible={cle} />{libelle}</label>
      <label className="gd-terrain-opacite"><span>Opacité</span>
        <input type="range" min={0} max={1} step={0.05} value={r.opacite} disabled={!r.visible} onChange={(e) => set({ ...r, opacite: Number(e.target.value) })} aria-label={`Opacité : ${libelle}`} data-gd-terrain-opacite={cle} />
      </label>
    </div>
  );
  return (
    <div className="gd-terrain" data-gd-terrain>
      <fieldset className="gd-terrain-produit">
        <legend>Produit</legend>
        {(["MNT", "MNS"] as const).map((p) => (
          <label key={p} className="gd-case"><input type="radio" name="gd-terrain-produit" checked={t.produit === p} onChange={() => t.changerProduit(p)} data-gd-terrain-produit={p} />{p === "MNT" ? "MNT — terrain nu" : "MNS — surface (bâtiments, végétation)"}</label>
        ))}
      </fieldset>
      {t.erreur && <p className="gd-alerte" role="alert" data-gd-terrain-erreur>{t.erreur}</p>}
      {t.jeux === null && !t.erreur && <p className="gd-etat" role="status">Chargement des jeux publiés…</p>}
      {t.jeux && !t.jeux.length && !t.erreur && <p className="gd-etat" data-gd-terrain-aucun>Aucun jeu publié pour ce produit : rien n'est affiché (aucune valeur estimée).</p>}
      {j && (
        <>
          {/* Ce qui s'affiche, en une ligne ; le détail est dans « Sources et précision », replié (TER-09). */}
          <p className="gd-terrain-resume" data-gd-terrain-resume-jeu><span translate="no">{resumeSource(j)}</span></p>
          {/* L'étiquette d'une démonstration ou d'un jeu de test reste en tête ; celle d'un modèle mondial (« précision de
              plusieurs mètres ») est déjà dite par le résumé, elle reste dans « Sources et précision ». */}
          {j.niveau !== "mondial" && <Etiquette s={j} />}
          {j.fondMondial && zoom != null && zoom < j.fondMondial.zoomMinimal && (
            <p className="gd-alerte" role="status" data-gd-terrain-zoom-minimal>{`Zoomez davantage : le fond mondial s'affiche à partir du niveau de zoom ${j.fondMondial.zoomMinimal} (lecture à la demande).`}</p>
          )}
          {j.fondMondial && t.courbes.visible && zoom != null && zoom >= j.fondMondial.zoomMinimal && zoom < j.fondMondial.zoomMinimalCourbes && (
            <p className="gd-discret" role="status" data-gd-terrain-zoom-courbes>{`Courbes du fond mondial à partir du niveau de zoom ${j.fondMondial.zoomMinimalCourbes} (calculées sur la grille numérique).`}</p>
          )}
          {t.tuiles.chargement && <p className="gd-discret" role="status" data-gd-terrain-chargement>{j.fondMondial ? "Chargement du fond mondial (lecture à la demande)…" : "Chargement du terrain…"}</p>}
          {t.tuiles.indisponibles > 0 && <p className="gd-alerte" role="status" data-gd-terrain-tuiles-indisponibles>Une partie du terrain est indisponible pour l'instant (source distante injoignable ou lecture trop longue) : aucune valeur n'est estimée.</p>}
          {j.droits.tuiles !== "autorise" && <p className="gd-alerte" data-gd-terrain-droits>Affichage en tuiles non autorisé par les droits de cette version.</p>}
          <fieldset>
            <legend>Couches</legend>
            {couche("altitude", "Altitude", t.altitude, t.setAltitude)}
            {t.altitude.visible && (
              <div className="gd-terrain-bloc-legende">
                {t.portee.plage ? <Legende min={t.portee.plage[0]} max={t.portee.plage[1]} palette={PALETTE_ALTITUDE} unite="m" libelle={t.portee.libelle} zone={t.portee.zone} /> : <p className="gd-discret">{t.portee.libelle}</p>}
                {t.adaptation?.etat === "chargement" && <p className="gd-discret" role="status">Lecture des altitudes de la vue…</p>}
                {t.adaptation?.etat === "erreur" && <p className="gd-alerte" role="status" data-gd-terrain-adaptation-erreur>{t.adaptation.message}</p>}
                <div role="radiogroup" aria-label="Portée de la légende d'altitude" className="gd-actions">
                  <button type="button" onClick={() => void t.adapter(null)} aria-pressed={t.modeLegende === "adaptee" && !t.portee.zone} data-gd-terrain-adapter>Adapter à la vue</button>
                  <label className="gd-case"><input type="radio" name="gd-terrain-legende" checked={t.modeLegende === "verrouillee"} onChange={() => t.setModeLegende("verrouillee")} data-gd-terrain-mode-legende="verrouillee" />Légende verrouillée (version)</label>
                  {zoneEtude && <button type="button" onClick={() => void t.adapter(zoneEtude)} aria-pressed={t.modeLegende === "adaptee" && !!t.portee.zone} data-gd-terrain-adapter-zone>Adapter à la zone d'étude</button>}
                </div>
              </div>
            )}
            {couche("pente", "Pente", t.pente, t.setPente)}
            {t.pente.visible && <Legende min={0} max={45} palette={PALETTE_PENTE} unite="°" libelle="Pente en degrés, de 0 à 45°" />}
            {couche("ombrage", "Ombrage", t.ombrage, t.setOmbrage)}
            {t.ombrage.visible && <p className="gd-discret">Relief éclairé du nord-ouest, pour la lecture seulement.</p>}
            {/* Contours : courbes de niveau, une couche comme les autres (case et opacité), équidistance juste en dessous. */}
            <div className="gd-terrain-couche" data-gd-terrain-couche="contours">
              <label className="gd-case"><input type="checkbox" checked={t.courbes.visible} disabled={!t.equidistances.length || j.droits.tuiles !== "autorise"} onChange={() => t.setCourbes({ ...t.courbes, visible: !t.courbes.visible })} data-gd-terrain-visible="contours" data-gd-terrain-courbes-visible />Contours</label>
              <label className="gd-terrain-opacite"><span>Opacité</span>
                <input type="range" min={0} max={1} step={0.05} value={t.courbes.opacite} disabled={!t.courbes.visible} onChange={(e) => t.setCourbes({ ...t.courbes, opacite: Number(e.target.value) })} aria-label="Opacité : Contours" data-gd-terrain-opacite="contours" />
              </label>
            </div>
            <div data-gd-terrain-courbes>
            <label className="gd-terrain-equidistance"><span>Équidistance</span>
              <select value={t.courbes.equidistance ?? ""} disabled={!t.equidistances.length} onChange={(e) => t.setCourbes({ ...t.courbes, equidistance: Number(e.target.value) })} data-gd-terrain-equidistance>
                {t.equidistances.map((e) => <option key={e} value={e} translate="no">{`${nombreFr(e, e < 1 ? 2 : 0)} m`}</option>)}
              </select>
            </label>
            <p className="gd-discret" data-gd-terrain-equidistance-min><span>Équidistance minimale admise par la précision de la source :</span> <span translate="no">{`${nombreFr(j.courbes.equidistanceMinimale, j.courbes.equidistanceMinimale < 1 ? 2 : 0)} m`}</span></p>
            {!t.equidistances.length && <p className="gd-alerte">Aucune courbe calculée n'atteint ce seuil : courbes indisponibles pour cette version.</p>}
            </div>
          </fieldset>
        </>
      )}
      <fieldset>
        <legend>Interroger le terrain</legend>
        <div className="gd-actions">
          <button type="button" aria-pressed={outil === "altitude"} onClick={() => onOutil(outil === "altitude" ? "navigation" : "altitude")} aria-keyshortcuts={RACCOURCIS_TERRAIN.altitude} title="Altitude au point (Alt+O)" data-gd-terrain-outil="altitude"><Picto d={ICONES_TERRAIN.altitude} /><span>Altitude au point</span></button>
          <button type="button" aria-pressed={outil === "profil"} onClick={() => onOutil(outil === "profil" ? "navigation" : "profil")} aria-keyshortcuts={RACCOURCIS_TERRAIN.profil} title="Profil du terrain (Alt+U)" data-gd-terrain-outil="profil"><Picto d={ICONES_TERRAIN.profil} /><span>Profil du terrain</span></button>
        </div>
        {outil === "altitude" && <p className="gd-discret">Cliquez sur la carte : altitude de la meilleure source publiée au point.</p>}
        {outil === "profil" && <p className="gd-discret">Cliquez les sommets de la ligne ; double-clic ou Entrée pour tracer le profil ; Échap annule.</p>}
      </fieldset>
      {t.point && (
        <section className="gd-terrain-resultat" aria-label="Altitude au point" data-gd-terrain-point>
          <h3>Altitude au point</h3>
          {t.point.etat === "chargement" && <p role="status">Lecture…</p>}
          {t.point.etat === "erreur" && <p className="gd-alerte" role="alert">{t.point.message}</p>}
          {t.point.etat === "ok" && !t.point.recu.disponible && <p className="gd-alerte" data-gd-terrain-indisponible>{t.point.recu.motif}</p>}
          {t.point.etat === "ok" && t.point.recu.disponible && (
            <>
              <p className="gd-terrain-valeur" data-gd-terrain-altitude={t.point.recu.altitude}><span translate="no">{formaterAltitude(t.point.recu.altitude, t.point.recu.source)}</span></p>
              <p className="gd-discret"><span translate="no">{resumeSource(t.point.recu.source)}</span></p>
              <details className="gd-terrain-details" data-gd-terrain-point-details>
                <summary>Détail de la valeur</summary>
                <p className="gd-discret"><span>Arrondie à la précision de la source ;</span> <span>{t.point.recu.echantillonnage === "bilineaire" ? "interpolation bilinéaire entre quatre cellules" : "valeur de la cellule"}</span></p>
                <p className="gd-discret" translate="no">{`${t.point.recu.lat.toFixed(6)}, ${t.point.recu.lon.toFixed(6)} (WGS 84)`}</p>
                <Etiquette s={t.point.recu.source} />
                <SourcesEtPrecision s={t.point.recu.source} />
              </details>
            </>
          )}
        </section>
      )}
      {t.profil && (
        <section className="gd-terrain-resultat" aria-label="Profil du terrain" data-gd-terrain-profil-resultat>
          <h3>Profil du terrain</h3>
          {t.profil.etat === "chargement" && <p role="status">Calcul du profil…</p>}
          {t.profil.etat === "erreur" && <p className="gd-alerte" role="alert">{t.profil.message}</p>}
          {t.profil.etat === "ok" && (t.profil.recu.points.some((p) => p.altitude !== null)
            ? <>
                <GraphiqueProfil recu={t.profil.recu} onSurvol={t.setSurvol} />
                {t.profil.recu.sources.map((s) => <details key={s.versionId}><summary translate="no">{s.titre}</summary><Etiquette s={s} /><SourcesEtPrecision s={s} /></details>)}
              </>
            : <p className="gd-alerte" data-gd-terrain-indisponible>Aucune altitude publiée le long de cette ligne : profil indisponible (jamais estimé).</p>)}
        </section>
      )}
      {(t.point || t.profil) && <div className="gd-actions"><button type="button" onClick={t.effacerResultats} data-gd-terrain-effacer>Effacer les résultats</button></div>}
      {t.jeux && t.jeux.length > 0 && (
        // Rigueur en un geste, repliée par défaut (TER-09) : jeux publiés et leur couverture, source détaillée.
        <details className="gd-terrain-details" data-gd-terrain-details>
          <summary data-gd-terrain-details-ouvrir><span>Sources et précision</span>{j && <> <span className="gd-discret" translate="no">{resumeSource(j)}</span></>}</summary>
          {j && (
            <section aria-label="Sources et précision" data-gd-terrain-rubrique-sources>
              <h3>Sources et précision</h3>
              <Etiquette s={j} />
              <SourcesEtPrecision s={j} />
            </section>
          )}
          <fieldset>
            <legend>Jeux publiés</legend>
            <p className="gd-discret">Le jeu affiché suit la carte : le plus fin au centre de la vue (levé local sur son emprise, sinon fond mondial).</p>
            <ul className="gd-liste">
              {t.jeux.map((x) => (
                <li key={x.versionId} data-gd-terrain-jeu={x.versionId}>
                  <label className="gd-case"><input type="radio" name="gd-terrain-jeu" checked={t.versionId === x.versionId} onChange={() => t.setVersionId(x.versionId)} /><span translate="no">{x.titre}</span></label>
                  <span className="gd-discret"><span>Pas</span> <span translate="no">{`${nombreFr(x.pas.metres, x.pas.metres < 1 ? 2 : 1)} m`}</span></span>
                  <Etiquette s={x} />
                  {x.acces === "a-la-demande" && <span className="gd-discret" data-gd-terrain-a-la-demande>Fond mondial lu à la demande : emprise affichée seulement</span>}
                  {empriseGeometrie(x.couverture) && x.acces !== "a-la-demande" && <button type="button" onClick={() => onCentrer(empriseGeometrie(x.couverture)!)} data-gd-terrain-centrer={x.versionId}>Centrer sur la couverture</button>}
                </li>
              ))}
            </ul>
            <label className="gd-case"><input type="checkbox" checked={t.couvertures} onChange={() => t.setCouvertures(!t.couvertures)} data-gd-terrain-couvertures />Couverture disponible (limites)</label>
            {(() => { const m = messageCouverture(t.jeux, vue); return m && <p className="gd-discret" role="status" data-gd-terrain-couverture-vue>{m}</p>; })()}
          </fieldset>
        </details>
      )}
    </div>
  );
}
