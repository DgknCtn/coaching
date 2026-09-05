import Link from 'next/link'
import { BRAND, contactMailto } from '@/lib/brand'
import { BrandMark } from '@/components/shared/brand-mark'

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo + tagline */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <Link href="/" className="flex items-center gap-2.5">
              <BrandMark size={32} />
              <span className="text-base font-semibold tracking-tight">{BRAND.name}</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Öğrenci takibini tek ekranda yönetin.
            </p>
            <a
              href={contactMailto(`${BRAND.name} hakkında`)}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {BRAND.contactEmail}
            </a>
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
            {/* Hukuki metinler footer'da olmak zorunda: KVKK aydınlatma
                metninin her sayfadan erişilebilir olması gerekiyor. */}
            <Link
              href="/gizlilik"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Gizlilik ve KVKK
            </Link>
            <Link
              href="/kosullar"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Kullanım Koşulları
            </Link>
            {/* Mesafeli satış üçlüsü (056): internet üzerinden tüketiciye
                satış yapıldığı sürece bu üçünün her sayfadan erişilebilir
                olması zorunlu. */}
            <Link
              href="/mesafeli-satis"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Mesafeli Satış
            </Link>
            <Link
              href="/on-bilgilendirme"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Ön Bilgilendirme
            </Link>
            <Link
              href="/iade"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              İade ve İptal
            </Link>
          </nav>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {BRAND.since} {BRAND.name}. Tüm hakları saklıdır.</span>
          <span>Türkiye&apos;nin koçluk takip platformu</span>
        </div>
      </div>
    </footer>
  )
}
