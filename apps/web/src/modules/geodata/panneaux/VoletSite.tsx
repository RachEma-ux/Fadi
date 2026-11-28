/**
 * Volet « Site » (feuille de route équipe A, PR P13 et P14 ; UX-6, carto C3, donnees-1) : « Que sait-on d'ici ? ». Lit,
 * pour un lieu (fiche ouverte, centre de la carte ou coordonnées saisies), ce que la base sait, rubrique par rubrique :
 * valeur avec sa provenance, ou « non évaluée » avec son motif — jamais zéro. La référence du site (renvoi aux versions
 * lues, aucune valeur) se copie pour être transmise.
 */
import { useState, type ReactNode } from "react";
import { formatNombre, libelleAbsence, libelleNonEvalue, type LectureSite, type Provenance, type Rubrique } from "@parcours/geodata-model";

export type EtatSite =
  | { etat: "chargement"; lieu: { lon: number; lat: number; libelle: string } }
  | { etat: "ok"; lieu: { lon: number; lat: number; libelle: string }; lecture: LectureSite };

const heureSuisse = (iso: string) => new Date(iso).toLocaleString("fr-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" });

function LigneProvenance({ p }: { p: readonly Provenance[] }) {
  if (!p.length) return null;
  return (
    <ul className="gd-site-provenance" data-gd-site-provenance>
      {p.map((x) => (
        <li key={x.versionId} className="gd-discret">
          <span>Source :</span> <span translate="no">{`${x.titre} — ${x.libelle} · ${x.attribution}`}</span>
          {x.qualification?.etat === "provisoire" && <>{" · "}<span className="gd-badge gd-badge-alerte">Source provisoire</span></>}
        </li>
      ))}
    </ul>
  );
}

function RubriqueSite<T>({ id, titre, r, rendu }: { id: string; titre: string; r: Rubrique<T>; rendu(v: T): ReactNode }) {
  return (
    <section className="gd-site-rubrique" data-gd-site-rubrique={id} data-gd-site-etat={r.etat}>
      <h3>{titre}</h3>
      {r.etat === "evaluee" ? (
        <>
          {rendu(r.valeur)}
          {r.nature === "calcule" && <p className="gd-discret">Fiabilité : non évaluée (valeur calculée)</p>}
          {!!r.lacunes?.length && (
            <ul className="gd-liste-simple" data-gd-site-lacunes>{r.lacunes.map((l) => (
              <li key={l.coucheId} className="gd-etat"><span>Lecture partielle :</span> <span translate="no">{l.titre ?? l.coucheId}</span>{" — "}<span>{libelleNonEvalue(l.motif)}</span></li>
            ))}</ul>
          )}
        </>
      ) : (
        <p className="gd-etat" data-gd-site-motif={r.motif}><span>{libelleNonEvalue(r.motif)}</span>{r.detail && <>{" — "}<span translate="no">{r.detail}</span></>}</p>
      )}
      <LigneProvenance p={r.provenance} />
    </section>
  );
}

