import styles from "./download-button.module.css";

// Filled yellow Comfy button with icon, as on comfy.org/hub.
export function DownloadButton({ href, small = false, upscale }: { href: string; small?: boolean; upscale?: string | null }) {
  const extension = href.startsWith("data:image/jpeg") ? "jpg" : href.startsWith("data:image/webp") ? "webp" : "png";
  return (
    <a className={styles.button} data-size={small ? "small" : undefined} href={href} download={`comfy-stylist${upscale ? `-${upscale}` : ""}.${extension}`} title="Download generated image">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />
      </svg>
      Download
    </a>
  );
}
