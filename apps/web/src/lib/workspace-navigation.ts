import { createContext, useContext } from "react";
export const WorkspaceNavigation = createContext<{ openProjects: () => void }>({ openProjects: () => undefined });
export const useWorkspaceNavigation = () => useContext(WorkspaceNavigation);
