"use client";

import { useEffect, useRef, useState } from "react";
import { stylingCategories, type CategoryId } from "@/lib/styling-categories";
import { ChoicePreview } from "./choice-preview";
import { useStyling } from "./styling-provider";
import { useGeneration } from "./generation-provider";
import styles from "./selected-items.module.css";

export function SelectedItems() {
  const { busy } = useGeneration();
  const { gender, selections, toggleChoice } = useStyling();
  const [previewCategory, setPreviewCategory] = useState<CategoryId | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const items = stylingCategories.flatMap((category) => {
    const choice = selections[`${gender}:${category.id}`];
    return choice ? [{ category, choice }] : [];
  });
  const preview = items.find(({ category }) => category.id === previewCategory);
  const previewId = preview?.choice.id;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !previewId) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [previewId]);

  return (
    <section className={styles.card} aria-labelledby="selected-items-title">
      <header className={styles.header}>
        <h2 id="selected-items-title">Selected items</h2>
        {items.length > 0 ? <span className={styles.count}>{items.length}</span> : null}
      </header>
      {items.length > 0 ? (
        <ul className={styles.items} aria-label="Selected styling items">
          {items.map(({ category, choice }) => (
            <li className={styles.item} key={category.id} data-category={category.id} data-selection-id={choice.id}>
              <button
                type="button"
                className={styles.thumbnail}
                aria-label={`Preview ${category.label}: ${choice.label}`}
                aria-haspopup="dialog"
                title={`${category.label}: ${choice.label} · Click to enlarge`}
                onClick={() => setPreviewCategory(category.id)}
              >
                <ChoicePreview choice={choice} />
              </button>
              <button className={styles.remove} type="button" disabled={busy} aria-label={`Remove ${category.label}: ${choice.label}`} title="Remove item" onClick={() => toggleChoice(category.id, choice)}>×</button>
            </li>
          ))}
        </ul>
      ) : <p className={styles.empty}>No items selected</p>}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="item-preview-title"
        onClose={() => setPreviewCategory(null)}
        onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
      >
        {preview ? (
          <div className={styles.dialogContent}>
            <header className={styles.dialogHeader}>
              <div>
                <p className={styles.categoryLabel}>{preview.category.label}</p>
                <h2 id="item-preview-title">{preview.choice.label}</h2>
              </div>
              <button type="button" className={styles.closeButton} aria-label="Close preview" onClick={() => dialogRef.current?.close()}>×</button>
            </header>
            <div className={styles.largePreview} role="img" aria-label={preview.choice.label}>
              <ChoicePreview choice={preview.choice} fit="contain" />
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
