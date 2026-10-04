/**
 * Barre de commandes contextuelle (L3a.1, maquette D-022). Module pur.
 *
 * - **Essentiel** : outils de niveau « essentiel », à plat (outils du prototype).
 * - **Contextuel** : les mêmes, plus une rangée des outils de niveau « contextuel » activables maintenant
 *   (sélection courante, niveau actif) : la barre suit le contexte.
 * - **Complet** : onglets par famille (Créer, Modifier, Connecter, Analyser, Documenter, Partager) avec effectifs,
 *   tous niveaux.
 * Les favoris épinglés précèdent toujours la barre, quel que soit leur niveau.
 */
import { FAMILLES_OUTIL, type Activation, type DefinitionOutil, type FamilleOutil, type NiveauAffichage } from "../socle";
import { LIBELLES_FAMILLE } from "./palette";

export interface GroupeBarre {
  readonly cle: string;
  readonly titre: string;
  readonly outils: readonly DefinitionOutil[];
}

export interface OngletFamille {
  readonly famille: FamilleOutil;
  readonly libelle: string;
  readonly nombre: number;
}

export interface ModeleBarre {
  readonly favoris: readonly DefinitionOutil[];
  readonly groupes: readonly GroupeBarre[];
  /** Onglets de familles (niveau Complet seulement), vide sinon. */
  readonly familles: readonly OngletFamille[];
}

export interface OptionsBarre {
  readonly outils: readonly DefinitionOutil[];
  readonly niveau: NiveauAffichage;
  readonly favoris: readonly string[];
  /** Famille ouverte au niveau Complet. */
  readonly famille: FamilleOutil;
  readonly activation: (o: DefinitionOutil) => Activation;
}

export function modeleBarre(o: OptionsBarre): ModeleBarre {
  const favoris = o.favoris.map((id) => o.outils.find((d) => d.id === id)).filter((d): d is DefinitionOutil => d !== undefined);
  const essentiels = o.outils.filter((d) => d.niveau === "essentiel");
  if (o.niveau === "essentiel") return { favoris, groupes: [{ cle: "essentiel", titre: "Outils", outils: essentiels }], familles: [] };
  if (o.niveau === "contextuel") {
    const contexte = o.outils.filter((d) => d.niveau === "contextuel" && o.activation(d).ok);
    const groupes: GroupeBarre[] = [{ cle: "essentiel", titre: "Outils", outils: essentiels }];
    groupes.push({ cle: "contexte", titre: "Pour la sélection", outils: contexte });
    return { favoris, groupes, familles: [] };
  }
  const familles = FAMILLES_OUTIL.map((f) => ({ famille: f, libelle: LIBELLES_FAMILLE[f], nombre: o.outils.filter((d) => d.famille === f).length }));
  return { favoris, groupes: [{ cle: `famille-${o.famille}`, titre: LIBELLES_FAMILLE[o.famille], outils: o.outils.filter((d) => d.famille === o.famille) }], familles };
}
