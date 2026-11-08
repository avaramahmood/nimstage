import { ACCENTS, ACCENT_KEYS, MAX_LINKS, type ArtistLink } from "@shared/artist";

/** Pick one of the fixed accent colours (decoration only: a glow around the page), or none. */
export function AccentPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options: [string, string][] = [["", "Default"], ...ACCENT_KEYS.map((k): [string, string] => [k, k[0].toUpperCase() + k.slice(1)])];
  return (
    <fieldset>
      <legend className="label">Accent colour</legend>
      <p className="mt-1 text-sm text-muted">A glow around your page. Optional.</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
        {options.map(([key, name]) => (
          <button
            key={key || "default"}
            type="button"
            role="radio"
            aria-checked={value === key}
            aria-label={name}
            onClick={() => onChange(key)}
            className={`grid h-11 w-11 place-items-center rounded-full border-2 ${value === key ? "border-ink" : "border-line"}`}
          >
            <span className="h-6 w-6 rounded-full border border-white/20" style={{ background: key ? ACCENTS[key as keyof typeof ACCENTS] : "transparent" }} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Up to four labelled https links. */
export function LinksEditor({ links, onChange }: { links: ArtistLink[]; onChange: (l: ArtistLink[]) => void }) {
  const set = (i: number, patch: Partial<ArtistLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <fieldset>
      <legend className="label">Links</legend>
      <p className="mt-1 text-sm text-muted">Up to {MAX_LINKS}. Full https:// addresses only.</p>
      <div className="mt-2 grid gap-3">
        {links.map((l, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <div className="grid gap-2">
              <input className="field" aria-label={`Link ${i + 1} label`} placeholder="Label, e.g. Instagram" maxLength={24} value={l.label} onChange={(e) => set(i, { label: e.target.value })} />
              <input className="field" aria-label={`Link ${i + 1} address`} placeholder="https://" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={200} value={l.url} onChange={(e) => set(i, { url: e.target.value })} />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove link ${i + 1}`} onClick={() => onChange(links.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        {links.length < MAX_LINKS && (
          <button type="button" className="btn btn-ghost btn-sm w-fit" onClick={() => onChange([...links, { label: "", url: "https://" }])}>
            Add a link
          </button>
        )}
      </div>
    </fieldset>
  );
}
