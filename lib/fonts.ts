import { IBM_Plex_Sans, Inter, Lora, Merriweather, Nunito_Sans, Source_Sans_3, Source_Serif_4, Work_Sans } from "next/font/google";

// The approved fonts. A theme names one for headings and one for body text.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-ibm-plex-sans", display: "swap", weight: ["400", "600", "700"], preload: false });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans-3", display: "swap", preload: false });
const nunito = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito-sans", display: "swap", preload: false });
const work = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans", display: "swap", preload: false });
const merriweather = Merriweather({ subsets: ["latin"], variable: "--font-merriweather", display: "swap", weight: ["400", "700"], preload: false });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif-4", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false });

export const fontVariables = [inter, plex, sourceSans, nunito, work, merriweather, sourceSerif, lora]
  .map((f) => f.variable)
  .join(" ");
