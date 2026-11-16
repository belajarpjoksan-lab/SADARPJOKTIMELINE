import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Barlow_Condensed } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'SADARPJOK - Pemantauan Aktivitas Olahraga Siswa Real-Time & Sistematis',
  description:
    'Aplikasi SADARPJOK untuk memantau aktivitas olahraga siswa secara real-time dan sistematis, tes kebugaran jasmani (TKJI), dan evaluasi PJOK terpadu.',
  openGraph: {
    title: 'SADARPJOK - Pemantauan Aktivitas Olahraga Siswa Real-Time & Sistematis',
    description:
      'Aplikasi SADARPJOK untuk memantau aktivitas olahraga siswa secara real-time dan sistematis, tes kebugaran jasmani (TKJI), dan evaluasi PJOK terpadu.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SADARPJOK - Pemantauan Aktivitas Olahraga Siswa Real-Time & Sistematis',
    description:
      'Aplikasi SADARPJOK untuk memantau aktivitas olahraga siswa secara real-time dan sistematis, tes kebugaran jasmani (TKJI), dan evaluasi PJOK terpadu.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${plusJakarta.variable} ${barlowCondensed.variable}`}>
      <body className={plusJakarta.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
