import type { Metadata } from 'next'
import { BRAND } from '@/lib/brand'
import { ThemeProvider } from '@/components/shared/theme-provider'
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
    // suppressHydrationWarning: next-themes tema sınıfını hidrasyondan ÖNCE
    // <html>'e yazar; React'in sunucu/istemci karşılaştırması aksi halde
    // burada uyarı verir. Yalnız bu etiketi kapsar.
    <html lang="tr" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
