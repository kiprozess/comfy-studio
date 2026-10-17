"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { stylingCategories, type CategoryId } from "@/lib/styling-categories";
import type { Gender, StylingChoice } from "@/lib/styling-types";
import { deleteLibraryItem, loadLibrary, saveLibraryItem, type LibraryItem } from "@/lib/history-store";

const genders: Gender[] = ["male", "female"];
const libraryKeys = (item: Pick<LibraryItem, "category" | "gender">) => (item.gender ? [item.gender] : genders).map((value) => `${value}:${item.category}`);

type StylingState = {
  gender: Gender;
  setGender: Dispatch<SetStateAction<Gender>>;
  selections: Record<string, StylingChoice | undefined>;
  uploads: Record<string, StylingChoice[]>;
  toggleChoice: (category: CategoryId, choice: StylingChoice) => void;
  addReference: (category: CategoryId, file: File) => void;
  resetStyling: () => void;
  restoreSelections: (gender: Gender, items: { category: CategoryId; choice: StylingChoice }[]) => void;
  /** Selects a choice in the current collection without toggling it off. */
  selectChoice: (category: CategoryId, choice: StylingChoice) => void;
  /** Keeps a result as a sidebar tile across reloads; without a gender it shows in both collections. */
  saveToLibrary: (category: CategoryId, file: File, options: { label: string; gender?: Gender; source?: string }) => Promise<StylingChoice>;
  removeFromLibrary: (choice: StylingChoice) => void;
  /** Saved tiles by the result they came from. */
  savedBySource: Record<string, { category: CategoryId; choice: StylingChoice }>;
};

const StylingContext = createContext<StylingState | null>(null);

