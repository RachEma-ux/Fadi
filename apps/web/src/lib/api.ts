/**
 * Client HTTP minimal vers `apps/api`. Toujours `credentials: "include"`
 * (cookie de session httpOnly) ; jamais de jeton stocké en `localStorage`
 * (surface XSS inutile pour une session qui peut vivre dans un cookie).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null) ?? `http_${res.status}`;
    throw new ApiError(res.status, code);
  }
  return body as T;
}

export interface CurrentUser {
  id: string;
  email: string;
}

export interface Project {
  id: string;
  ownerId: string;
  code: string;
  name: string;
  modelRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface Level {
  id: string;
  projectId: string;
  label: string;
  elevation: number;
  position: number;
}

export interface ArchitecturalObjectDto {
  id: string;
  levelId: string;
  kind: string;
  properties: Record<string, unknown>;
  relations: { kind: string; targetId: string }[];
  modelRevision: number;
  createdAt: string;
}

export const api = {
  register: (email: string, password: string) =>
    request<CurrentUser>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<CurrentUser>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<CurrentUser>("/auth/me"),

  listProjects: () => request<Project[]>("/projects"),
  createProject: (code: string, name: string) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify({ code, name }) }),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  listLevels: (projectId: string) => request<Level[]>(`/projects/${projectId}/levels`),
  createLevel: (projectId: string, label: string, elevation: number, position: number) =>
    request<Level>(`/projects/${projectId}/levels`, {
      method: "POST",
      body: JSON.stringify({ label, elevation, position }),
    }),

  listObjects: (projectId: string, levelId: string) =>
    request<ArchitecturalObjectDto[]>(`/projects/${projectId}/levels/${levelId}/objects`),
  createObject: (
    projectId: string,
    levelId: string,
    kind: string,
    properties: Record<string, unknown>,
  ) =>
    request<ArchitecturalObjectDto>(`/projects/${projectId}/levels/${levelId}/objects`, {
      method: "POST",
      body: JSON.stringify({ kind, properties, relations: [] }),
    }),
  deleteObject: (projectId: string, levelId: string, objectId: string) =>
    request<void>(`/projects/${projectId}/levels/${levelId}/objects/${objectId}`, { method: "DELETE" }),
};
