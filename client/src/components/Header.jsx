import { getAvatarGradient } from "../utils";
import useStore from "../store";

const NAV_ITEMS = [
  {
    key: "feed",
    label: "Accueil",
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    key: "chat",
    label: "Messages",
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    key: "search",
    label: "Recherche",
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
];

export default function Header({ user: currentUser, onSignOut }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const logout = async () => {
    await onSignOut();
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-[100] border-b border-[var(--border)]" style={{ background: "rgba(250, 251, 252, 0.85)", backdropFilter: "blur(16px) saturate(180%)", WebkitBackdropFilter: "blur(16px) saturate(180%)" }}>
      <div className="max-w-[1120px] mx-auto py-3 px-6 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => setView("feed")}>
          <div className="w-8 h-8 rounded-[10px] grid place-items-center text-white font-bold text-sm" style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}>
            M
          </div>
          <span className="text-[1.05rem] font-bold tracking-[-0.02em] text-[var(--text)]">
            Mini<span className="text-[var(--accent)]">Social</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1 bg-[var(--surface-sunken)] rounded-full p-1">
          {NAV_ITEMS.map(({ key, label, icon }) => {
            const active = view === key;
            return (
              <button
                key={key}
                className={`flex items-center gap-1.5 py-[6px] px-4 border-none rounded-full font-medium text-[0.8rem] cursor-pointer transition-all duration-200 font-[inherit] ${
                  active
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
                }`}
                onClick={() => setView(key)}
              >
                {icon(active)}
                <span className="max-[700px]:hidden">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* User badge + Logout */}
        {currentUser && (
          <div className="flex items-center gap-2 cursor-default">
            <div className="flex items-center gap-2 py-1 px-1 pr-3 rounded-full bg-[var(--surface-sunken)] text-[0.8rem] font-medium text-[var(--text)]">
              <div
                className="w-7 h-7 rounded-full grid place-items-center text-[0.65rem] font-bold text-white relative"
                style={{ background: getAvatarGradient(currentUser.id) }}
              >
                {currentUser.name.charAt(0)}
              </div>
              <span className="max-[860px]:hidden">{currentUser.name}</span>
            </div>
            <button
              className="w-[34px] h-[34px] rounded-full grid place-items-center cursor-pointer transition-all duration-150 hover:bg-[var(--surface-hover)]"
              style={{ border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
              onClick={logout}
              title="Se déconnecter"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
