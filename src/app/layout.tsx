import type { Metadata, Viewport } from 'next';
import { Cinzel, JetBrains_Mono, Manrope } from 'next/font/google';
import './globals.css';

const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Epyc SG — play a few notes, get a score',
  description:
    'A personal AI composer. Tap a handful of notes on the pads and Epyc SG writes, orchestrates and performs a full piece around them in the mode you pick — then hands you the MP3.',
};

export const viewport: Viewport = {
  themeColor: '#06060a',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${manrope.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
