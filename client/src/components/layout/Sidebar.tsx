import { useUsers } from "@/hooks/useUsers";
import { getAvatarGradient } from "../../utils";
import useStore from "../../store";

export default function Sidebar() {
  const openProfile = useStore((s) => s.openProfile);
  const { data, isLoading } = useUsers();

  if (isLoading) {
    return (
      <div className="bg-white border rounded-xl p-5 shadow-xs" style={{ borderColor: "var(--border)" }} aria-busy="true">
        <h3 className="text-sm font-bold mb-4 tracking-tight" style={{ color: "var(--text)" }}>Membres</h3>
        <div className="flex flex-col gap-1" role="status" aria-label="Chargement des membres">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row" aria-hidden="true">
              <div className="skeleton skeleton-avatar" />
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="skeleton skeleton-line" style={{ width: "55%" }} />
                <div className="skeleton skeleton-line" style={{ width: "35%", height: "10px" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const users = data?.users || [];

  return (
    <>
      {/* Membres */}
      <div className="bg-white border rounded-xl p-5 shadow-xs" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-sm font-bold mb-4 tracking-tight" style={{ color: "var(--text)" }}>Membres</h3>
        <div className="flex flex-col gap-1">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-2 px-2 rounded-lg transition-colors duration-150">
              <div className="relative flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-full grid place-items-center font-bold text-xs text-white"
                  style={{ background: getAvatarGradient(u.id) }}
                  aria-hidden="true"
                >
                  {u.name.charAt(0)}
                </div>
                {u.isOnline && (
                  <span
                    className="absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white rounded-full"
                    style={{ background: "var(--success)" }}
                    title="En ligne"
                  />
                )}
              </div>
              <button
                type="button"
                className="text-left bg-transparent border-none p-0 cursor-pointer font-[inherit]"
                style={{ color: "var(--text)" }}
                onClick={() => openProfile?.(u)}
                aria-label={`Voir le profil de ${u.name}`}
              >
                <span className="font-semibold text-sm block transition-opacity duration-150 hover:opacity-75">
                  {u.name}
                </span>
                <span className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                  {u.postCount} publication{u.postCount > 1 ? "s" : ""}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
