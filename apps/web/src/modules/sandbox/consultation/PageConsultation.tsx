/**
 * Page publique d'un lien de consultation de la Planche (cas 4 du catalogue des extensions, étape 7d : D11-F18-018 ;
 * maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7d, téléphone) : `/consultation/:jeton`,
 * sans compte. Copie figée, lecture seule : nom et date de la version toujours visibles, scènes, vue 3D, barre Orbiter /
 * Mesurer / Cadrer. La mesure (si le lien la permet) prend deux points accrochés ; « ≈ » quand la valeur affichée est
 * arrondie. Rien n'est écrit : aucune commande d'édition, aucun appel autre que la lecture du lien.
 */
import { geometrieVisible, inferer, lireModelePlanche, type Modele, type Scene, type Vec3, type VueOutil } from "@parcours/sandbox-planche-model";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { LOCALE } from "../../../lib/i18n";
import { NAVIGATION_DEFAUT } from "../etat-ui";
import { t } from "../messages";
import { versionFigee } from "../planche/panneau-consultations";
import { lireConsultation } from "../planche/consultations-client";
import { VuePlanche } from "../planche/vue-planche";
import "../sandbox.css";
import "./page-consultation.css";

type Mode = "orbiter" | "mesurer";
type Etat = { genre: "chargement" } | { genre: "indisponible" } | { genre: "pret"; nom: string; creeLe: string; mesure: boolean; modele: Modele };

