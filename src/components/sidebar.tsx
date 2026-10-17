"use client";

import Image from "next/image";
import { useState, type ChangeEvent } from "react";
import { ChoicePreview } from "./choice-preview";
import { useStyling } from "./styling-provider";
import { useGeneration, type Mode } from "./generation-provider";
import { FlatlayPanel, PosePanel } from "./flatlay-panel";
import { QualityPicker } from "./quality-picker";
import type { StylingChoice as Choice } from "@/lib/styling-types";
import styles from "./sidebar.module.css";
import { stylingCategories as categories, type CategoryId } from "@/lib/styling-categories";
import { POSES } from "@/lib/poses";
import { DEMO_OUTFITS } from "@/lib/demo-outfits";

const poses: Choice[] = POSES.map((pose, index) => ({ id: pose.id, label: pose.label, pose: index, imageUrl: pose.image }));

export function Sidebar() {
  const { generate, resume, phase, busy, canGenerate, statusText, mode, setMode } = useGeneration();
  const { gender, setGender, selections, uploads, toggleChoice, addReference, resetStyling, removeFromLibrary } = useStyling();
  const [openCategory, setOpenCategory] = useState<CategoryId | null>("outfit");
  const [error, setError] = useState<string | null>(null);
  function reset() {
    resetStyling();
    setOpenCategory(null);
    setError(null);
  }

  function handleReference(event: ChangeEvent<HTMLInputElement>, category: CategoryId) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
      setError("Please choose a JPG, PNG, WebP or AVIF image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Please choose an image smaller than 10 MB.");
      return;
    }
    setError(null);
    addReference(category, file);
  }

  return (
    <>
      <a className={styles.skipLink} href="#workspace">Skip to workspace</a>
      <aside className={styles.sidebar} aria-label="Styling controls">
        <div className={styles.brand}>
          <Image
            src="/images/comfy-logo.svg"
            alt="ComfyUI"
            width={173}
            height={48}
            className={styles.brandLogo}
            loading="eager"
            unoptimized
          />
        </div>
        <fieldset className={`${styles.genderSwitch} ${styles.modeSwitch}`}>
          <legend className={styles.srOnly}>Workflow</legend>
          {([["tryon", "Try-on"], ["flatlay", "Flatlay"], ["pose", "Pose"]] as [Mode, string][]).map(([value, label]) => (
            <label className={styles.genderOption} key={value}>
              <input type="radio" name="workflow" disabled={busy} value={value} checked={mode === value} onChange={() => { setMode(value); setError(null); }} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        {mode === "flatlay" ? <FlatlayPanel /> : mode === "pose" ? <PosePanel /> : (<>
        <div className={styles.toolbar}>
          <fieldset className={styles.genderSwitch}>
            <legend className={styles.srOnly}>Style collection</legend>
            {(["male", "female"] as const).map((value) => (
              <label className={styles.genderOption} key={value}>
                <input type="radio" name="style-collection" disabled={busy} value={value} checked={gender === value} onChange={() => { setGender(value); setError(null); }} />
                <span>{value === "male" ? "Male" : "Female"}</span>
              </label>
            ))}
          </fieldset>
          <button className={styles.resetButton} type="button" onClick={reset} disabled={busy}>Reset</button>
        </div>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.categories}>
          {categories.map((category) => {
            const expanded = openCategory === category.id;
            const key = `${gender}:${category.id}`;
            const selected = selections[key];
            const builtIn: Choice[] = category.id === "outfit"
              ? DEMO_OUTFITS.filter((outfit) => outfit.gender === gender).map((outfit) => ({ id: `demo-${outfit.id}`, label: outfit.label, demoOutfit: outfit.id }))
              : category.id === "pose" ? poses : [];
            const choices = [...(uploads[key] ?? []), ...builtIn];

            return (
              <section className={`${styles.category} ${category.optional ? styles.optionalCategory : ""}`} data-open={expanded} key={category.id}>
                {category.id === "background" ? <div className={styles.divider} aria-hidden="true" /> : null}
                <div className={styles.categoryShell}>
                  <button
                    type="button"
                    className={styles.categoryTrigger}
                    id={`trigger-${category.id}`}
                    aria-expanded={expanded}
                    aria-controls={`panel-${category.id}`}
                    onClick={() => { setOpenCategory(expanded ? null : category.id); setError(null); }}
                  >
                    <svg className={styles.categoryIcon} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d={category.path} /></svg>
                    <span>{category.label}</span>
                    {selected ? <span className={styles.selectionDot} aria-label={`Selected: ${selected.label}`} /> : null}
                    {category.optional ? <span className={styles.optionalLabel}>Optional</span> : null}
                    <svg className={styles.chevron} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
                  </button>
                  {expanded ? (
                    <div className={styles.panel} id={`panel-${category.id}`} role="region" aria-labelledby={`trigger-${category.id}`}>
                      <div className={styles.presetScroll}>
                        <div className={styles.presetGrid}>
                          <label className={styles.uploadTile} title={`Upload ${category.label.toLowerCase()} reference`}>
                            <input className={styles.srOnly} type="file" disabled={busy} accept="image/jpeg,image/png,image/webp,image/avif" aria-label={`Upload ${category.label.toLowerCase()} reference`} onChange={(event) => handleReference(event, category.id)} />
                            <span className={styles.plus} aria-hidden="true">+</span>
                          </label>
                          {choices.map((choice) => (
                            <div className={styles.tile} key={choice.id}>
                            <button
                              className={styles.preset}
                              type="button"
                              disabled={busy}
                              aria-label={choice.label}
                              aria-pressed={selected?.id === choice.id}
                              title={choice.label}
                              onClick={() => toggleChoice(category.id, choice)}
                            >
                              <ChoicePreview choice={choice} />
                              {choice.pose !== undefined || choice.color ? <span className={styles.presetCaption}>{choice.label}</span> : null}
                              {selected?.id === choice.id ? <span className={styles.checkmark} aria-hidden="true">✓</span> : null}
                            </button>
                            {choice.saved ? (
                              <button
                                className={styles.removeTile}
                                type="button"
                                disabled={busy}
                                aria-label={`Delete saved ${choice.label}`}
                                title="Delete from saved images"
                                onClick={() => { if (window.confirm("Delete this saved image from the browser?")) removeFromLibrary(choice); }}
                              >×</button>
                            ) : null}
                            </div>
                          ))}
                        </div>
                        {choices.length === 0 ? <p className={styles.emptyHint}>Upload your own {category.label.toLowerCase()} reference.</p> : null}
                      </div>

                    </div>
                  ) : <div id={`panel-${category.id}`} hidden />}
                </div>
              </section>
            );
          })}
        </div>
        </>)}
        <footer className={styles.generateFooter}>
          <QualityPicker />
          <button
            className={styles.generateButton}
            type="button"
            disabled={phase !== "paused" && !canGenerate}
            onClick={() => { if (phase === "paused") resume(); else void generate(); }}
            aria-describedby="generation-status"
          >
            {phase === "paused" ? "Check status" : busy ? "Generating…" : mode === "flatlay" ? "Create flat lay" : mode === "pose" ? "Create pose" : "Generate"}
          </button>
          <p className={styles.generationStatus} id="generation-status" role="status">{statusText}</p>
        </footer>
      </aside>
    </>
  );
}