export function VoletSite(p: {
  site: EtatSite | null; rayonM: number;
  onLire(lieu: { lon: number; lat: number; libelle: string }): void;
  /** Copie la référence du site ; rend le message à annoncer. */
  onCopierReference(): Promise<string>;
}) {
  const [lon, setLon] = useState("");
  const [lat, setLat] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const s = p.site;
  return (
    <div className="gd-site" data-gd-site={s?.etat ?? "vide"}>
      {s && (
        <p className="gd-discret" data-gd-site-lieu>
          <span>Lieu lu :</span> <span translate="no">{`${s.lieu.libelle} (${s.lieu.lat.toFixed(5)}, ${s.lieu.lon.toFixed(5)}, WGS 84)`}</span>
          {s.etat === "ok" && <>{" · "}<span>lu le</span> <span translate="no">{heureSuisse(s.lecture.lueLe)}</span> <span>(heure suisse)</span></>}
        </p>
      )}
      {!s && <p className="gd-etat">Choisissez un lieu : ouvrez la fiche d'un territoire, centrez la carte, ou saisissez des coordonnées.</p>}
      {s?.etat === "chargement" && <p role="status" className="gd-discret">Lecture de la base…</p>}
      {s?.etat === "ok" && (
        <>
          <RubriqueSite id="unites" titre="Territoires qui contiennent ce lieu" r={s.lecture.unites} rendu={(us) => (
            <ul className="gd-liste-simple">{us.map((u) => <li key={`${u.rang}:${u.code}`}><span translate="no">{u.nom}</span> <span className="gd-discret" translate="no">{`(${u.code})`}</span></li>)}</ul>
          )} />
          <RubriqueSite id="indicateurs" titre="Indicateurs du territoire le plus fin" r={s.lecture.indicateurs} rendu={(is) => (
            <dl className="gd-site-valeurs">{is.map((i, k) => (
              <div key={k}><dt translate="no">{`${i.titre}${i.periode ? ` · ${i.periode}` : ""}`}</dt>
                <dd>{i.valeur.valeur === null ? <><span>Valeur absente</span>{" — "}<span>{libelleAbsence(i.valeur.motifAbsence)}</span></> : <span translate="no">{`${formatNombre(i.valeur.valeur, Math.abs(i.valeur.valeur) >= 100 ? 0 : 2)}${i.unite ? ` ${i.unite}` : ""}`}</span>}</dd></div>
            ))}</dl>
          )} />
          <RubriqueSite id="services" titre={`Équipements dans ${formatNombre(p.rayonM, 0)} m (couches de points affichées)`} r={s.lecture.services} rendu={(ss) => (
            <ul className="gd-liste-simple">{ss.map((x) => (
              <li key={x.coucheId}><strong translate="no">{x.titre}</strong>{" : "}<span translate="no">{formatNombre(x.nombre, 0)}</span>
                {x.plusProche && <>{" · "}<span>le plus proche :</span> <span translate="no">{`${x.plusProche.nom} (${formatNombre(x.plusProche.distanceM, 0)} m)`}</span></>}
                <br /><span className="gd-discret">Couverture du rayon par la couche : non évaluée</span>{x.couvertureDeclaree && <span className="gd-discret">{" · "}<span>couverture déclarée :</span> <span translate="no">{x.couvertureDeclaree}</span></span>}</li>
            ))}</ul>
          )} />
          <RubriqueSite id="prix" titre="Prix publiés" r={s.lecture.prix} rendu={(es) => (
            <ul className="gd-liste-simple">{es.map((e) => <li key={e.versionId}><span translate="no">{`${e.editeur} — ${e.libelle}${e.periode ? ` · ${e.periode}` : ""}`}</span>{e.perimetre && <>{" · "}<span>périmètre :</span> <span translate="no">{`${e.perimetre.nom} (${e.perimetre.code})`}</span></>}</li>)}</ul>
          )} />
          <RubriqueSite id="grilles" titre="Grilles affichées sur la carte (valeur au point)" r={s.lecture.grilles} rendu={(gs) => (
            <dl className="gd-site-valeurs">{gs.map((g) => (
              <div key={g.coucheId} data-gd-site-grille={g.coucheId}><dt translate="no">{`${g.titre} · ${g.grandeur}`}</dt>
                <dd>{g.valeur === null ? <span data-gd-site-motif="hors-emprise">{libelleNonEvalue("hors-emprise")}</span>
                  : <span translate="no">{`${g.classe ?? formatNombre(g.valeur, Math.abs(g.valeur) >= 100 ? 0 : 2)}${!g.classe && g.unite ? ` ${g.unite}` : ""}`}</span>}</dd></div>
            ))}</dl>
          )} />
          <RubriqueSite id="terrain" titre="Altitude du terrain (MNT)" r={s.lecture.terrain} rendu={(t) => <p data-gd-site-altitude translate="no">{`${formatNombre(t.altitude, 1)} m`}</p>} />
          <RubriqueSite id="parcelle" titre="Parcelle, urbanisme, foncier, risques" r={s.lecture.parcelle} rendu={() => null} />
          <div className="gd-actions">
            <button type="button" onClick={() => p.onLire(s.lieu)} data-gd-site-relire>Relire</button>
            <button type="button" onClick={async () => setCopie(await p.onCopierReference())} data-gd-site-copier-reference>Copier la référence du site</button>
          </div>
          {copie && <p role="status" className="gd-discret" data-gd-site-copie>{copie}</p>}
          <p className="gd-discret">La référence renvoie aux versions lues (identifiant, empreinte, source) : elle ne contient aucune valeur et n'expire pas.</p>
        </>
      )}
      <form className="gd-formulaire" data-gd-site-coordonnees onSubmit={(e) => {
        e.preventDefault();
        const x = Number(lon.replace(",", ".")), y = Number(lat.replace(",", "."));
        if (!lon.trim() || !lat.trim() || !Number.isFinite(x) || !Number.isFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) return setErreur("Longitude −180 à 180 et latitude −90 à 90, en degrés décimaux.");
        setErreur(null);
        p.onLire({ lon: x, lat: y, libelle: "Coordonnées saisies" });
      }}>
        <h3>Lire un autre lieu (sans souris)</h3>
        <label className="gd-champ">Longitude<input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} data-gd-site-lon /></label>
        <label className="gd-champ">Latitude<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} data-gd-site-lat /></label>
        {erreur && <p role="alert" className="gd-alerte">{erreur}</p>}
        <button type="submit">Lire ce lieu</button>
      </form>
    </div>
  );
}
