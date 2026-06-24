import Link from 'next/link'
import { GraduationCap } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo + tagline */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <Link href="/" className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
                style={{
                  background:
                    'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
                }}
              >
                <GraduationCap className="size-4 text-white" />
              </div>
              <span className="font-black text-lg tracking-tight">KoçTakip</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Koçluk sürecinizi dijitalleştirin.
            </p>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap justify-center gap-6">
            <a
              href="#ozellikler"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Özellikler
            </a>
            <a
              href="#nasil-calisir"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Nasıl Çalışır
            </a>
            <Link
              href="/demo"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Demo
            </Link>
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Giriş Yap
            </Link>
            <Link
              href="/register"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Kayıt Ol
            </Link>
          </nav>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© 2026 KoçTakip. Tüm hakları saklıdır.</span>
          <span>Türkiye&apos;nin koçluk takip platformu</span>
        </div>
      </div>
    </footer>
  )
}
