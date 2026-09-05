import type { Metadata, Viewport } from 'next'
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

  // Manifesto app/manifest.ts'ten geliyor; burada yalnız ikon yolları.
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },

  // iOS manifest'in display alanını okumaz; tam ekran açılış için hâlâ
  // kendi meta etiketlerini ister.
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    statusBarStyle: 'default',
  },
}

// Tarayıcı arayüzünün rengi temaya göre değişmeli: tek bir turuncu değer,
// koyu temada ekranın üstünde yanan bir şerit bırakırdı.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#bd4816' },
    { media: '(prefers-color-scheme: dark)', color: '#2a1a12' },
  ],
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
