import { PhotoUpload } from "@/components/photo-upload";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main
      id="workspace"
      className={styles.workspace}
      aria-label="Arbeitsbereich"
      tabIndex={-1}
    >
      <PhotoUpload />
    </main>
  );
}
