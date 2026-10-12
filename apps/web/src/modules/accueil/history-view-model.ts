import type { HistoryEvent } from "../../lib/api";

export const HISTORY_AREAS: Record<string, string> = {
  projet: "Dossier",
  harmonie: "Harmonie",
  programme: "Programme",
  modele: "Modèle",
  parcelle: "Parcelle",
  revue: "Revue technique",
  maptiler: "Données du site",
  document: "Documents",
  commentaire: "Commentaires",
  enregistrement: "Enregistrement serveur",
};

export interface HistoryFilters {
  from: string;
  to: string;
  author: string;
  area: string;
  change: string;
  project: string;
}

export const EMPTY_HISTORY_FILTERS: HistoryFilters = { from: "", to: "", author: "", area: "", change: "", project: "" };
export const UNKNOWN_HISTORY_AUTHOR = "__unrecorded__";
export const HISTORY_TIME_ZONE = "Europe/Zurich";
const searchable = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
const historyMinuteFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: HISTORY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Clé de minute civile de Zurich, indépendante du fuseau et de la langue de l'appareil. */
export function historyMinuteKey(at: string): string | null {
  const instant = new Date(at);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = historyMinuteFormatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function invalidHistoryPeriod(filters: HistoryFilters): boolean {
  return !!filters.from && !!filters.to && filters.from > filters.to;
}

/**
 * Les bornes saisies sont des minutes civiles de Zurich, toutes deux incluses.
 * Elles ne sont jamais interprétées comme des dates dans le fuseau de l'appareil.
 * Au retour à l'heure d'hiver, les deux occurrences d'une minute répétée sont incluses.
 */
export function filterHistory(events: HistoryEvent[], filters: HistoryFilters): HistoryEvent[] {
  if (invalidHistoryPeriod(filters)) return [];
  const needle = searchable(filters.change);
  return events.filter((event) => {
    const minute = historyMinuteKey(event.at);
    return minute !== null && (!filters.from || minute >= filters.from) && (!filters.to || minute <= filters.to)
      && (!filters.author || (event.authorId ?? UNKNOWN_HISTORY_AUTHOR) === filters.author)
      && (!filters.area || event.kind === filters.area)
      && (!filters.project || event.project.id === filters.project)
      && (!needle || searchable(`${event.label} ${event.detail}`).includes(needle));
  });
}

/** Un lien ouvre l'écran courant du même dossier ; il ne prétend pas restaurer une ancienne révision. */
export function historyDestination(event: HistoryEvent): { to: string; label: string } {
  const base = `/projets/${encodeURIComponent(event.project.id)}`;
  if (event.kind === "modele" || event.kind === "enregistrement") return { to: `${base}?module=atelier`, label: "Ouvrir l’Atelier du dossier" };
  if (event.kind === "programme") return { to: `${base}?module=programmation`, label: "Ouvrir le programme du dossier" };
  if (event.kind === "revue") return { to: `${base}?module=parcours&etape=11&bilan=1`, label: "Consulter la revue" };
  if (event.kind === "document") return { to: `${base}?module=documents`, label: "Ouvrir les documents du dossier" };
  if (event.kind === "commentaire") return { to: `${base}?module=collaboration`, label: "Ouvrir les commentaires du dossier" };
  if (event.stepNumber !== null && Number.isInteger(event.stepNumber) && event.stepNumber >= 1 && event.stepNumber <= 21) return { to: `${base}?module=parcours&etape=${event.stepNumber}`, label: "Ouvrir l’étape concernée" };
  return { to: base, label: "Ouvrir le dossier" };
}
