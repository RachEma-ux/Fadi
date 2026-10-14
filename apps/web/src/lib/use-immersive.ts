/**
 * Atelier workspace (module and steps 10 / 11). Since the approved project
 * layout of 2026-10-14, opening the editor must NOT hide Fadi's header, rail
 * or module navigation. Keep the existing hook/export names for callers;
 * the marker now describes an embedded workspace, never automatic fullscreen.
 */
import { useEffect } from "react";

export const IMMERSIVE_CLASS = "atelier-workspace";

export function useImmersive(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add(IMMERSIVE_CLASS);
    const workspace = document.getElementById("workspace-content");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const editor = workspace?.querySelector<HTMLElement>(".atelier-n");
      if (!workspace || !editor) return;
      // Document-relative top remains stable when the page is scrolled.
      // Minimum height preserves a usable drawing area on short/mobile screens.
      const top = editor.getBoundingClientRect().top + window.scrollY;
      const height = `${Math.max(520, Math.floor(window.innerHeight - top - 24))}px`;
      if (workspace.style.getPropertyValue("--atelier-workspace-height") !== height) {
        workspace.style.setProperty("--atelier-workspace-height", height);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    // The workspace resizes when the lazy editor arrives. No mutation observer
    // over drawing geometry is needed during pointer movements.
    for (const element of [workspace, document.querySelector(".fadi-topbar"),
      document.querySelector(".module-nav"), document.querySelector(".project-header")]) {
      if (element) observer.observe(element);
    }
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      workspace?.style.removeProperty("--atelier-workspace-height");
      document.body.classList.remove(IMMERSIVE_CLASS);
    };
  }, [active]);
}
