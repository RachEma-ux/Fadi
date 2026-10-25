/**
 * « Éléments du dessin » (I.5-02) : liste accessible au clavier des objets et des cotes du brouillon, groupés par
 * calque. Chaque ligne montre le type, le calque, l'identifiant court et l'extrusion saisie. Clavier (focus itinérant,
 * une seule ligne dans l'ordre de tabulation) : flèches haut / bas, Début / Fin ; Entrée sélectionne la ligne seule,
 * Espace l'ajoute ou la retire ; Maj + flèche ou Maj + Espace étend la sélection en plage ; Ctrl+A sélectionne tout ;
 * Suppr supprime la sélection par la commande existante (`studio.dessin.supprimer`), puis le focus passe à la ligne
 * suivante. Une région vivante annonce la sélection et les changements du dessin. Au toucher, des boutons visibles et
 * nommés portent « Tout sélectionner » et « Supprimer la sélection » (jamais un geste caché).
 * La sélection est celle de la planche : la liste ne la duplique pas.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { STUDIO_TOOLS, type StudioDocument } from "@parcours/atelier-model";
import { Icon, type IconName } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { annonce, deplacer, focusApresSuppression, groupesElements, ordreElements, plage, TYPES_ELEMENT, type ElementListe, type ToucheListe } from "./liste-elements";
import { LIBELLES_RAISON_NON_NATIF } from "../import/import-ifc-ui";
import { NOM_CALQUE_DEFAUT } from "./calques";
import "./liste-elements.css";

export interface PropsListeElements {
  doc: StudioDocument;
  /** Sélection de la planche (identifiants valides). */
  selection: readonly string[];
  modifiable: boolean;
  surSelection: (ids: string[]) => void;
  /** Supprime la sélection courante (commande existante de la barre). */
  surSupprimer: () => void;
  /** Retire les éléments non natifs cochés (`studio.nonnatif.retirer`, lot F3) ; vrai si le modèle l'accepte. */
  surRetirerNonNatifs?: (ids: string[]) => boolean;
}

const ICONE_SUPPRIMER = (STUDIO_TOOLS.find((t) => t.toolId === "studio.dessin.supprimer")?.iconeSymbolique ?? "studio-delete") as IconName;
const ICONE_RETIRER_NON_NATIFS = (STUDIO_TOOLS.find((t) => t.toolId === "studio.nonnatif.retirer")?.iconeSymbolique ?? "studio-non-native-remove") as IconName;
const nombre = (v: number) => v.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const TOUCHES: Record<string, ToucheListe> = { ArrowDown: "suivant", ArrowUp: "precedent", Home: "premier", End: "dernier" };

function texteExtrusion(e: ElementListe): string {
  if (e.type === "dimension") return e.aResoudre ? "à résoudre" : "cote";
  if (!e.extrusion) return "plat";
  return `extrudé : hauteur ${nombre(e.extrusion.height)} m, base ${nombre(e.extrusion.base)} m`;
}

