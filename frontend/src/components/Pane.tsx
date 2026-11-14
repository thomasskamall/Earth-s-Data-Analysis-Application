import type { ReactNode } from "react";

type Props = {
  title: string;
  kind: string;
  icon?: string;
  tools?: ReactNode;
  maximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
  children: ReactNode;
};

/** One of the four rectangles of the workbench. */
export default function Pane({ title, kind, icon, tools, maximized, onMaximize, onClose, children }: Props) {
  return (
    <section className={`pane pane-${kind} flex min-h-80 min-w-0 flex-col bg-paper md:min-h-0`} aria-label={title}>
      <header className="pane-head flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="flex-1 truncate text-xs font-semibold uppercase tracking-wide">{icon && <span className="pane-icon" aria-hidden="true">{icon}</span>}{title}</h2>
        {tools}
        <button type="button" className="btn px-2" onClick={onMaximize} aria-label={maximized ? `Restore ${title}` : `Maximize ${title}`} title={maximized ? "Restore" : "Maximize"}>
          {maximized ? "❐" : "□"}
        </button>
        <button type="button" className="btn px-2" onClick={onClose} aria-label={`Hide ${title}`} title="Hide (View menu shows it again)">
          ×
        </button>
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="absolute inset-0 grid place-items-center p-6 text-center text-dim">{children}</p>;
}
