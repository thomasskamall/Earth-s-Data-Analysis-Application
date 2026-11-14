import { useEffect, useRef, useState } from "react";

export type MenuItem =
  | { separator: true }
  | { label: string; onClick?: () => void; checked?: boolean; disabled?: boolean; separator?: false };

export type Menu = { title: string; items: MenuItem[] };

/** The File / View / Data ... bar at the top of the window. */
export default function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const away = (event: MouseEvent) => {
      if (!bar.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={bar} role="menubar" className="menubar flex items-stretch border-b border-rule bg-shell px-1">
      <span className="app-brand px-3 py-1 font-semibold">🌍 <span className="brand-long">Earth's Data Analysis Application</span><span className="brand-short">Earth's Data Analysis</span></span>
      {menus.map((menu, index) => (
        <div key={menu.title} className={`relative ${index >= 4 ? "menu-end" : ""}`}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === index}
            onClick={() => setOpen(open === index ? null : index)}
            onMouseEnter={() => open !== null && setOpen(index)}
            className={`h-full px-3 py-1 hover:bg-hover ${open === index ? "bg-hover" : ""}`}
          >
            {menu.title}
          </button>
          {open === index && (
            <div
              role="menu"
              className="absolute left-0 top-full z-30 max-h-[70vh] min-w-60 overflow-y-auto border border-rule bg-paper py-1 shadow-md"
            >
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} className="my-1 border-t border-rule" />
                ) : (
                  <button
                    key={i}
                    type="button"
                    role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                    aria-checked={item.checked}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.onClick?.();
                    }}
                    className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-1 text-left hover:bg-hover disabled:text-dim disabled:hover:bg-paper"
                  >
                    <span className="w-3 text-accent">{item.checked ? "✓" : ""}</span>
                    {item.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
