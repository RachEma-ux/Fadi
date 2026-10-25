/**
 * Gestion des données GeoData (menu ☰ → « Données », D-GD-14) : catégories du catalogue et couches de chacune. Créer,
 * renommer, ordonner, supprimer une catégorie ; y ranger une couche commune, l'en retirer (elle revient à son thème) ou
 * la déplacer. Lecture seule sans la capacité « organiser-catalogue » ; le serveur reste seul juge (403). Supprimer une
 * catégorie ne supprime aucune couche.
 */
import { useState } from "react";
import { CATEGORIE_AUTRES, categorieDe, type RangementCatalogue } from "@parcours/geodata-model";
import { api, type CoucheRecue, type RangementRecu } from "../client";

export const rangementDepuis = (r: RangementRecu | null): RangementCatalogue | undefined =>
  r ? { categories: r.categories.map((c) => ({ cle: c.id, libelle: c.libelle, themes: c.themes })), affectations: new Map(Object.entries(r.affectations)) } : undefined;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SELON_THEME = "__theme__";

export function GestionDonnees(p: { rangement: RangementRecu | null; erreur: string | null; couches: CoucheRecue[] | null; onChange(): Promise<void> | void }) {
  const [nouvelle, setNouvelle] = useState("");
  const [edition, setEdition] = useState<{ id: string; libelle: string } | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [avis, setAvis] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  if (p.erreur) return <p role="alert" className="gd-alerte">{p.erreur}</p>;
  if (!p.rangement || !p.couches) return <p role="status" className="gd-etat">Chargement des catégories…</p>;
  const r = p.rangement;
  const rangement = rangementDepuis(r)!;
  const modifiable = r.modifiable;
  const couchesDe = (cle: string) => p.couches!.filter((c) => categorieDe(c, rangement).cle === cle).sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
  const agir = async (f: () => Promise<unknown>, ok: string) => {
    setOccupe(true); setAvis(null);
    try { await f(); await p.onChange(); setAvis({ type: "ok", texte: ok }); }
    catch (e) { setAvis({ type: "erreur", texte: message(e) }); }
    finally { setOccupe(false); }
  };
  const deplacer = (i: number, sens: -1 | 1) => {
    const ids = r.categories.map((c) => c.id);
    const j = i + sens;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void agir(() => api.ordonnerCategories(ids), "Ordre des catégories enregistré.");
  };
  const toutes = [...r.categories.map((c) => ({ id: c.id, libelle: c.libelle, themes: c.themes })), { id: CATEGORIE_AUTRES.cle, libelle: CATEGORIE_AUTRES.libelle, themes: [] as readonly string[] }];
  return (
    <div className="gd-gestion" data-gd-gestion>
      <p className="gd-discret">Les catégories rangent le catalogue de tous les comptes. Une couche sans rangement explicite suit le thème déclaré par sa source ; à défaut, elle est dans « Autres ».</p>
      {!modifiable && <p className="gd-alerte" role="status" data-gd-lecture-seule>Lecture seule : le rôle GeoData « gestionnaire de données » est requis pour modifier les catégories.</p>}
      {avis && <p role={avis.type === "erreur" ? "alert" : "status"} className={avis.type === "erreur" ? "gd-alerte" : "gd-succes"}>{avis.texte}</p>}
      {modifiable && (
        <form className="gd-formulaire gd-nouvelle-categorie" onSubmit={(e) => { e.preventDefault(); if (nouvelle.trim()) void agir(async () => { await api.creerCategorie(nouvelle); setNouvelle(""); }, "Catégorie créée."); }}>
          <label className="gd-champ">Nouvelle catégorie<input value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} maxLength={80} data-gd-nouvelle-categorie /></label>
          <button type="submit" disabled={occupe || nouvelle.trim().length < 2} data-gd-creer-categorie>Créer la catégorie</button>
        </form>
      )}
      <ol className="gd-liste">
        {toutes.map((cat, i) => {
          const autres = cat.id === CATEGORIE_AUTRES.cle;
          const cs = couchesDe(cat.id);
          const ajoutables = p.couches!.filter((c) => !c.version.privee && categorieDe(c, rangement).cle !== cat.id).sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
          return (
            <li key={cat.id} className="gd-carte-couche" data-gd-gestion-categorie={cat.id}>
              {edition?.id === cat.id ? (
                <form className="gd-filtre" onSubmit={(e) => { e.preventDefault(); void agir(async () => { await api.renommerCategorie(cat.id, edition.libelle); setEdition(null); }, "Catégorie renommée."); }}>
                  <label className="gd-champ">Libellé<input value={edition.libelle} onChange={(e) => setEdition({ id: cat.id, libelle: e.target.value })} maxLength={80} autoFocus data-gd-libelle-categorie /></label>
                  <button type="submit" disabled={occupe} data-gd-valider-libelle>Enregistrer</button>
                  <button type="button" onClick={() => setEdition(null)}>Annuler</button>
                </form>
              ) : (
                <div className="gd-ligne-titre">
                  <button type="button" className="gd-entete-categorie" aria-expanded={ouverte === cat.id} onClick={() => setOuverte(ouverte === cat.id ? null : cat.id)} data-gd-ouvrir-categorie={cat.id}>
                    <span aria-hidden="true" className="gd-chevron">{ouverte === cat.id ? "▾" : "▸"}</span>
                    <span className="gd-nom-categorie">{cat.libelle}</span>
                    <span className="gd-compte">{String(cs.length)}</span>
                  </button>
                </div>
              )}
              {autres && <p className="gd-discret">Catégorie de repli, non modifiable : couches sans catégorie.</p>}
              {modifiable && !autres && edition?.id !== cat.id && (
                <div className="gd-actions">
                  <button type="button" onClick={() => setEdition({ id: cat.id, libelle: cat.libelle })} disabled={occupe} data-gd-renommer-categorie={cat.id}>Renommer</button>
                  <button type="button" onClick={() => deplacer(i, -1)} disabled={occupe || i === 0} aria-label={`Monter la catégorie ${cat.libelle}`}>Monter</button>
                  <button type="button" onClick={() => deplacer(i, 1)} disabled={occupe || i === r.categories.length - 1} aria-label={`Descendre la catégorie ${cat.libelle}`}>Descendre</button>
                  {aSupprimer === cat.id ? (
                    <>
                      <button type="button" className="gd-danger" onClick={() => void agir(async () => { await api.supprimerCategorie(cat.id); setASupprimer(null); }, "Catégorie supprimée ; ses couches suivent de nouveau leur thème.")} disabled={occupe} data-gd-confirmer-suppression={cat.id}>Confirmer la suppression</button>
                      <button type="button" onClick={() => setASupprimer(null)}>Annuler</button>
                    </>
                  ) : <button type="button" onClick={() => setASupprimer(cat.id)} disabled={occupe} data-gd-supprimer-categorie={cat.id}>Supprimer</button>}
                </div>
              )}
              {aSupprimer === cat.id && <p className="gd-alerte" role="status">{`Supprimer « ${cat.libelle} » ne supprime aucune couche : ses ${cs.length} couche(s) suivront leur thème ou iront dans « Autres ».`}</p>}
              {ouverte === cat.id && (
                <>
                  {cs.length === 0 && <p className="gd-etat">Aucune couche dans cette catégorie.</p>}
                  <ul className="gd-liste gd-couches-categorie">
                    {cs.map((c) => {
                      const explicite = r.affectations[c.version.source.id];
                      return (
                        <li key={c.id} className="gd-ligne-couche" data-gd-gestion-couche={c.id}>
                          <span translate="no">{c.titre}</span>
                          <span className="gd-discret">{`${c.typeGeometrie === "raster" ? "Imagerie" : "Vecteurs"}${c.version.privee ? " · Privée" : ""} · ${explicite ? "rangée explicitement" : "selon son thème"}`}</span>
                          {modifiable && !c.version.privee && (
                            <label className="gd-champ">Catégorie de la couche
                              <select value={explicite ?? SELON_THEME} disabled={occupe} onChange={(e) => {
                                const v = e.target.value;
                                void agir(() => (v === SELON_THEME ? api.libererSource(c.version.source.id) : api.rangerSource(v, c.version.source.id)), v === SELON_THEME ? "La couche suit de nouveau son thème." : "Couche rangée.");
                              }} data-gd-categorie-couche={c.id}>
                                <option value={SELON_THEME}>Selon son thème</option>
                                {r.categories.map((k) => <option key={k.id} value={k.id}>{k.libelle}</option>)}
                              </select>
                            </label>
                          )}
                          {modifiable && explicite && <button type="button" onClick={() => void agir(() => api.libererSource(c.version.source.id), "La couche suit de nouveau son thème.")} disabled={occupe} data-gd-retirer-couche={c.id}>Retirer de la catégorie</button>}
                        </li>
                      );
                    })}
                  </ul>
                  {modifiable && !autres && ajoutables.length > 0 && (
                    <label className="gd-champ">Ajouter une couche à cette catégorie
                      <select value="" disabled={occupe} onChange={(e) => { const c = ajoutables.find((x) => x.id === e.target.value); if (c) void agir(() => api.rangerSource(cat.id, c.version.source.id), "Couche rangée."); }} data-gd-ajouter-couche-categorie={cat.id}>
                        <option value="">Choisir une couche…</option>
                        {ajoutables.map((c) => <option key={c.id} value={c.id} translate="no">{c.titre}</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