export function StylingProvider({ children }: { children: ReactNode }) {
  const [gender, setGender] = useState<Gender>("male");
  const [selections, setSelections] = useState<StylingState["selections"]>({});
  const [uploads, setUploads] = useState<StylingState["uploads"]>({});
  const objectUrls = useRef(new Set<string>());
  const [library, setLibrary] = useState<{ item: LibraryItem; choice: StylingChoice }[]>([]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const libraryChoice = useCallback((item: LibraryItem): StylingChoice => {
    const imageUrl = URL.createObjectURL(item.file);
    objectUrls.current.add(imageUrl);
    const file = item.file instanceof File ? item.file : new File([item.file], `${item.label}.png`, { type: item.file.type || "image/png" });
    return { id: item.id, label: item.label, imageUrl, file, saved: true };
  }, []);

  // Saved tiles come back after a reload, before anything the user uploads in this session.
  useEffect(() => {
    let cancelled = false;
    loadLibrary().then((items) => {
      if (cancelled || items.length === 0) return;
      const loaded = items.map((item) => ({ item, choice: libraryChoice(item) }));
      setLibrary(loaded);
      setUploads((current) => {
        const next = { ...current };
        for (const { item, choice } of loaded) {
          for (const key of libraryKeys(item)) if (!next[key]?.some(({ id }) => id === choice.id)) next[key] = [choice, ...(next[key] ?? [])];
        }
        return next;
      });
    }).catch(() => { /* The library is optional without IndexedDB. */ });
    return () => { cancelled = true; };
  }, [libraryChoice]);

  const saveToLibrary = useCallback(async (category: CategoryId, file: File, options: { label: string; gender?: Gender; source?: string }) => {
    const item: LibraryItem = { id: crypto.randomUUID(), category, gender: options.gender, label: options.label, file, source: options.source, createdAt: Date.now() };
    await saveLibraryItem(item);
    const choice = libraryChoice(item);
    setLibrary((current) => [...current, { item, choice }]);
    setUploads((current) => {
      const next = { ...current };
      for (const key of libraryKeys(item)) next[key] = [...(next[key] ?? []), choice];
      return next;
    });
    return choice;
  }, [libraryChoice]);

  const removeFromLibrary = useCallback((choice: StylingChoice) => {
    const entry = library.find(({ choice: saved }) => saved.id === choice.id);
    if (!entry) return;
    void deleteLibraryItem(entry.item.id).catch(() => { /* It disappears from this session either way. */ });
    setLibrary((current) => current.filter(({ choice: saved }) => saved.id !== choice.id));
    const keys = libraryKeys(entry.item);
    setUploads((current) => {
      const next = { ...current };
      for (const key of keys) next[key] = (next[key] ?? []).filter(({ id }) => id !== choice.id);
      return next;
    });
    setSelections((current) => {
      const next = { ...current };
      for (const key of keys) if (next[key]?.id === choice.id) next[key] = undefined;
      return next;
    });
  }, [library]);

  const savedBySource = useMemo(() => Object.fromEntries(library.flatMap(({ item, choice }) => item.source ? [[item.source, { category: item.category, choice }]] : [])), [library]);

  const selectChoice = useCallback((category: CategoryId, choice: StylingChoice) => {
    setSelections((current) => ({ ...current, [`${gender}:${category}`]: choice }));
  }, [gender]);

  const toggleChoice = useCallback((category: CategoryId, choice: StylingChoice) => {
    const key = `${gender}:${category}`;
    setSelections((current) => ({
      ...current,
      [key]: current[key]?.id === choice.id ? undefined : choice,
    }));
  }, [gender]);

  const addReference = useCallback((category: CategoryId, file: File) => {
    const imageUrl = URL.createObjectURL(file);
    objectUrls.current.add(imageUrl);
    const choice: StylingChoice = { id: crypto.randomUUID(), label: file.name, imageUrl, file };
    const key = `${gender}:${category}`;
    setUploads((current) => ({ ...current, [key]: [...(current[key] ?? []), choice] }));
    setSelections((current) => ({ ...current, [key]: choice }));
  }, [gender]);

  // Reset clears the session; saved library tiles stay.
  const resetStyling = useCallback(() => {
    const keep = new Set(library.map(({ choice }) => choice.imageUrl));
    objectUrls.current.forEach((url) => { if (!keep.has(url)) { URL.revokeObjectURL(url); objectUrls.current.delete(url); } });
    setGender("male");
    setSelections({});
    setUploads(() => {
      const next: StylingState["uploads"] = {};
      for (const { item, choice } of library) for (const key of libraryKeys(item)) next[key] = [...(next[key] ?? []), choice];
      return next;
    });
  }, [library]);

  // Replaces one collection's selection with an earlier generation's; uploaded references return as sidebar tiles.
  const restoreSelections = useCallback((nextGender: Gender, items: { category: CategoryId; choice: StylingChoice }[]) => {
    // Older history can contain references to the removed bundled outfits.
    const restored = items.filter(({ choice }) => !("atlasIndex" in choice && choice.atlasIndex !== undefined)).map(({ category, choice }) => {
      if (!choice.file) return { category, choice };
      const imageUrl = URL.createObjectURL(choice.file);
      objectUrls.current.add(imageUrl);
      return { category, choice: { ...choice, imageUrl } };
    });
    setGender(nextGender);
    setSelections((current) => {
      const next = { ...current };
      for (const category of stylingCategories) delete next[`${nextGender}:${category.id}`];
      for (const { category, choice } of restored) next[`${nextGender}:${category}`] = choice;
      return next;
    });
    setUploads((current) => {
      const next = { ...current };
      for (const { category, choice } of restored) {
        if (!choice.file) continue;
        const key = `${nextGender}:${category}`;
        const existing = next[key] ?? [];
        next[key] = existing.some(({ id }) => id === choice.id) ? existing.map((item) => item.id === choice.id ? choice : item) : [...existing, choice];
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    gender, setGender, selections, uploads, toggleChoice, addReference, resetStyling, restoreSelections, selectChoice, saveToLibrary, removeFromLibrary, savedBySource,
  }), [gender, selections, uploads, toggleChoice, addReference, resetStyling, restoreSelections, selectChoice, saveToLibrary, removeFromLibrary, savedBySource]);

  return <StylingContext.Provider value={value}>{children}</StylingContext.Provider>;
}

export function useStyling() {
  const context = useContext(StylingContext);
  if (!context) throw new Error("useStyling must be used within StylingProvider");
  return context;
}
