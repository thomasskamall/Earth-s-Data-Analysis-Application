import { useEffect, useState } from "react";
import { searchCity, type CityHit } from "../api/client";
import type { Place } from "../App";

/** A number box that only reports its value when you press Enter or leave it. */
export function NumberBox(props: { id: string; value: number; min: number; max: number; step?: number; width: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);

  function commit() {
    const number = Number(draft);
    if (draft.trim() === "" || Number.isNaN(number)) return setDraft(String(props.value));
    const clamped = Math.min(props.max, Math.max(props.min, number));
    setDraft(String(clamped));
    if (clamped !== props.value) props.onCommit(clamped);
  }

  return (
    <input
      id={props.id}
      type="number"
      className={`field ${props.width}`}
      value={draft}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

export function CitySearch({ onSelect }: { onSelect: (place: Place) => void }) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<CityHit[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function search() {
    if (text.trim().length < 2) return;
    setMessage("Searching…");
    setHits(null);
    try {
      const found = await searchCity(text.trim());
      setHits(found);
      setMessage(found.length ? null : "No place found with that name.");
    } catch (problem) {
      setMessage(problem instanceof Error ? problem.message : "Search failed.");
    }
  }

  function close() {
    setHits(null);
    setMessage(null);
  }

  return (
    <form
      className="relative flex gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        search();
      }}
      onKeyDown={(event) => event.key === "Escape" && close()}
    >
      <input
        aria-label="Search a city"
        placeholder="Search a city"
        className="field w-36"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="btn">Search</button>
      {(hits?.length || message) && (
        <div className="absolute left-0 top-full z-20 mt-px w-72 border border-rule bg-paper shadow-md">
          {message && <p className="px-2 py-1 text-dim" role="status">{message}</p>}
          {hits?.map((hit) => (
            <button
              key={`${hit.lat},${hit.lon}`}
              type="button"
              className="block w-full px-2 py-1 text-left hover:bg-hover"
              onClick={() => {
                close();
                setText(hit.name);
                onSelect({ lat: hit.lat, lon: hit.lon, name: hit.name });
              }}
            >
              {hit.name} <span className="text-dim">{hit.region}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
