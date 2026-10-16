"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChoicePreview } from "./choice-preview";
import { useGeneration, type HistoryEntry } from "./generation-provider";
import { RequestId } from "./request-id";
import { DownloadButton } from "./download-button";
import { tokenRequestId } from "@/lib/job-token";
import { flatlayLabel } from "@/lib/flatlay";
import { QUALITIES } from "@/lib/quality";
import styles from "./history-panel.module.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function entryStatus(entry: HistoryEntry) {
  if (entry.upscale && (entry.phase === "submitting" || entry.phase === "running")) return `Upscaling to ${entry.upscale.toUpperCase()}…`;
  if (entry.kind === "flatlay" && (entry.phase === "submitting" || entry.phase === "running")) return "Laying out your flat lay…";
  if (entry.kind === "pose" && (entry.phase === "submitting" || entry.phase === "running")) return "Posing the mannequin…";
  if (entry.phase === "submitting") return "Preparing your images…";
  if (entry.phase === "queued") return entry.queuePosition ? `In queue · ${entry.queuePosition} ahead` : "Waiting for generation…";
  if (entry.phase === "running") return "Creating your new look…";
  if (entry.phase === "paused") return "Status check paused";
  return entry.error ?? "Generation could not be completed";
}

function HistoryCard({ entry, onRestore }: { entry: HistoryEntry; onRestore: () => void }) {
  const { busy, trackEntry, restoreEntry } = useGeneration();
  const running = ["submitting", "queued", "running"].includes(entry.phase);
  const requestId = entry.image && entry.token ? tokenRequestId(entry.token) : undefined;
  return (
    <li className={styles.entry} data-phase={entry.phase}>
      {entry.upscale || entry.kind ? (
        <span className={styles.badges}>
          {entry.kind ? <span className={styles.flatlayBadge}>{entry.kind === "pose" ? "Pose" : "Flatlay"}</span> : null}
          {entry.upscale ? <span className={styles.upscaleBadge}>{entry.upscale.toUpperCase()} upscale</span> : null}
        </span>
      ) : null}
      {entry.image ? (
        <button
          type="button"
          className={styles.result}
          disabled={busy}
          aria-label="Open this generation with its photo and settings"
          title={busy ? "Wait until the current generation has finished" : "Open with its photo and settings"}
          onClick={() => { restoreEntry(entry.id); onRestore(); }}
        >
          <Image src={entry.image} alt="" fill unoptimized sizes="340px" />
        </button>
      ) : (
        <div className={styles.placeholder} role={running ? "status" : undefined}>
          {running ? <span className={styles.spinner} aria-hidden="true" /> : null}
          <p>{entryStatus(entry)}</p>
          {entry.phase === "paused" && entry.token ? (
            <button type="button" className={styles.check} disabled={busy} title={busy ? "Another generation is running" : undefined} onClick={() => trackEntry(entry.id)}>Check status</button>
          ) : null}
        </div>
      )}
      <div className={styles.meta}>
        <time dateTime={entry.createdAt ? new Date(entry.createdAt).toISOString() : undefined}>
          {entry.createdAt ? dateFormat.format(entry.createdAt) : "Earlier generation"}
        </time>
        {entry.image ? <DownloadButton href={entry.image} small upscale={entry.upscale} /> : null}
      </div>
      {requestId ? <RequestId id={requestId} className={styles.requestId} /> : null}
      {entry.kind === "flatlay" && entry.parts || entry.quality || entry.size ? (
        <p className={styles.parts}>{[entry.kind === "flatlay" && entry.parts ? flatlayLabel(entry.parts) : "", entry.quality ? `${QUALITIES.find(({ id }) => id === entry.quality)?.label ?? entry.quality} quality` : "", entry.size && entry.size !== "auto" ? `${entry.size.toUpperCase()} output` : ""].filter(Boolean).join(" · ")}</p>
      ) : null}
      {entry.personUrl || entry.items.length > 0 ? (
        <ul className={styles.inputs} aria-label="Inputs used">
          {entry.personUrl ? (
            <li className={styles.thumb} title="Person photo">
              <Image src={entry.personUrl} alt="Person photo" fill unoptimized sizes="44px" className={styles.thumbImage} />
            </li>
          ) : null}
          {entry.items.map(({ category, choice }) => (
            <li className={styles.thumb} key={category} title={`${category}: ${choice.label}`} aria-label={`${category}: ${choice.label}`}>
              <ChoicePreview choice={choice} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function HistoryPanel() {
  const { history, clearHistory } = useGeneration();
  const [open, setOpen] = useState(false);
  const runningCount = history.filter((entry) => ["submitting", "queued", "running"].includes(entry.phase)).length;

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <aside className={styles.panel} data-open={open} aria-label="Last generations">
      <button
        type="button"
        className={styles.tab}
        aria-label={runningCount > 0 ? `Last Generations, ${runningCount} running` : "Last Generations"}
        aria-expanded={open}
        aria-controls="history-drawer"
        onClick={() => setOpen((value) => !value)}
      >
        <span>Last Generations</span>
        {runningCount > 0 ? <span className={styles.badge} aria-hidden="true">{runningCount}</span> : null}
      </button>
      <div className={styles.drawer} id="history-drawer" inert={!open}>
        <header className={styles.header}>
          <h2>Last Generations</h2>
          {history.some((entry) => !["submitting", "queued", "running"].includes(entry.phase)) ? (
            <button type="button" className={styles.clear} onClick={() => { if (window.confirm("Remove all finished generations and their photos from this browser?")) clearHistory(); }}>Clear</button>
          ) : null}
          <button type="button" className={styles.close} aria-label="Close last generations" onClick={() => setOpen(false)}>×</button>
        </header>
        {history.length > 0 ? (
          <ul className={styles.list}>
            {history.map((entry) => <HistoryCard key={entry.id} entry={entry} onRestore={() => setOpen(false)} />)}
          </ul>
        ) : <p className={styles.empty}>Your generations appear here. They are saved only in this browser.</p>}
      </div>
    </aside>
  );
}
