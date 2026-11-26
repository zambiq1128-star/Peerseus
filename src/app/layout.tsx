import type { Metadata } from "next";
import { Gaegu, Pixelify_Sans, Plus_Jakarta_Sans, VT323 } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Shell from "@/components/Shell";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

// Handwriting for headings only; body, quiz and materials stay in the sans font.
const gaegu = Gaegu({ variable: "--font-gaegu", subsets: ["latin"], weight: ["300", "400", "700"] });

// Pixel font for small labels, badges, the menu and numbers (rating, score, timer). Original use of an open font.
const pixel = Pixelify_Sans({ variable: "--font-pixel-var", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Big numbers (score, rating, timer) use VT323: tall, thin pixel digits, so 0, 5, 6, 8 and 9 stay clearly different.
const pixelNum = VT323({ variable: "--font-num-var", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Peerseus — Academic Odyssey with your Peers",
  description: "Materi kuliah, kuis AI, duel, dan teman belajar dalam satu tempat.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${jakarta.variable} ${gaegu.variable} ${pixel.variable} ${pixelNum.variable}`}>
      <body className="font-sans antialiased">
        {/* Pencil wobble for hand-drawn outlines (used by filter: url(#pencil) in globals.css). Decorative only. */}
        <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute" }}>
          <filter id="pencil" x="-10%" y="-50%" width="120%" height="200%">
            <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="4" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="pencil-thin" x="-10%" y="-50%" width="120%" height="200%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="1" seed="9" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}
