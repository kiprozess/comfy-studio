"use client";

import { useGeneration } from "./generation-provider";
import styles from "./generation-result.module.css";

// Status and result appear in the photo card; this only reports problems below it.
export function GenerationResult() {
  const { error, phase, resume } = useGeneration();
  if (!error) return null;
  return (
    <section className={styles.result} aria-label="Generation status">
      <div className={styles.error} role="alert"><p>{error}</p>{phase === "paused" ? <button type="button" onClick={resume}>Check status</button> : null}</div>
    </section>
  );
}
