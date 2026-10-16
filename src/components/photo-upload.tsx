"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { SelectedItems } from "./selected-items";
import { useGeneration } from "./generation-provider";
import { GenerationResult } from "./generation-result";
import { RequestId } from "./request-id";
import { DownloadButton } from "./download-button";
import { UpscaleButton } from "./upscale-button";
import { FlatlaySummary, PoseSummary } from "./flatlay-panel";
import styles from "./photo-upload.module.css";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export function PhotoUpload() {
  const { personFile, setPersonFile, busy, resultImage, resultRequestId, resultUpscale, statusText, mode } = useGeneration();
  const [photo, setPhoto] = useState<{
    file: File;
    url: string;
    name: string;
    width?: number;
    height?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // Comparison stays tied to the result it was opened for, so a new result starts in the normal view.
  const [compareFor, setCompareFor] = useState<string | null>(null);
  const [split, setSplit] = useState(50);
  const [resultSize, setResultSize] = useState<{ width: number; height: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  // The shown photo follows the provider's file, which an upload or a history restore can set.
  if ((photo?.file ?? null) !== personFile) {
    setPhoto(personFile ? { file: personFile, url: URL.createObjectURL(personFile), name: personFile.name } : null);
    setInfoOpen(false);
  }
  const photoUrl = photo?.url;
  const comparing = Boolean(photo && resultImage && compareFor === resultImage);
  const frameSize = photo?.width && photo.height ? photo : resultImage ? resultSize : null;
  // The frame keeps the empty upload field's 3:4 size; only wider images widen it so landscape photos stay large.
  const frameRatio = frameSize?.width && frameSize.height ? Math.max(frameSize.width / frameSize.height, 3 / 4) : 3 / 4;

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  function choosePhoto(file: File) {
    if (!acceptedTypes.includes(file.type)) {
      setError("Please choose a JPG, PNG, WebP or AVIF image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Please choose an image smaller than 10 MB.");
      return;
    }
    setError(null);
    setInfoOpen(false);
    setPersonFile(file);
  }

  function dropPhoto(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy) return;
    if (event.dataTransfer.files.length !== 1) {
      setError("Please drop one photo at a time.");
      return;
    }
    choosePhoto(event.dataTransfer.files[0]);
  }

  return (
    <div className={styles.container} style={{ "--frame-ratio": frameRatio } as CSSProperties}>
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes.join(",")}
        aria-label="Choose person photo"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) choosePhoto(file);
        }}
      />

      <div className={styles.photoColumn}>
        <section
          className={styles.uploadCard}
          data-dragging={dragging}
          data-filled={Boolean(photo || resultImage)}
          aria-busy={busy}
          aria-label="Person photo"
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            if (busy) return;
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = busy ? "none" : "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={dropPhoto}
        >
          {photo || resultImage ? (
            <>
              {resultImage ? (
                <Image
                  key={resultImage}
                  src={resultImage}
                  alt="Your generated outfit preview"
                  fill
                  unoptimized
                  sizes="(max-width: 600px) 90vw, 520px"
                  className={styles.photo}
                  onLoad={(event) => {
                    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                    if (width && height) setResultSize({ width, height });
                  }}
                />
              ) : null}
              {photo && (!resultImage || comparing) ? (
                <div className={styles.beforeLayer} style={comparing ? { clipPath: `inset(0 ${100 - split}% 0 0)` } : undefined}>
                  <Image
                    key={photo.url}
                    src={photo.url}
                    alt={comparing ? "Before: your uploaded photo" : "Your uploaded styling photo"}
                    fill
                    unoptimized
                    sizes="(max-width: 600px) 90vw, 520px"
                    className={styles.photo}
                    onLoad={(event) => {
                      const { naturalWidth, naturalHeight } = event.currentTarget;
                      if (!naturalWidth || !naturalHeight) return;
                      setPhoto((current) => {
                        if (!current || current.url !== photo.url) return current;
                        if (current.width === naturalWidth && current.height === naturalHeight) return current;
                        return { ...current, width: naturalWidth, height: naturalHeight };
                      });
                    }}
                    onError={() => {
                      setPersonFile(null);
                      setError("This image could not be opened. Please choose another photo.");
                    }}
                  />
                </div>
              ) : null}
              {comparing ? (
                <>
                  <span className={styles.divider} style={{ left: `${split}%` }} aria-hidden="true"><span /></span>
                  <span className={`${styles.compareLabel} ${styles.beforeLabel}`} aria-hidden="true">Before</span>
                  <span className={`${styles.compareLabel} ${styles.afterLabel}`} aria-hidden="true">After</span>
                  <input
                    type="range"
                    className={styles.compareSlider}
                    min={0}
                    max={100}
                    value={split}
                    aria-label="Before and after position"
                    aria-valuetext={`${split}% before`}
                    onChange={(event) => setSplit(Number(event.target.value))}
                  />
                </>
              ) : (
                <button
                  type="button"
                  className={styles.replacePhoto}
                  aria-label={photo ? "Replace person photo" : "Upload person photo"}
                  title={photo ? "Click to replace photo" : "Click to upload the original photo"}
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                />
              )}
              {busy ? (
                <div className={styles.loadingOverlay} role="status">
                  <span className={styles.spinner} aria-hidden="true" />
                  <span>{statusText}</span>
                </div>
              ) : null}
              {dragging ? <div className={styles.dropOverlay}>Drop to replace your photo</div> : null}
            </>
          ) : (
            <button
              type="button"
              className={styles.dropZone}
              onClick={() => inputRef.current?.click()}
              aria-label="Upload person photo"
              aria-describedby="photo-formats"
            >
              <span className={styles.uploadIcon} aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
                </svg>
              </span>
              <span className={styles.dropTitle}>{dragging ? "Drop your photo" : "Drag your photo here"}</span>
              <span className={styles.dropHint}>{mode === "flatlay" ? "Add a photo of a model wearing the outfit you want to extract." : mode === "pose" ? "Add a photo of someone in the pose you want as a mannequin." : "Add a clear, full-body photo to start styling."}</span>
              <span className={styles.chooseButton}>Choose image</span>
              <span className={styles.formats} id="photo-formats">JPG, PNG, WebP or AVIF · Up to 10 MB</span>
            </button>
          )}
        </section>
        <div className={styles.photoToolbar}>
          {resultImage && resultRequestId ? <RequestId id={resultRequestId} className={styles.requestId} /> : <span />}
          <div className={styles.toolbarActions}>
          {resultImage ? (
            <>
              <button
                type="button"
                className={styles.toolButton}
                aria-label="Before and after comparison"
                aria-pressed={comparing}
                title={photo ? "Compare before and after" : "Upload the original photo to compare"}
                disabled={!photo}
                onClick={() => { setSplit(50); setCompareFor(comparing ? null : resultImage); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M12 2v20M8 10l-2 2 2 2m8-4 2 2-2 2" />
                </svg>
              </button>
              <UpscaleButton />
              <DownloadButton href={resultImage} upscale={resultUpscale} />
            </>
          ) : null}
          {photo ? <div
            className={styles.photoInfo}
            onPointerEnter={(event) => { if (event.pointerType === "mouse") setInfoOpen(true); }}
            onPointerLeave={() => setInfoOpen(false)}
            onFocus={() => setInfoOpen(true)}
            onBlur={() => setInfoOpen(false)}
            onKeyDown={(event) => { if (event.key === "Escape") setInfoOpen(false); }}
          >
            <button
              type="button"
              className={styles.infoButton}
              aria-label="Image information"
              aria-describedby={infoOpen ? "photo-information" : undefined}
              onClick={() => setInfoOpen(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6m0-10h.01" />
              </svg>
            </button>
            {infoOpen ? (
              <div className={styles.infoTooltip} id="photo-information" role="tooltip">
                <dl>
                  <dt>File name</dt>
                  <dd>{photo.name}</dd>
                  <dt>Resolution</dt>
                  <dd>{photo.width && photo.height ? `${photo.width} × ${photo.height} px` : "Reading image…"}</dd>
                </dl>
              </div>
            ) : null}
          </div> : null}
          </div>
        </div>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {mode === "flatlay" ? <FlatlaySummary /> : mode === "pose" ? <PoseSummary /> : <SelectedItems />}
        <GenerationResult />
      </div>
    </div>
  );
}

