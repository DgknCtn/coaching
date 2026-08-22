import type { Metadata } from 'next'
import { BRAND } from '@/lib/brand'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

// latin-ext, Türkçe karakterler (ğ ş ı İ ç ö ü) için zorunlu.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    'Hangi öğrenci hangi kitabın neresinde, bu hafta ne verildi, kim geride kaldı — hepsi tek ekranda. Öğretmen, öğrenci ve veli için tek sistem.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="tr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
