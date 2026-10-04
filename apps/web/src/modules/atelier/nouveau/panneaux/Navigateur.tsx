/**
 * Navigateur du projet (cahier §5.7, UX3) : niveaux (choix du niveau actif, création), calques (visibilité et
 * verrouillage = commandes `calque.modifier`, car ils sont dans le modèle), objets du niveau regroupés par classe
 * (clic = sélection, la vue se recentre).
 */
import { useMemo, useState } from "react";
import { CLASSES, niveauxOrdonnes, type Classe, type Commande, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { etatUi, type EtatUi } from "../etat-ui";
import { normaliser } from "../outils";

export interface PropsNavigateur {
  etat: ModeleAtelier;
  ui: EtatUi;
  readOnly: boolean;
  onCommandes: (commandes: Commande[], label: string) => void;
  onCentrer: (objetId: string) => void;
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));

function nomObjet(o: OccurrenceQuelconque): string {
  const p = o.params as unknown as Record<string, unknown>;
  for (const k of ["nom", "repere", "texte", "code"]) if (typeof p[k] === "string" && p[k]) return p[k] as string;
  return o.id;
}

export function Navigateur({ etat, ui, readOnly, onCommandes, onCentrer }: PropsNavigateur) {
  const niveaux = niveauxOrdonnes(etat);
  const [filtre, setFiltre] = useState("");
  const [nouveauNiveau, setNouveauNiveau] = useState<{ nom: string; elevation: string } | null>(null);
  const calques = Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre);
  const parClasse = useMemo(() => {
    const m = new Map<Classe, OccurrenceQuelconque[]>();
    const f = normaliser(filtre);
    for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
      if (o.niveauId !== ui.niveauId) continue;
      if (f && !normaliser(`${nomObjet(o)} ${o.id} ${CLASSES[o.classe].libelle}`).includes(f)) continue;
      const l = m.get(o.classe) ?? [];
      l.push(o);
      m.set(o.classe, l);
    }
    return [...m].sort((a, b) => CLASSES[a[0]].libelle.localeCompare(CLASSES[b[0]].libelle, "fr"));
  }, [etat.objets, ui.niveauId, filtre]);
  const selection = new Set(ui.selection);

  return (
    <nav className="navigateur" aria-label="Navigateur du projet">
      <section aria-labelledby="nav-niveaux">
        <h3 id="nav-niveaux">Niveaux</h3>
        <ul className="nav-liste nav-niveaux" aria-label="Niveau actif">
          {niveaux.map((n) => (
            <li key={n.id}>
              <button type="button" aria-pressed={n.id === ui.niveauId} className={n.id === ui.niveauId ? "est-actif" : ""} onClick={() => etatUi.set({ niveauId: n.id, selection: [], pointsEnCours: [] })}>
                <span>{n.nom}</span>
                <span className="nav-detail">{fmt(n.elevation)} m</span>
              </button>
            </li>
          ))}
        </ul>
        {!readOnly && !nouveauNiveau && (
          <button type="button" className="nav-ajout" onClick={() => setNouveauNiveau({ nom: `Niveau ${niveaux.length + 1}`, elevation: "" })}>
            Ajouter un niveau
          </button>
        )}
        {nouveauNiveau && (
          <form
            className="nav-formulaire"
            onSubmit={(e) => {
              e.preventDefault();
              const elevation = Number(nouveauNiveau.elevation.replace(",", "."));
              if (!nouveauNiveau.nom.trim() || nouveauNiveau.elevation.trim() === "" || !Number.isFinite(elevation)) return;
              onCommandes([{ type: "niveau.creer", params: { nom: nouveauNiveau.nom.trim(), elevation, ordre: niveaux.length } }], `Niveau ${nouveauNiveau.nom.trim()}`);
              setNouveauNiveau(null);
            }}
          >
            <label>
              Nom
              <input value={nouveauNiveau.nom} onChange={(e) => setNouveauNiveau({ ...nouveauNiveau, nom: e.target.value })} onKeyDown={(e) => e.stopPropagation()} required />
            </label>
            <label>
              Altitude (m)
              <input inputMode="decimal" value={nouveauNiveau.elevation} onChange={(e) => setNouveauNiveau({ ...nouveauNiveau, elevation: e.target.value })} onKeyDown={(e) => e.stopPropagation()} required placeholder="à renseigner" />
            </label>
            <div className="nav-actions">
              <button type="submit">Créer</button>
              <button type="button" onClick={() => setNouveauNiveau(null)}>Annuler</button>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="nav-site">
        <h3 id="nav-site">Site</h3>
        <p className="nav-site" id="atelier-site-info">
          {etat.site.parcelle
            ? `${etat.site.parcelle.crs}${etat.site.parcelle.aire ? ` · parcelle ${etat.site.parcelle.aire.value.toFixed(2).replace(".", ",")} m²` : ""} · origine locale ${etat.site.parcelle.origineLocale.x.toFixed(2).replace(".", ",")} ; ${etat.site.parcelle.origineLocale.y.toFixed(2).replace(".", ",")}`
            : "Aucune parcelle transmise : repère local libre (étape 01 pour la rattacher au cadastre)."}
        </p>
      </section>

      <section aria-labelledby="nav-calques">
        <h3 id="nav-calques">Calques</h3>
        {calques.length === 0 ? (
          <p className="nav-vide">Aucun calque.</p>
        ) : (
          <ul className="nav-liste nav-calques">
            {calques.map((c) => (
              <li key={c.id}>
                <span className="nav-pastille" style={{ background: c.couleur ?? "transparent" }} aria-hidden="true" />
                <span className="nav-nom">{c.nom}</span>
                <button type="button" className="nav-bascule" aria-pressed={c.visible} title={c.visible ? "Masquer" : "Afficher"} disabled={readOnly} onClick={() => onCommandes([{ type: "calque.modifier", params: { id: c.id, visible: !c.visible } }], `${c.visible ? "Masquer" : "Afficher"} ${c.nom}`)}>
                  {c.visible ? "◉" : "○"}
                  <span className="sr-only">{c.visible ? `Masquer ${c.nom}` : `Afficher ${c.nom}`}</span>
                </button>
                <button type="button" className="nav-bascule" aria-pressed={c.verrouille} title={c.verrouille ? "Déverrouiller" : "Verrouiller"} disabled={readOnly} onClick={() => onCommandes([{ type: "calque.modifier", params: { id: c.id, verrouille: !c.verrouille } }], `${c.verrouille ? "Déverrouiller" : "Verrouiller"} ${c.nom}`)}>
                  {c.verrouille ? "🔒" : "🔓"}
                  <span className="sr-only">{c.verrouille ? `Déverrouiller ${c.nom}` : `Verrouiller ${c.nom}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="nav-objets" className="nav-objets">
        <h3 id="nav-objets">Objets du niveau</h3>
        <input type="search" className="nav-filtre" placeholder="Filtrer (nom, classe, identifiant)" aria-label="Filtrer les objets" value={filtre} onChange={(e) => setFiltre(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        {parClasse.length === 0 && <p className="nav-vide">{filtre ? "Aucun objet ne correspond." : "Aucun objet sur ce niveau : choisissez un outil de création."}</p>}
        {parClasse.map(([classe, liste]) => (
          <details key={classe} open={liste.length <= 12 || liste.some((o) => selection.has(o.id))}>
            <summary>
              {CLASSES[classe].libelle} <span className="nav-detail">{liste.length}</span>
            </summary>
            <ul className="nav-liste">
              {liste.slice(0, 300).map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    data-objet={o.id}
                    className={selection.has(o.id) ? "est-actif" : ""}
                    onClick={(e) => {
                      etatUi.selectionner([o.id], e.shiftKey);
                      onCentrer(o.id);
                    }}
                  >
                    {nomObjet(o)}
                  </button>
                </li>
              ))}
              {liste.length > 300 && <li className="nav-vide">… {liste.length - 300} de plus : filtrez pour les trouver.</li>}
            </ul>
          </details>
        ))}
      </section>
    </nav>
  );
}