/** Longueur affichée à 2 décimales ; « ≈ » quand l'arrondi change la valeur (au-delà du micromètre). */
export function texteMesure(d: number, locale = LOCALE): string {
  const arrondi = Math.round(d * 100) / 100;
  const texte = arrondi.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${Math.abs(arrondi - d) > 1e-6 ? "≈ " : ""}${texte} m`;
}

/** Instrumentation de la recette (lecture seule) : projection écran de la vue. */
const fenetreRecette = (): { fadiConsultation?: { versEcran: (p: Vec3) => { x: number; y: number } | null } } => window as unknown as { fadiConsultation?: { versEcran: (p: Vec3) => { x: number; y: number } | null } };

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function PageConsultation() {
  const { jeton = "" } = useParams();
  const [etat, setEtat] = useState<Etat>({ genre: "chargement" });
  const [mode, setMode] = useState<Mode>("orbiter");
  const [sceneActive, setSceneActive] = useState<string | null>(null);
  const [points, setPoints] = useState<readonly Vec3[]>([]);
  const hoteRef = useRef<HTMLDivElement | null>(null);
  const vueRef = useRef<VuePlanche | null>(null);
  const modeRef = useRef<Mode>("orbiter");
  modeRef.current = mode;
  const pointsRef = useRef<readonly Vec3[]>([]);
  pointsRef.current = points;

  useEffect(() => {
    let annule = false;
    lireConsultation(jeton)
      .then((c) => {
        const modele = lireModelePlanche(c.modele);
        if (annule) return;
        setEtat(modele ? { genre: "pret", nom: c.nom, creeLe: c.creeLe, mesure: c.mesure, modele } : { genre: "indisponible" });
      })
      .catch(() => { if (!annule) setEtat({ genre: "indisponible" }); });
    return () => { annule = true; };
  }, [jeton]);

  const modele = etat.genre === "pret" ? etat.modele : null;
  const geometrie = useMemo(() => (modele ? geometrieVisible(modele) : null), [modele]);
  const scenes: readonly Scene[] = useMemo(() => Object.values(modele?.annotations?.scenes ?? {}), [modele]);

  // Vue 3D : créée une fois le dessin lu ; les événements ne servent qu'à la mesure (lecture seule).
  useEffect(() => {
    const hote = hoteRef.current;
    if (!modele || !hote || !geometrie) return;
    const v = new VuePlanche(hote, {
      evenement: (ev) => {
        if (modeRef.current !== "mesurer" || (ev.genre !== "clic" && ev.genre !== "survol")) return;
        const inference = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie });
        if (ev.genre === "survol") return afficher(v, pointsRef.current, inference);
        const avant = pointsRef.current.length >= 2 ? [] : pointsRef.current;
        const suite = [...avant, inference.point];
        setPoints(suite);
        afficher(v, suite, null);
      },
      outilCamera: () => (modeRef.current === "orbiter" ? "orbite" : null),
      navigation: () => NAVIGATION_DEFAUT,
    });
    vueRef.current = v;
    fenetreRecette().fadiConsultation = { versEcran: (p) => v.versEcran(p) };
    v.majModele(modele);
    const e = v.emprise();
    if (e) v.cadrer(e);
    v.rendre();
    return () => {
      v.detruire();
      vueRef.current = null;
      delete fenetreRecette().fadiConsultation;
    };
  }, [modele, geometrie]);

  const afficher = (v: VuePlanche, pts: readonly Vec3[], inference: ReturnType<typeof inferer> | null) => {
    const etiquettes = pts.length === 2 ? [{ point: { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2, z: (pts[0]!.z + pts[1]!.z) / 2 }, texte: texteMesure(distance(pts[0]!, pts[1]!)) }] : [];
    const vue: VueOutil = { consigne: "", mesures: null, inference, selection: [], survol: [], erreur: null, apercu: { lignes: pts.length === 2 ? [[pts[0]!, pts[1]!]] : [], faces: [], points: [...pts], etiquettes, teinte: "#1a5fd6" } };
    v.majSurcouche(vue, []);
  };

  const choisirMode = (m: Mode) => {
    setMode(m);
    setPoints([]);
    vueRef.current?.majSurcouche(null, []);
  };
  const cadrer = () => {
    const v = vueRef.current;
    const e = v?.emprise();
    if (v && e) v.cadrer(e);
    setSceneActive(null);
  };
  const appliquer = (s: Scene) => {
    vueRef.current?.appliquerScene(s);
    setSceneActive(s.id);
  };

  if (etat.genre === "chargement") return <main className="consultation consultation-attente" data-consultation="chargement"><p>{t("consultation.chargement")}</p></main>;
  if (etat.genre === "indisponible")
    return (
      <main className="consultation consultation-attente" data-consultation="indisponible">
        <h1>{t("consultation.indisponible")}</h1>
        <p>{t("consultation.indisponible.aide")}</p>
      </main>
    );
  const longueur = points.length === 2 ? texteMesure(distance(points[0]!, points[1]!)) : null;
  return (
    <main className="consultation sandbox-planche" data-consultation="pret" data-consultation-mesure={etat.mesure ? "permise" : "interdite"}>
      <header className="consultation-tete">
        <h1 data-consultation-nom>{etat.nom}</h1>
        <p data-consultation-version>{t("consultation.version", { date: versionFigee(etat.creeLe) })}</p>
      </header>
      <nav className="consultation-scenes" aria-label={t("consultation.scenes")}>
        <button type="button" className={sceneActive === null ? "est-actif" : ""} onClick={cadrer} data-consultation-scene="ensemble">{t("consultation.vue-ensemble")}</button>
        {scenes.map((s) => (
          <button key={s.id} type="button" className={sceneActive === s.id ? "est-actif" : ""} onClick={() => appliquer(s)} data-consultation-scene={s.id}>{s.nom}</button>
        ))}
      </nav>
      <div className="consultation-vue" ref={hoteRef} data-planche-vue>
        {mode === "mesurer" && (
          <p className="consultation-consigne" data-consultation-consigne>
            {longueur ? <strong data-consultation-longueur>{longueur}</strong> : t(points.length === 1 ? "consultation.mesure.second" : "consultation.mesure.consigne")} <small>{t("consultation.mesure.aide")}</small>
          </p>
        )}
      </div>
      <footer className="consultation-barre" role="toolbar">
        <button type="button" aria-pressed={mode === "orbiter"} onClick={() => choisirMode("orbiter")} data-consultation-mode="orbiter">{t("consultation.orbiter")}</button>
        <button type="button" aria-pressed={mode === "mesurer"} disabled={!etat.mesure} title={etat.mesure ? undefined : t("consultation.mesure.interdite")} onClick={() => choisirMode("mesurer")} data-consultation-mode="mesurer">{t("consultation.mesurer")}</button>
        <button type="button" onClick={cadrer} data-consultation-cadrer>{t("consultation.cadrer")}</button>
      </footer>
    </main>
  );
}
