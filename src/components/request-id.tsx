"use client";

import { useEffect, useState } from "react";
import styles from "./request-id.module.css";

export function RequestId({ id, className }: { id: string; className?: string }) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied("done");
    } catch { setCopied("failed"); }
  }

  return (
    <div className={`${styles.requestId} ${className ?? ""}`}>
      <span className={styles.label}>Request ID</span>
      <code className={styles.value} title={id}>{id}</code>
      <button
        type="button"
        className={styles.copy}
        data-copied={copied === "done"}
        aria-label={copied === "done" ? "Request ID copied" : "Copy request ID"}
        title={copied === "failed" ? "Copy failed. Select the ID instead." : copied === "done" ? "Copied" : "Copy request ID"}
        onClick={copy}
      >
        {copied === "done" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
          </svg>
        )}
      </button>
      <span className={styles.srOnly} role="status">{copied === "done" ? "Request ID copied" : copied === "failed" ? "Copy failed" : ""}</span>
    </div>
  );
}
