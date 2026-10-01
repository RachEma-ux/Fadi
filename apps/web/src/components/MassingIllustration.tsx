/**
 * Illustration décorative : masses bâties abstraites, pas un rendu du
 * projet réel. `docs/architecture.md` et AGENTS.md interdisent d'inventer
 * des données de projet — on ne génère donc jamais une image prétendant
 * montrer "le" bâtiment de l'utilisateur. Ceci est un motif générique,
 * dessiné à la main, dans la palette de l'application.
 */
export function MassingIllustration() {
  return (
    <svg viewBox="0 0 400 220" role="presentation" aria-hidden="true" className="massing-illustration">
      <rect x="0" y="0" width="400" height="220" fill="#eef3ef" />
      {/* sol */}
      <line x1="0" y1="178" x2="400" y2="178" stroke="#c7d6cd" strokeWidth="1" />
      {/* volume arrière */}
      <path d="M150 178 L150 96 L230 70 L310 96 L310 178 Z" fill="#cedfd4" stroke="#8fae9d" strokeWidth="1.5" />
      <path d="M150 96 L230 70 L310 96 L230 118 Z" fill="#dde9e1" stroke="#8fae9d" strokeWidth="1.5" />
      {/* volume avant, plus clair, en surplomb */}
      <path d="M60 178 L60 118 L160 100 L160 178 Z" fill="#ffffff" stroke="#173f35" strokeWidth="1.5" />
      <path d="M60 118 L160 100 L228 116 L128 136 Z" fill="#f2f6f3" stroke="#173f35" strokeWidth="1.5" />
      {/* ouvertures */}
      <rect x="76" y="138" width="20" height="30" fill="#173f35" opacity="0.55" />
      <rect x="104" y="138" width="20" height="30" fill="#173f35" opacity="0.55" />
      <rect x="132" y="134" width="18" height="34" fill="#173f35" opacity="0.4" />
      {/* toiture plantée, trait fin */}
      <path
        d="M66 116 L96 109 M106 113 L136 106 M146 110 L156 108"
        stroke="#4f7a63"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* ligne de sol / limite de parcelle */}
      <path d="M20 178 L380 178" stroke="#8fae9d" strokeWidth="1" strokeDasharray="2 4" />
    </svg>
  );
}
