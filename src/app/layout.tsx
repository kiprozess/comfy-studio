import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { StylingProvider } from "@/components/styling-provider";
import { GenerationProvider } from "@/components/generation-provider";
import { HistoryPanel } from "@/components/history-panel";
import "./globals.css";

// Inter replaces Comfy's licensed PP Formula; comfy.org ships Inter as well.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Comfy Hackathon",
  description: "Eine kreative App auf Basis der Comfy Developer Platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={inter.variable}>
      {/* Browser extensions such as ColorZilla add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>
        <StylingProvider>
          <GenerationProvider>
          <div className="app-shell">
            <Sidebar />
            {children}
          </div>
          <HistoryPanel />
          </GenerationProvider>
        </StylingProvider>
      </body>
    </html>
  );
}
