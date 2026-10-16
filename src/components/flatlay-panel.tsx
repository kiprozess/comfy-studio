"use client";

import { FLATLAY_PARTS, type FlatlayPart } from "@/lib/flatlay";
import Image from "next/image";
import { stylingCategories } from "@/lib/styling-categories";
import { POSES } from "@/lib/poses";
import { useGeneration } from "./generation-provider";
import styles from "./flatlay-panel.module.css";

function Icon({ id }: { id: string }) {
  const path = stylingCategories.find((category) => category.id === id)?.path;
  return <svg className={styles.icon} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d={path} /></svg>;
}

// Chooses which garments the flat lay extracts: everything, or any mix of parts.
export function FlatlayPanel() {
  const { flatlaySelection: selection, setFlatlaySelection, busy } = useGeneration();
  const complete = selection === "complete";

  function togglePart(part: FlatlayPart) {
    if (complete) return setFlatlaySelection([part]);
    setFlatlaySelection(selection.includes(part) ? selection.filter((item) => item !== part) : [...selection, part]);
  }

  return (
    <fieldset className={styles.panel} disabled={busy}>
      <legend className={styles.heading}>Extract as flat lay</legend>
      <label className={styles.option} data-checked={complete}>
        <input type="checkbox" checked={complete} onChange={() => setFlatlaySelection(complete ? [] : "complete")} />
        <Icon id="outfit" />
        <span className={styles.label}>Complete outfit</span>
        <span className={styles.check} aria-hidden="true" />
      </label>
      <div className={styles.divider} aria-hidden="true"><span>or pick items</span></div>
      {FLATLAY_PARTS.map((part) => {
        const checked = !complete && selection.includes(part.id);
        return (
          <label className={styles.option} data-checked={checked} key={part.id}>
            <input type="checkbox" checked={checked} onChange={() => togglePart(part.id)} />
            <Icon id={part.id} />
            <span className={styles.label}>{part.label}</span>
            <span className={styles.check} aria-hidden="true" />
          </label>
        );
      })}
      <p className={styles.hint}>Upload a photo of a model wearing the outfit. You get the chosen items laid out on a white background.</p>
    </fieldset>
  );
}

// Save keeps the result as a sidebar tile across reloads; Use switches to try-on with it selected.
export function ResultActions() {
  const { busy, resultTarget, resultSaved, saveResult, applyResult } = useGeneration();
  const targetLabel = stylingCategories.find(({ id }) => id === resultTarget)?.label;
  if (!targetLabel) return null;
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.save} disabled={busy || resultSaved} onClick={() => void saveResult()} title={resultSaved ? `Saved under ${targetLabel}` : `Keep this image under ${targetLabel} in the sidebar, also after a reload`}>
        {resultSaved ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z" /></svg>
        )}
        {resultSaved ? "Saved" : "Save"}
      </button>
      <button type="button" className={styles.handoff} disabled={busy} onClick={() => void applyResult()} title={`Use this image under ${targetLabel} in try-on`}>
        Use as {targetLabel.toLowerCase()}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </button>
    </div>
  );
}

// Sits where "Selected items" does in try-on: what is extracted, and the next steps once the flat lay exists.
export function FlatlaySummary() {
  const { flatlaySelection: selection } = useGeneration();
  const parts = selection === "complete" ? [{ id: "outfit", label: "Complete outfit" }] : FLATLAY_PARTS.filter(({ id }) => selection.includes(id));
  return (
    <section className={styles.summary} aria-labelledby="flatlay-summary-title">
      <header className={styles.summaryHeader}>
        <h2 id="flatlay-summary-title">Extracting</h2>
      </header>
      <div className={styles.summaryRow}>
        {parts.length > 0 ? (
          <ul className={styles.chips}>
            {parts.map((part) => <li className={styles.chip} key={part.id}><Icon id={part.id} />{part.label}</li>)}
          </ul>
        ) : <p className={styles.empty}>Choose what to extract</p>}
        <ResultActions />
      </div>
    </section>
  );
}

// Pose mode has no options beyond size and quality; the panel explains what to upload.
export function PosePanel() {
  return (
    <div className={styles.panel}>
      <p className={styles.heading}>Create a pose</p>
      <div className={styles.poseIntro}>
        <span className={styles.poseExample}>
          <Image src={POSES[0].image} alt="" fill sizes="96px" unoptimized />
        </span>
        <p className={styles.hint}>Upload a photo of someone in the pose you want. You get a faceless mannequin like this one in exactly that pose, ready to use in try-on.</p>
      </div>
    </div>
  );
}

export function PoseSummary() {
  return (
    <section className={styles.summary} aria-labelledby="pose-summary-title">
      <header className={styles.summaryHeader}>
        <h2 id="pose-summary-title">Creating</h2>
      </header>
      <div className={styles.summaryRow}>
        <ul className={styles.chips}><li className={styles.chip}><Icon id="pose" />Mannequin pose</li></ul>
        <ResultActions />
      </div>
    </section>
  );
}