export function ListeElements({ doc, selection, modifiable, surSelection, surSupprimer, surRetirerNonNatifs }: PropsListeElements) {
  const groupes = useMemo(() => groupesElements(doc), [doc]);
  const ordre = useMemo(() => ordreElements(groupes), [groupes]);
  const selectionnables = useMemo(() => new Set(groupes.flatMap((g) => g.elements.filter((e) => e.selectionnable).map((e) => e.id))), [groupes]);
  const choisis = new Set(selection);
  const [courant, setCourant] = useState<string | null>(null);
  const [ancre, setAncre] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const liste = useRef<HTMLDivElement>(null);
  /** Ligne à focaliser après le prochain rendu (déplacement au clavier, suppression). */
  const aFocaliser = useRef<{ id: string; supprimes?: string[] } | null>(null);
  const precedent = useRef<{ selection: number; total: number } | null>(null);

  // La ligne courante reste valide : si elle a disparu (annulation, rechargement), la première prend le relais.
  const actuel = courant !== null && ordre.includes(courant) ? courant : (ordre[0] ?? null);

  useEffect(() => {
    const cible = aFocaliser.current;
    if (!cible) return;
    // Après une suppression, on attend que le dessin ait bien perdu les éléments supprimés (commande acceptée).
    if (cible.supprimes && cible.supprimes.some((id) => ordre.includes(id))) return;
    aFocaliser.current = null;
    liste.current?.querySelector<HTMLElement>(`[data-studio-element="${CSS.escape(cible.id)}"]`)?.focus();
  });

  // Région vivante : la sélection et les changements du nombre d'éléments.
  useEffect(() => {
    const apres = { selection: selection.length, total: ordre.length };
    const texte = annonce(precedent.current, apres);
    precedent.current = apres;
    if (texte) setMessage(texte);
  }, [selection.length, ordre.length]);

  function aller(id: string | null) {
    if (!id) return;
    setCourant(id);
    aFocaliser.current = { id };
  }
  function choisir(id: string, mode: "seul" | "basculer" | "plage") {
    if (!selectionnables.has(id)) { setMessage("Cet élément est sur un calque masqué ou verrouillé : il ne se sélectionne pas."); return; }
    if (mode === "plage") { surSelection(plage(ordre, ancre ?? actuel, id, selectionnables)); return; }
    setAncre(id);
    if (mode === "seul") surSelection([id]);
    else surSelection(choisis.has(id) ? selection.filter((x) => x !== id) : [...selection, id]);
  }
  function supprimer() {
    if (!modifiable) { setMessage("Lecture seule : la suppression est indisponible."); return; }
    if (!selection.length) { setMessage("Sélectionnez d’abord l’élément à supprimer."); return; }
    const suivant = focusApresSuppression(ordre, selection, actuel);
    if (suivant) { setCourant(suivant); aFocaliser.current = { id: suivant, supprimes: [...selection] }; }
    surSupprimer();
  }
  function touche(e: KeyboardEvent<HTMLDivElement>, id: string) {
    const deplacement = TOUCHES[e.key];
    let traite = true;
    if (deplacement && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const cible = deplacer(ordre, id, deplacement);
      if (cible) { aller(cible); if (e.shiftKey) surSelection(plage(ordre, ancre ?? id, cible, selectionnables)); }
    } else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) choisir(id, "seul");
    else if (e.key === " " && !e.ctrlKey && !e.altKey) choisir(id, e.shiftKey ? "plage" : "basculer");
    else if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) surSelection([...ordre.filter((x) => selectionnables.has(x))]);
    else if (e.key === "Delete" && !e.ctrlKey && !e.shiftKey && !e.altKey) supprimer();
    else traite = false;
    // Les touches de la liste ne déclenchent pas les raccourcis de la planche (Espace, Suppr, Ctrl+A) une seconde fois.
    if (traite) { e.preventDefault(); e.stopPropagation(); }
  }
  function clic(e: MouseEvent<HTMLDivElement>, id: string) {
    setCourant(id);
    choisir(id, e.shiftKey ? "plage" : e.ctrlKey || e.metaKey ? "basculer" : "seul");
  }

  return (
    <section className="studio-elements" aria-labelledby="studio-elements-titre" data-studio-elements>
      <h3 id="studio-elements-titre">Éléments du dessin</h3>
      <p className="studio-elements-aide" id="studio-elements-aide">Flèches, Début et Fin : parcourir ; Entrée : sélectionner ; Espace : ajouter ou retirer ; Maj : plage ; Ctrl+A : tout ; Suppr : supprimer la sélection.</p>
      <div className="studio-elements-actions">
        <button type="button" onClick={() => surSelection([...ordre.filter((x) => selectionnables.has(x))])} disabled={!selectionnables.size} data-studio-elements-tout>
          <Icon name="studio-select-all" size={18} /> Tout sélectionner
        </button>
        <button type="button" onClick={supprimer} disabled={!modifiable || !selection.length} data-studio-elements-supprimer>
          <Icon name={ICONE_SUPPRIMER} size={18} /> Supprimer la sélection
        </button>
      </div>
      {ordre.length === 0 ? <p className="studio-elements-vide">Aucun élément dans le dessin.</p> : (
        <div ref={liste} role="listbox" aria-multiselectable="true" aria-labelledby="studio-elements-titre" aria-describedby="studio-elements-aide" className="studio-elements-liste" data-studio-elements-liste>
          {groupes.map((g) => {
            const titre = `studio-elements-calque-${g.layerId}`;
            const nom = g.nom === null ? <span>Calque inconnu</span> : g.implicite || g.nom === NOM_CALQUE_DEFAUT ? <span>{g.nom}</span> : <span translate="no">{g.nom}</span>;
            return (
              <div role="group" aria-labelledby={titre} key={g.layerId} data-studio-elements-calque={g.layerId}>
                {/* Libellé du groupe (lu par aria-labelledby) : masqué de l'arbre pour ne pas être un enfant non admis de la liste. */}
                <div className="studio-elements-calque" id={titre} aria-hidden="true">
                  {nom}
                  <small>{`(${g.elements.length})`}</small>
                  {!g.visible && <small>masqué</small>}
                  {g.locked && <small>verrouillé</small>}
                </div>
                {g.elements.map((el) => (
                  <div key={el.id} role="option" tabIndex={el.id === actuel ? 0 : -1} aria-selected={choisis.has(el.id)} aria-disabled={!el.selectionnable || undefined}
                    className="studio-element" data-studio-element={el.id} onKeyDown={(e) => touche(e, el.id)} onClick={(e) => clic(e, el.id)} onFocus={() => setCourant(el.id)}>
                    <span className="studio-element-type">{TYPES_ELEMENT[el.type as keyof typeof TYPES_ELEMENT] ?? el.type}</span>
                    <span className="studio-element-calque">{nom}</span>
                    <span className="studio-element-id" translate="no" title={el.id}>{el.court}</span>
                    <span className="studio-element-extrusion">{texteExtrusion(el)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <NonNatifs doc={doc} modifiable={modifiable} surRetirer={surRetirerNonNatifs} />
      <p className="sr-only" role="status" aria-live="polite" data-studio-elements-annonce>{message}</p>
    </section>
  );
}

/**
 * Éléments non natifs (lot F3, TEST-028) : ce qu'un import n'a pas traduit, conservé avec son origine (format, type,
 * identifiant, nom) et sa raison. Ils ne se sélectionnent pas sur la planche et ne s'éditent pas ; seuls les cases et
 * « Retirer les éléments non natifs » (Maj+F8) agissent, par la commande `studio.nonnatif.retirer`. Exclus des métrés.
 */
export function NonNatifs({ doc, modifiable, surRetirer }: { doc: StudioDocument; modifiable: boolean; surRetirer?: (ids: string[]) => boolean }) {
  const liste = doc.nonNatifs ?? [];
  const [coches, setCoches] = useState<string[]>([]);
  const valides = coches.filter((id) => liste.some((n) => n.id === id));
  if (!liste.length) return null;
  const nomCalque = (id: string | undefined) => (id ? doc.layers?.find((l) => l.id === id)?.name ?? null : null);
  return (
    <section className="studio-non-natifs" aria-labelledby="studio-non-natifs-titre" data-studio-non-natifs={liste.length}>
      <h4 id="studio-non-natifs-titre">{`Éléments non natifs (${liste.length})`}</h4>
      <p className="studio-elements-aide">Importés sans équivalent natif : conservés tels quels, non éditables, exclus des métrés et des exports.</p>
      <ul className="studio-non-natifs-liste">{liste.map((n) => {
        const calque = nomCalque(n.layerId);
        return <li key={n.id} data-studio-non-natif={n.id} data-raison={n.raison} data-format={n.origine.format}>
          <label>
            <input type="checkbox" checked={valides.includes(n.id)} disabled={!modifiable} onChange={(e) => setCoches(e.target.checked ? [...valides, n.id] : valides.filter((x) => x !== n.id))} data-studio-non-natif-coche={n.id} />
            <span className="studio-non-natif-etat" data-studio-etat="non-natif">non natif</span>{" "}
            <span translate="no">{n.origine.entite}</span>
            {n.origine.nom && <> — <span translate="no">{n.origine.nom}</span></>}
          </label>
          <small>
            <span>{LIBELLES_RAISON_NON_NATIF[n.raison]}</span>
            {n.detail && <> (<code translate="no">{n.detail}</code>)</>}
            {n.origine.identifiant && <> · <span>Identifiant d’origine</span> <code translate="no">{n.origine.identifiant}</code></>}
            {calque !== null && <> · <span>Calque</span> <span translate="no">{calque}</span></>}
          </small>
        </li>;
      })}</ul>
      <button type="button" disabled={!modifiable || !valides.length || !surRetirer} onClick={() => { if (surRetirer?.(valides)) setCoches([]); }} data-studio-nonnatif-retirer>
        <Icon name={ICONE_RETIRER_NON_NATIFS} size={18} /> Retirer les éléments non natifs
      </button>
    </section>
  );
}
