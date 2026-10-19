/**
 * Exemples Studio (`@parcours/atelier-model/studio-exemples`) : convertisseurs purs d'un exemple de Fadi vers des
 * commandes Studio. Point d'entrée séparé du paquet (comme `studio-corpus`) : les exports publics du paquet, figés par
 * la caractérisation, ne changent pas.
 */
export {
  CALQUE_NOMS_LOCAUX_P118, CLES_CONSOMMEES_P118, CONVENTION_HAUTEUR_TEXTE_P118, FAMILLES_P118, SOURCE_PROPRIETES_P118, VERSION_CONVERSION_P118,
  convertirExempleP118, convertirNiveauP118, lotsDeCommandes,
  type AbsentConversion, type ComptesConversion, type ConventionConversion, type ConversionExempleP118, type ConversionNiveauP118, type FamilleP118, type LigneConversion, type RefusConversion,
} from "./p118.js";
