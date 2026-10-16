"use client";

import { useEffect, useRef, useState } from "react";
import { useGeneration, type UpscaleResolution } from "./generation-provider";
import styles from "./upscale-button.module.css";

const options: { value: UpscaleResolution; label: string; hint: string }[] = [
  { value: "2k", label: "2K", hint: "Shorter edge 2048 px" },
  { value: "4k", label: "4K", hint: "Longer edge 4096 px" },
  { value: "8k", label: "8K", hint: "Largest, slowest" },
];

export function UpscaleButton() {
  const { upscale, busy, canUpscale, resultUpscale, upscaler } = useGeneration();
  const available = options.filter((option) => upscaler?.resolutions.includes(option.value));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  if (resultUpscale) {
    return <span className={styles.done} title="This image is already upscaled">{resultUpscale.toUpperCase()} upscaled</span>;
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!canUpscale}
        title={busy ? "Wait until the current job has finished" : canUpscale ? "Upscale this image" : "Connect Comfy to upscale"}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
        </svg>
        Upscale
      </button>
      {open ? (
        <div className={styles.menu} role="menu" aria-label="Upscale resolution">
          {available.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitem"
              className={styles.option}
              onClick={() => { setOpen(false); void upscale(option.value); }}
            >
              <span className={styles.optionLabel}>{option.label}</span>
              <span className={styles.optionHint}>{option.hint}</span>
            </button>
          ))}
          <p className={styles.note}>{upscaler?.name ?? "Comfy"} · uses Comfy credits.</p>
        </div>
      ) : null}
    </div>
  );
}
