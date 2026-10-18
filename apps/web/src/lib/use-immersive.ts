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
      const height = `${Math.max(360, Math.floor(window.innerHeight - top - 24))}px`;
      if (workspace.style.getPropertyValue("--atelier-workspace-height") !== height) {
        workspace.style.setProperty("--atelier-workspace-height", height);
      }
      const bar = editor.querySelector<HTMLElement>(".atelier-n-barre");
      if (bar) {
        const bottom = Math.min(window.innerHeight, editor.getBoundingClientRect().bottom);
        workspace.style.setProperty("--atelier-menu-top", `${Math.ceil(bar.getBoundingClientRect().bottom + 4)}px`);
        workspace.style.setProperty("--atelier-menu-max-height", `${Math.max(88, Math.floor(bottom - bar.getBoundingClientRect().bottom - 12))}px`);
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
    window.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
      workspace?.style.removeProperty("--atelier-workspace-height");
      workspace?.style.removeProperty("--atelier-menu-max-height");
      workspace?.style.removeProperty("--atelier-menu-top");
      document.body.classList.remove(IMMERSIVE_CLASS);
    };
  }, [active]);
}
