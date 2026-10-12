/** Last consultation is a navigation preference, never a project selection inferred from updatedAt. */
import { useSyncExternalStore } from "react";

export type DossierWork = "parcours" | "programme" | "atelier" | "review";
export interface DossierVisit { projectId: string; consultedAt: string; step: number | null; currentWork: DossierWork | null }
const memory = new Map<string, string | null>();
const stepsInMemory = new Map<string, number>();
const workInMemory = new Map<string, DossierWork>();
const listeners = new Set<() => void>();
const key = (userId: string) => `fadi.lastDossier.v1:${userId}`;
let listening = false;
const validWork = (value: unknown): value is DossierWork => ["parcours", "programme", "atelier", "review"].includes(value as string);

function readRaw(userId: string): string | null {
  if (memory.has(userId)) return memory.get(userId) ?? null;
  try { return localStorage.getItem(key(userId)); } catch { return null; }
}
export function parseDossierVisit(raw: string | null): DossierVisit | null {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object") return null;
    const v = value as Partial<DossierVisit>;
    if (typeof v.projectId !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(v.projectId) || typeof v.consultedAt !== "string" || !Number.isFinite(Date.parse(v.consultedAt))) return null;
    return { projectId: v.projectId, consultedAt: v.consultedAt, step: typeof v.step === "number" && Number.isInteger(v.step) && v.step >= 1 && v.step <= 21 ? v.step : null, currentWork: validWork(v.currentWork) ? v.currentWork : null };
  } catch { return null; }
}
function subscribe(listener: () => void) {
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key?.startsWith("fadi.lastDossier.v1:") || event.key?.startsWith("fadi.lastStep.v1:") || event.key?.startsWith("fadi.lastWork.v1:") || event.key === null) {
        memory.clear();
        stepsInMemory.clear();
        workInMemory.clear();
        listeners.forEach((l) => l());
      }
    });
    listening = true;
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function rememberDossier(userId: string, projectId: string, step?: number, currentWork?: DossierWork): void {
  const previous = parseDossierVisit(readRaw(userId));
  const stepKey = `fadi.lastStep.v1:${userId}:${projectId}`;
  const nextStep = step && Number.isInteger(step) && step >= 1 && step <= 21 ? step : previous?.projectId === projectId ? previous.step : rememberedStep(userId, projectId);
  if (nextStep) {
    stepsInMemory.set(stepKey, nextStep);
    try { localStorage.setItem(stepKey, String(nextStep)); } catch { /* The current tab still knows this step. */ }
  }
  const workKey = `fadi.lastWork.v1:${userId}:${projectId}`;
  const nextWork = currentWork ?? (previous?.projectId === projectId ? previous.currentWork : rememberedWork(userId, projectId));
  if (nextWork) {
    workInMemory.set(workKey, nextWork);
    try { localStorage.setItem(workKey, nextWork); } catch { /* The current tab still knows the explicitly opened module. */ }
  }
  const value = JSON.stringify({ projectId, step: nextStep, currentWork: nextWork, consultedAt: new Date().toISOString() });
  memory.set(userId, value);
  try { localStorage.setItem(key(userId), value); } catch { /* This tab retains the choice; the UI discloses unavailable persistence. */ }
  listeners.forEach((l) => l());
}
export function rememberedStep(userId: string, projectId: string): number | null {
  const stepKey = `fadi.lastStep.v1:${userId}:${projectId}`;
  const inMemory = stepsInMemory.get(stepKey);
  if (inMemory) return inMemory;
  try { const value = Number(localStorage.getItem(stepKey)); return Number.isInteger(value) && value >= 1 && value <= 21 ? value : null; } catch { return null; }
}
export function rememberedWork(userId: string, projectId: string): DossierWork | null {
  const workKey = `fadi.lastWork.v1:${userId}:${projectId}`;
  const inMemory = workInMemory.get(workKey);
  if (inMemory) return inMemory;
  try { const value = localStorage.getItem(workKey); return validWork(value) ? value : null; } catch { return null; }
}
export function useLastDossier(userId: string | undefined): DossierVisit | null {
  const raw = useSyncExternalStore(subscribe, () => userId ? readRaw(userId) : null, () => null);
  return parseDossierVisit(raw);
}
export function dossierChoiceIsPersisted(userId: string): boolean {
  try { return localStorage.getItem(key(userId)) === readRaw(userId); } catch { return false; }
}
