import { ROLES, type RoleId } from "../roles";

export default function Intro({ onChoose }: { onChoose: (role: RoleId) => void }) {
  return (
    <main className="grid min-h-full place-items-center bg-shell p-6">
      <div className="w-full max-w-3xl border border-rule bg-paper">
        <header className="border-b border-rule bg-shell px-5 py-3">
          <h1 className="text-lg font-semibold">Earth's Data Analysis Application</h1>
          <p className="text-dim">Climate change at any point on Earth, from NASA data.</p>
        </header>

        <div className="p-5">
          <h2 className="text-sm font-semibold">Who is using Earth's Data Analysis Application?</h2>
          <p className="mt-1 text-dim">
            Your choice sets which measurements are shown first and how much statistical detail you see.
            You can change it at any time from File &gt; Change role.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Object.values(ROLES).map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => onChoose(role.id)}
                className={`intro-role ${role.id === "curious" ? "intro-curious" : ""} flex flex-col border border-rule bg-paper p-4 text-left hover:border-accent hover:bg-shell`}
              >
                <span className="text-sm font-semibold">{role.id === "curious" ? "✨ " : ""}{role.title}</span>
                <span className="mt-2 flex-1">{role.summary}</span>
                <span className="mt-3 border-t border-rule pt-2 text-xs text-dim">{role.sees}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
