import type { Metadata } from "next";
import { Bangers, Dela_Gothic_One, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Shell from "@/components/Shell";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

// Comic display type (headings, buttons, navbar) and a heavy Japanese-capable face for the decorative katakana.
const bangers = Bangers({ variable: "--font-bangers", weight: "400", subsets: ["latin"] });
const dela = Dela_Gothic_One({ variable: "--font-dela", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Peerseus — Academic Odyssey with your Peers",
  description: "Materi kuliah, kuis AI, duel, dan teman belajar dalam satu tempat.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${jakarta.variable} ${bangers.variable} ${dela.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}
