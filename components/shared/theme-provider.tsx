'use client'

// Tema sağlayıcısı.
//
// Renk paletinin koyu hâli app/globals.css'te (.dark bloğu) zaten tanımlı ve
// globals.css:5'teki `@custom-variant dark (&:is(.dark *))` sayesinde tema
// SINIF tabanlı çalışıyor. Burada yapılan tek şey <html> etiketine `.dark`
// sınıfını koymak ve tercihi hatırlamak.
//
// Neden next-themes: uygulamanın tamamı SSR (17 sayfa force-dynamic). Tercih
// yalnız localStorage'dan okunup React yüklendikten sonra uygulansaydı, koyu
// tema kullanıcısı her sayfa geçişinde bir anlık beyaz parlama görürdü —
// yani tam da gözü yoran şey. next-themes bunu <head>'e koyduğu senkron
// script ile, ilk boyamadan önce çözüyor.
//
// Ayarlar bilinçli: sistem tercihi izlenmiyor (enableSystem={false}),
// varsayılan açık tema, iki durumlu geçiş.

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      // Geçiş anında tüm CSS transition'larını kapatır: aksi halde renk
      // değişimi bileşen bileşen "dalga" hâlinde yayılıyor gibi görünür.
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
