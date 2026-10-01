import { useState } from "react";

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  return (
    <div className="notification-bell">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 16v-5a6 6 0 1 0-12 0v5l-1.5 2.5h15L18 16Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="notification-popover">
          <p>Aucune notification pour l'instant.</p>
        </div>
      )}
    </div>
  );
}
