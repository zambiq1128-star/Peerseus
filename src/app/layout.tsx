import type { Metadata } from "next";
import { Oswald, Plus_Jakarta_Sans, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Shell from "@/components/Shell";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
// Monospace display type of the sign-in screen (Figma design).
const mono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });

// Condensed display type of the JRPG menu look (navbar, hero).
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Peerseus — Academic Odyssey with your Peers",
  description: "Materi kuliah, kuis AI, duel, dan teman belajar dalam satu tempat.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${jakarta.variable} ${mono.variable} ${oswald.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}
