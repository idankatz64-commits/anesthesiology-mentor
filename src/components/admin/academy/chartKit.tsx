// Shared chrome for the academy dashboard charts. Deliberately mirrors the
// resident-facing stats dashboard (`.deep-tile` + generous padding) so the two
// dashboards read as one product.
import { ReactNode } from "react";

export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="deep-tile rounded-2xl p-5 sm:p-6">
      <header className="mb-5">
        <h3 className="text-base font-bold leading-tight">{title}</h3>
        {hint && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {hint}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground py-10 text-center leading-relaxed">
      {children}
    </p>
  );
}

export interface Chip {
  key: string;
  label: string;
  color: string;
}

/** Toggle row. An "on" chip is filled with its own series colour, so the chip and its line match. */
export function Chips({
  chips,
  active,
  onToggle,
}: {
  chips: Chip[];
  active: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {chips.map((chip) => {
        const on = active.has(chip.key);
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onToggle(chip.key)}
            aria-pressed={on}
            className="text-xs rounded-full px-3 py-1.5 border transition-colors"
            style={
              on
                ? {
                    background: chip.color,
                    borderColor: chip.color,
                    color: "#fff",
                  }
                : {
                    borderColor: "hsl(var(--border))",
                    color: "hsl(var(--muted-foreground))",
                  }
            }
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
