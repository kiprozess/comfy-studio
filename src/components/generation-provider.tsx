"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { stylingCategories, type CategoryId } from "@/lib/styling-categories";
import type { GenerationSelection, GenerationUpdate } from "@/lib/generation-types";
import { tokenCreatedAt, tokenRequestId } from "@/lib/job-token";
import { loadHistory, writeHistory, type StoredHistoryEntry } from "@/lib/history-store";
import type { Gender, StylingChoice } from "@/lib/styling-types";
import { flatlayCategory, type FlatlaySelection } from "@/lib/flatlay";
import { DEFAULT_QUALITY, type Quality } from "@/lib/quality";
import { DEFAULT_OUTPUT_SIZE, type OutputSize } from "@/lib/output-size";
import { useStyling } from "./styling-provider";
import { EXAMPLE_MODEL } from "@/lib/example-model";

export type UpscaleResolution = "2k" | "4k" | "8k";
/** "tryon" dresses a person in new clothes; "flatlay" extracts clothes from a photo into a flat lay. */
export type Mode = "tryon" | "flatlay" | "pose";
type Phase = "idle" | "submitting" | "queued" | "running" | "succeeded" | "failed" | "paused";
export type HistoryEntry = {
  id: string;
  token?: string;
  createdAt?: number;
  phase: Exclude<Phase, "idle">;
  queuePosition?: number;
  error?: string;
  image?: string;
  personUrl?: string;
  personFile?: Blob;
  gender?: Gender;
  upscale?: UpscaleResolution;
  kind?: "flatlay" | "pose";
  parts?: FlatlaySelection;
  quality?: Quality;
  size?: OutputSize;
  items: { category: string; categoryId?: CategoryId; choice: StylingChoice }[];
};
type GenerationState = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  /** GPT Image quality tier for the current mode. */
  quality: Quality;
  setQuality: (quality: Quality) => void;
  /** Output size for the current mode; flat lays keep a 2:3 portrait at every size. */
  outputSize: OutputSize;
  setOutputSize: (size: OutputSize) => void;
  flatlaySelection: FlatlaySelection;
  setFlatlaySelection: (selection: FlatlaySelection) => void;
  /** The try-on category the shown flat lay would be saved to; null without a flat lay result. */
  /** Try-on category a flat lay or pose result belongs to; null for try-on results. */
  resultTarget: CategoryId | null;
  /** Whether the shown result is already kept in the sidebar library. */
  resultSaved: boolean;
  /** Keeps the shown flat lay or pose as a sidebar tile across reloads. */
  saveResult: () => Promise<void>;
  /** Switches to try-on with the shown flat lay or pose selected (for this session unless saved). */
  applyResult: () => Promise<void>;
  history: HistoryEntry[];
  trackEntry: (id: string) => void;
  clearHistory: () => void;
  restoreEntry: (id: string) => void;
  personFile: File | null;
  isExampleModel: boolean;
  setPersonFile: (file: File | null) => void;
  generate: () => Promise<void>;
  upscale: (resolution: UpscaleResolution) => Promise<void>;
  canUpscale: boolean;
  /** What the server's upscaler offers; null until the configuration has loaded. */
  upscaler: { name: string; resolutions: UpscaleResolution[] } | null;
  /** The resolution the shown result was upscaled to, if it was. */
  resultUpscale: UpscaleResolution | null;
  resume: () => void;
  phase: Phase;
  busy: boolean;
  canGenerate: boolean;
  statusText: string;
  error: string | null;
  resultImage: string | null;
  resultRequestId: string | null;
};
const GenerationContext = createContext<GenerationState | null>(null);
const storageKey = "comfy-stylist-job";
const historyLimit = 12;

function storeJob(token: string | null) {
  try {
    if (token) sessionStorage.setItem(storageKey, token);
    else sessionStorage.removeItem(storageKey);
  } catch { /* Browsing with storage disabled still supports this session. */ }
}

const inProgress = (phase: Phase) => ["submitting", "queued", "running"].includes(phase);

