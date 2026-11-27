import type { Metadata } from "next";
import { Anton, Archivo_Black, Bebas_Neue, Oswald, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Shell from "@/components/Shell";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

// Display fonts of the Persona-style theme: Anton is the main heavy condensed face, the four
// together are mixed letter by letter in the "ransom note" headings (components/Ransom.tsx).
const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const bebas = Bebas_Neue({ variable: "--font-bebas", weight: "400", subsets: ["latin"] });
const archivo = Archivo_Black({ variable: "--font-archivo", weight: "400", subsets: ["latin"] });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Peerseus — Academic Odyssey with your Peers",
  description: "Materi kuliah, kuis AI, duel, dan teman belajar dalam satu tempat.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${jakarta.variable} ${anton.variable} ${bebas.variable} ${archivo.variable} ${oswald.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}
