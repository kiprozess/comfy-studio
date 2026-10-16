"use client";

import { QUALITIES } from "@/lib/quality";
import { OUTPUT_SIZES, isOutputSize, resolveFlatlaySize } from "@/lib/output-size";
import { useGeneration } from "./generation-provider";
import styles from "./quality-picker.module.css";

export function QualityPicker() {
  const { quality, setQuality, busy, mode, outputSize, setOutputSize } = useGeneration();
  const active = QUALITIES.find(({ id }) => id === quality);
  // Flat lays have a fixed 2:3 format, so their hints show exact pixels; try-on and poses follow the photo.
  const resolveFixed = mode === "flatlay" ? resolveFlatlaySize : null;
  const sizes = OUTPUT_SIZES.map((option) => resolveFixed
    ? { ...option, label: option.id === "auto" ? "Standard" : option.label, hint: resolveFixed(option.id).replace("x", " × ") + " px" }
    : option);
  return (
    <>
      <label className={styles.sizeRow} title={sizes.find(({ id }) => id === outputSize)?.hint}>
        <span className={styles.sizeLabel}>Output size</span>
        <select className={styles.select} value={outputSize} disabled={busy} onChange={(event) => { if (isOutputSize(event.target.value)) setOutputSize(event.target.value); }}>
          {sizes.map((option) => <option key={option.id} value={option.id} title={option.hint}>{option.label}</option>)}
        </select>
      </label>
    <fieldset className={styles.picker} disabled={busy}>
      <legend className={styles.legend}>
        <span>Quality</span>
        <span className={styles.hint}>{active?.hint}</span>
      </legend>
      <div className={styles.options}>
        {QUALITIES.map((option) => (
          <label className={styles.option} key={option.id} title={option.hint}>
            <input type="radio" name={`quality-${mode}`} value={option.id} checked={quality === option.id} onChange={() => setQuality(option.id)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
    </>
  );
}