function toStored({ id, token, createdAt, phase, queuePosition, error, image, personFile, gender, upscale, kind, parts, quality, size, items }: HistoryEntry): StoredHistoryEntry {
  return { id, token, createdAt, phase, queuePosition, error, image, personFile, gender, upscale, kind, parts, quality, size, items: items.map(({ choice, ...item }) => ({ ...item, choice: { ...choice, imageUrl: choice.file ? undefined : choice.imageUrl } })) };
}

// Polling repeats the same status, so unchanged patches keep the entry identity and skip a storage write.
function patched(entry: HistoryEntry, patch: Partial<HistoryEntry>) {
  return (Object.keys(patch) as (keyof HistoryEntry)[]).every((key) => entry[key] === patch[key]) ? entry : { ...entry, ...patch };
}

function entryUrls(entry: HistoryEntry) {
  return [entry.personUrl, ...entry.items.map(({ choice }) => choice.imageUrl)].filter((url): url is string => Boolean(url));
}

export function GenerationProvider({ children }: { children: ReactNode }) {
  const { gender, selections, restoreSelections, addReference, selectChoice, saveToLibrary, savedBySource } = useStyling();
  const [mode, setModeState] = useState<Mode>("tryon");
  // Each mode keeps its own photo: a person to dress, or a person whose outfit becomes a flat lay.
  const [photos, setPhotos] = useState<Record<Mode, File | null>>({ tryon: null, flatlay: null, pose: null });
  const [exampleFile, setExampleFile] = useState<File | null>(null);
  const tryonPhotoChosen = useRef(false);
  const personFile = photos[mode];
  const setPersonFile = useCallback((file: File | null) => {
    if (mode === "tryon") tryonPhotoChosen.current = true;
    setPhotos((current) => ({ ...current, [mode]: file }));
  }, [mode]);
  const [flatlaySelection, setFlatlaySelection] = useState<FlatlaySelection>("complete");
  // Each mode keeps its own tier, e.g. cheap flat lay drafts next to high-quality try-ons.
  const [qualities, setQualities] = useState<Record<Mode, Quality>>({ tryon: DEFAULT_QUALITY, flatlay: DEFAULT_QUALITY, pose: DEFAULT_QUALITY });
  const quality = qualities[mode];
  const [outputSizes, setOutputSizes] = useState<Record<Mode, OutputSize>>({ tryon: DEFAULT_OUTPUT_SIZE, flatlay: DEFAULT_OUTPUT_SIZE, pose: DEFAULT_OUTPUT_SIZE });
  const outputSize = outputSizes[mode];
  const setOutputSize = useCallback((next: OutputSize) => setOutputSizes((current) => ({ ...current, [mode]: next })), [mode]);
  const setQuality = useCallback((next: Quality) => setQualities((current) => ({ ...current, [mode]: next })), [mode]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [upscaler, setUpscaler] = useState<GenerationState["upscaler"]>(null);
  const [progress, setProgress] = useState<number | undefined>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [monitorVersion, setMonitorVersion] = useState(0);
  const [queuePosition, setQueuePosition] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  // Kept apart from the polled token, so a restored result shows its ID without querying Comfy again.
  const [resultToken, setResultToken] = useState<string | null>(null);
  // Labels the status while an upscale is submitted, before its ticket exists.
  const [submittingUpscale, setSubmittingUpscale] = useState<UpscaleResolution | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyUrls = useRef(new Set<string>());
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const persisted = useRef(new Map<string, HistoryEntry>());
  const submitting = useRef(false);
  const attempt = useRef<{ mode: Mode; file: File; gender: string; selections: typeof selections; parts: FlatlaySelection; quality: Quality; size: OutputSize; key: string; form: FormData; entryId: string } | null>(null);
  const mounted = useRef(true);
  const busy = inProgress(phase);
  const hasClothing = stylingCategories.some((category) => !category.optional && selections[`${gender}:${category.id}`]);
  const hasParts = flatlaySelection === "complete" || flatlaySelection.length > 0;
  const ready = mode === "flatlay" ? hasParts : mode === "pose" ? true : hasClothing;

  useEffect(() => {
    const controller = new AbortController();
    async function loadExample() {
      try {
        const response = await fetch(EXAMPLE_MODEL.image, { signal: controller.signal });
        if (!response.ok) return;
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const file = new File([blob], EXAMPLE_MODEL.filename, { type: "image/png" });
        setExampleFile(file);
        // A user upload or history restore made during loading always wins.
        setPhotos((current) => current.tryon || tryonPhotoChosen.current ? current : { ...current, tryon: file });
      } catch { /* The ordinary photo uploader remains available if the example fails to load. */ }
    }
    void loadExample();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let configTimer: ReturnType<typeof setTimeout>;
    async function loadConfig() {
      try {
        const response = await fetch("/api/generate", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const config = await response.json();
        if (controller.signal.aborted) return;
        setConfigured(config.configured === true);
        if (config.upscaler) setUpscaler(config.upscaler);
        if (!config.configured) configTimer = setTimeout(loadConfig, 5000);
      } catch {
        if (!controller.signal.aborted) {
          setConfigured(false);
          configTimer = setTimeout(loadConfig, 5000);
        }
      }
    }
    void loadConfig();
    return () => { mounted.current = false; controller.abort(); clearTimeout(configTimer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      let stored: StoredHistoryEntry[] = [];
      try { stored = await loadHistory(); } catch { /* History is optional without IndexedDB. */ }
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(storageKey); } catch { /* Storage is optional. */ }
      if (cancelled) return;
      // A finished job is already in the history and needs no status check after a reload.
      if (stored.some((entry) => entry.token === saved && !inProgress(entry.phase))) { saved = null; storeJob(null); }
      const trackUrl = (blob: Blob) => { const url = URL.createObjectURL(blob); historyUrls.current.add(url); return url; };
      let adopted = saved;
      const entries = stored.map((item) => {
        const entry: HistoryEntry = {
          ...item,
          personUrl: item.personFile ? trackUrl(item.personFile) : undefined,
          items: item.items.map(({ choice, ...rest }) => ({ ...rest, choice: { ...choice, imageUrl: choice.file ? trackUrl(choice.file) : choice.imageUrl } })),
        };
        persisted.current.set(entry.id, entry);
        if (!inProgress(entry.phase) || entry.token === saved) return entry;
        if (!entry.token) return { ...entry, phase: "failed" as const, error: "Interrupted before the generation started." };
        // Only one job is tracked at a time; the newest unfinished job resumes, older ones wait for Check status.
        if (!adopted) { adopted = entry.token; return entry; }
        return { ...entry, phase: "paused" as const };
      });
      if (saved && !entries.some((entry) => entry.token === saved)) {
        entries.unshift({ id: saved, token: saved, createdAt: tokenCreatedAt(saved), phase: "queued", items: [] });
      }
      if (adopted) {
        storeJob(adopted);
        setToken(adopted); setPhase("queued");
      }
      setHistory((current) => [...current, ...entries.filter((entry) => !current.some(({ id }) => id === entry.id))].slice(0, historyLimit));
      setHistoryLoaded(true);
    }
    void restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    const put = history.filter((entry) => persisted.current.get(entry.id) !== entry);
    const remove = [...persisted.current.keys()].filter((id) => !history.some((entry) => entry.id === id));
    if (put.length === 0 && remove.length === 0) return;
    persisted.current = new Map(history.map((entry) => [entry.id, entry]));
    writeHistory(put.map(toStored), remove).catch(() => { /* A full or blocked store keeps the in-memory history. */ });
  }, [history, historyLoaded]);

  // History keeps its own object URLs, so resetting the styling or replacing the photo leaves past entries intact.
  useEffect(() => {
    const live = new Set(history.flatMap(entryUrls));
    for (const url of historyUrls.current) {
      if (!live.has(url)) { URL.revokeObjectURL(url); historyUrls.current.delete(url); }
    }
  }, [history]);

  useEffect(() => {
    const urls = historyUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const patchEntry = (patch: Partial<HistoryEntry>) => setHistory((current) => current.map((entry) => entry.token === token ? patched(entry, patch) : entry));
    async function poll() {
      try {
        const response = await fetch(`/api/generate/${encodeURIComponent(token!)}`, { cache: "no-store", signal: controller.signal });
        const update = await response.json() as GenerationUpdate & { error?: string };
        if (!response.ok) {
          if ([400, 404, 422].includes(response.status)) {
            setPhase("failed"); setError(update.error ?? "This generation is no longer available.");
            patchEntry({ phase: "failed", error: update.error ?? "This generation is no longer available." });
            storeJob(null);
            return;
          }
          throw new Error(update.error ?? "The generation status could not be loaded.");
        }
        failures = 0;
        setError(null);
        setPhase(update.status);
        setQueuePosition(update.queuePosition);
        setProgress(update.progress);
        patchEntry({ phase: update.status, queuePosition: update.queuePosition, image: update.image, error: update.status === "failed" ? update.error ?? "The generation failed." : undefined });
        if (update.status === "succeeded" || update.status === "failed") storeJob(null);
        if (update.status === "succeeded" && update.image) { setResultImage(update.image); setResultToken(token); return; }
        if (update.status === "failed") { setError(update.error ?? "The generation failed."); return; }
        timer = setTimeout(poll, Math.min(15, Math.max(2, update.retryAfter ?? 3)) * 1000);
      } catch (reason) {
        if (controller.signal.aborted) return;
        failures += 1;
        if (failures >= 4) {
          setPhase("paused");
          patchEntry({ phase: "paused" });
          setError(reason instanceof Error ? reason.message : "The generation status could not be loaded.");
        } else timer = setTimeout(poll, failures * 3000);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [token, monitorVersion]);

  const generate = useCallback(async () => {
    if (submitting.current || busy || !personFile || !ready || !configured) return;
    submitting.current = true;
    setPhase("submitting"); setError(null); setResultImage(null); setSubmittingUpscale(null); setProgress(undefined);
    let entryId: string | undefined;
    const patchEntry = (patch: Partial<HistoryEntry>) => setHistory((current) => current.map((entry) => entry.id === entryId ? patched(entry, patch) : entry));
    try {
      const current = attempt.current;
      if (!current || current.mode !== mode || current.file !== personFile || current.quality !== quality || current.size !== outputSize || (mode === "tryon" ? current.gender !== gender || current.selections !== selections : current.parts !== flatlaySelection)) {
        const form = new FormData();
        form.append("photo", personFile);
        const selected: GenerationSelection[] = [];
        const items: HistoryEntry["items"] = [];
        const trackUrl = (file: File) => { const url = URL.createObjectURL(file); historyUrls.current.add(url); return url; };
        form.append("quality", quality);
        if (mode === "flatlay") form.append("parts", JSON.stringify(flatlaySelection));
        for (const category of mode === "tryon" ? stylingCategories : []) {
          const choice = selections[`${gender}:${category.id}`];
          if (!choice) continue;
          selected.push({ category: category.id, demoOutfit: choice.demoOutfit, color: choice.color, pose: choice.pose });
          if (choice.file) form.append(`reference-${category.id}`, choice.file);
          items.push({ category: category.label, categoryId: category.id, choice: { ...choice, imageUrl: choice.file ? trackUrl(choice.file) : choice.imageUrl } });
        }
        if (mode === "tryon") form.append("selections", JSON.stringify(selected));
        form.append("size", outputSize);
        const entry: HistoryEntry = mode === "flatlay"
          ? { id: crypto.randomUUID(), createdAt: Date.now(), phase: "submitting", personUrl: trackUrl(personFile), personFile, kind: "flatlay", parts: flatlaySelection, quality, size: outputSize, items }
          : mode === "pose"
          ? { id: crypto.randomUUID(), createdAt: Date.now(), phase: "submitting", personUrl: trackUrl(personFile), personFile, kind: "pose", quality, size: outputSize, items }
          : { id: crypto.randomUUID(), createdAt: Date.now(), phase: "submitting", personUrl: trackUrl(personFile), personFile, gender, quality, size: outputSize, items };
        setHistory((list) => [entry, ...list].slice(0, historyLimit));
        attempt.current = { mode, file: personFile, gender, selections, parts: flatlaySelection, quality, size: outputSize, key: crypto.randomUUID(), form, entryId: entry.id };
      }
      const active = attempt.current!;
      entryId = active.entryId;
      patchEntry({ phase: "submitting", error: undefined });
      const endpoints: Record<Mode, string> = { tryon: "/api/generate", flatlay: "/api/flatlay", pose: "/api/pose" };
      const response = await fetch(endpoints[active.mode], { method: "POST", headers: { "Idempotency-Key": active.key }, body: active.form });
      const data = await response.json();
      if (!response.ok) {
        // A definitive validation rejection did not create a generation.
        if ([400, 413, 422].includes(response.status)) attempt.current = null;
        throw new Error(data.error ?? "The generation could not be started.");
      }
      if (typeof data.token !== "string") throw new Error("No generation ID was returned.");
      if (!mounted.current) return;
      storeJob(data.token);
      setToken(data.token); setQueuePosition(data.queuePosition); setPhase("queued");
      patchEntry({ token: data.token, phase: "queued", queuePosition: data.queuePosition });
      setMonitorVersion((version) => version + 1);
      attempt.current = null;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The connection was interrupted. Retry with the same inputs to recover the original request.";
      if (mounted.current) { setPhase("failed"); setError(message); patchEntry({ phase: "failed", error: message }); }
    } finally { submitting.current = false; }
  }, [busy, configured, flatlaySelection, gender, mode, outputSize, personFile, quality, ready, selections]);

  const resultEntry = resultToken ? history.find((entry) => entry.token === resultToken) : undefined;

  // Upscales the shown result; the new entry keeps the photo and settings of the generation it came from.
  const upscale = useCallback(async (resolution: UpscaleResolution) => {
    if (submitting.current || busy || !resultImage || !configured) return;
    submitting.current = true;
    setPhase("submitting"); setError(null); setSubmittingUpscale(resolution); setProgress(undefined);
    const trackUrl = (blob: Blob) => { const url = URL.createObjectURL(blob); historyUrls.current.add(url); return url; };
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      phase: "submitting",
      upscale: resolution,
      kind: resultEntry?.kind,
      parts: resultEntry?.parts,
      quality: resultEntry?.quality,
      size: resultEntry?.size,
      gender: resultEntry?.gender,
      personFile: resultEntry?.personFile,
      personUrl: resultEntry?.personFile ? trackUrl(resultEntry.personFile) : undefined,
      items: (resultEntry?.items ?? []).map((item) => ({ ...item, choice: { ...item.choice, imageUrl: item.choice.file ? trackUrl(item.choice.file) : item.choice.imageUrl } })),
    };
    setHistory((current) => [entry, ...current].slice(0, historyLimit));
    const patchEntry = (patch: Partial<HistoryEntry>) => setHistory((current) => current.map((item) => item.id === entry.id ? patched(item, patch) : item));
    try {
      const response = await fetch("/api/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ image: resultImage, resolution }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The upscale could not be started.");
      if (typeof data.token !== "string") throw new Error("No upscale ID was returned.");
      if (!mounted.current) return;
      storeJob(data.token);
      setToken(data.token); setQueuePosition(data.queuePosition); setPhase("queued");
      patchEntry({ token: data.token, phase: "queued", queuePosition: data.queuePosition });
      setMonitorVersion((version) => version + 1);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The upscale could not be started.";
      if (mounted.current) { setPhase("failed"); setError(message); patchEntry({ phase: "failed", error: message }); }
    } finally { submitting.current = false; }
  }, [busy, configured, resultEntry, resultImage]);

  // Switching modes shows that mode's own photo; results stay in the history.
  const setMode = useCallback((next: Mode) => {
    if (busy || next === mode) return;
    setModeState(next);
    attempt.current = null;
    setResultImage(null); setResultToken(null);
    setPhase((current) => current === "succeeded" || current === "failed" ? "idle" : current);
    if (phase !== "paused") setError(null);
  }, [busy, mode, phase]);

  // A flat lay goes to the category of the parts it was made from (not the current, possibly changed
  // checkboxes); a mannequin goes to Pose. Saved poses show in both collections, flat lays in the current one.
  const resultTarget: CategoryId | null = !resultImage ? null
    : mode === "flatlay" ? flatlayCategory(resultEntry?.parts ?? flatlaySelection)
    : mode === "pose" ? "pose" : null;
  const savedResult = resultToken ? savedBySource[resultToken] : undefined;

  const resultFile = useCallback(async () => {
    const blob = await (await fetch(resultImage!)).blob();
    const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
    return new File([blob], `${mode}-${resultTarget}.${extension}`, { type: blob.type || "image/png" });
  }, [mode, resultImage, resultTarget]);

  const saveResult = useCallback(async () => {
    if (busy || !resultTarget || !resultImage || savedResult) return;
    const label = mode === "pose" ? "Saved pose" : `Flatlay ${stylingCategories.find(({ id }) => id === resultTarget)?.label.toLowerCase()}`;
    try {
      await saveToLibrary(resultTarget, await resultFile(), { label, gender: mode === "pose" ? undefined : gender, source: resultToken ?? undefined });
    } catch { setError("This image could not be saved in the browser."); }
  }, [busy, gender, mode, resultFile, resultImage, resultTarget, resultToken, saveToLibrary, savedResult]);

  const applyResult = useCallback(async () => {
    if (busy || !resultTarget || !resultImage) return;
    if (savedResult) selectChoice(savedResult.category, savedResult.choice);
    else addReference(resultTarget, await resultFile());
    setModeState("tryon");
    attempt.current = null;
    setResultImage(null); setResultToken(null);
    setPhase("idle"); setError(null);
  }, [addReference, busy, resultFile, resultImage, resultTarget, savedResult, selectChoice]);

  // A result belongs to the photo it was generated from; a new photo starts a fresh look.
  const choosePersonFile = useCallback((file: File | null) => {
    setPersonFile(file);
    setResultImage(null);
    setPhase((current) => current === "succeeded" || current === "failed" ? "idle" : current);
    if (phase !== "paused") setError(null);
  }, [phase, setPersonFile]);

  function trackEntry(id: string) {
    const entry = history.find((item) => item.id === id);
    if (busy || !entry?.token) return;
    storeJob(entry.token);
    setToken(entry.token); setError(null); setResultImage(null); setPhase("queued");
    setMonitorVersion((version) => version + 1);
    setHistory((current) => current.map((item) => item.id === id ? { ...item, phase: "queued", error: undefined } : item));
  }

  function restoreEntry(id: string) {
    const entry = history.find((item) => item.id === id);
    if (busy || !entry?.image) return;
    tryonPhotoChosen.current = true;
    const file = entry.personFile instanceof File ? entry.personFile
      : entry.personFile ? new File([entry.personFile], "photo.jpg", { type: entry.personFile.type || "image/jpeg" }) : null;
    attempt.current = null;
    setResultImage(entry.image); setResultToken(entry.token ?? null);
    setPhase("succeeded"); setError(null);
    const restoredMode: Mode = entry.kind ?? "tryon";
    if (entry.quality) setQualities((current) => ({ ...current, [restoredMode]: entry.quality! }));
    setOutputSizes((current) => ({ ...current, [restoredMode]: entry.size ?? DEFAULT_OUTPUT_SIZE }));
    if (entry.kind === "pose") {
      setModeState("pose");
      setPhotos((current) => ({ ...current, pose: file }));
      return;
    }
    if (entry.kind === "flatlay") {
      setModeState("flatlay");
      setPhotos((current) => ({ ...current, flatlay: file }));
      setFlatlaySelection(entry.parts ?? "complete");
      return;
    }
    setModeState("tryon");
    // Entries saved before category IDs were stored are matched by their label.
    const items = entry.items.flatMap(({ category, categoryId, choice }) => {
      const id = categoryId ?? stylingCategories.find(({ label }) => label === category)?.id;
      return id ? [{ category: id, choice }] : [];
    });
    // Older entries lack the gender; outfit preset IDs still carry it.
    const presetGender = entry.items.map(({ choice }) => choice.id.match(/^(male|female)-outfit-/)?.[1]).find(Boolean) as Gender | undefined;
    restoreSelections(entry.gender ?? presetGender ?? gender, items);
    setPhotos((current) => ({ ...current, tryon: file }));
  }

  function clearHistory() {
    setHistory((current) => current.filter((entry) => inProgress(entry.phase)));
  }

  function resume() {
    setError(null); setPhase("queued"); setMonitorVersion((version) => version + 1);
    setHistory((current) => current.map((entry) => entry.token === token ? { ...entry, phase: "queued" } : entry));
  }

  const activeUpscale = phase === "submitting" ? submittingUpscale : history.find((entry) => entry.token === token)?.upscale ?? null;
  const statusText = activeUpscale && phase === "submitting" ? "Sending your image to the upscaler…"
    : activeUpscale && phase === "running" ? `Upscaling to ${activeUpscale.toUpperCase()}…${progress !== undefined ? ` ${Math.round(progress * 100)}%` : ""}`
    : activeUpscale && phase === "succeeded" ? `Upscaled to ${activeUpscale.toUpperCase()}`
    : mode === "pose" && phase === "submitting" ? "Preparing your photo…"
    : mode === "pose" && phase === "running" ? "Posing the mannequin…"
    : mode === "pose" && phase === "succeeded" ? "Your mannequin pose is ready"
    : mode === "flatlay" && phase === "submitting" ? "Preparing your photo…"
    : mode === "flatlay" && phase === "running" ? "Laying out your flat lay…"
    : mode === "flatlay" && phase === "succeeded" ? "Your flat lay is ready"
    : phase === "submitting" ? "Preparing your images…"
    : phase === "queued" ? queuePosition ? `In queue · ${queuePosition} ahead` : "Waiting for generation…"
    : phase === "running" ? "Creating your new look…"
    : phase === "paused" ? "Check status to continue this generation"
    : phase === "succeeded" ? "Your new look is ready"
    : phase === "failed" ? "Generation could not be completed"
    : configured === null ? "Connecting to Comfy…"
    : !configured ? "Connect Comfy to enable generation"
    : mode === "pose" ? !personFile ? "Upload a photo of someone in the pose" : "Ready to create the pose"
    : mode === "flatlay" ? !personFile ? "Upload a photo of a model wearing the outfit" : !hasParts ? "Choose what to extract" : "Ready to create the flat lay"
    : !personFile ? "Upload a photo to get started"
    : !hasClothing ? "Choose an outfit or clothing reference" : "Ready to generate";

  return <GenerationContext.Provider value={{ mode, setMode, quality, setQuality, outputSize, setOutputSize, flatlaySelection, setFlatlaySelection, resultTarget, resultSaved: Boolean(savedResult), saveResult, applyResult, history, trackEntry, clearHistory, restoreEntry, personFile, isExampleModel: personFile !== null && personFile === exampleFile, setPersonFile: choosePersonFile, generate, upscale, canUpscale: configured === true && !busy && Boolean(resultImage) && !resultEntry?.upscale, upscaler, resultUpscale: resultEntry?.upscale ?? null, resume, phase, busy, canGenerate: configured === true && Boolean(personFile) && ready && !busy && phase !== "paused", statusText, error, resultImage, resultRequestId: resultImage && resultToken ? tokenRequestId(resultToken) ?? null : null }}>{children}</GenerationContext.Provider>;
}

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (!context) throw new Error("useGeneration must be used within GenerationProvider");
  return context;
}
