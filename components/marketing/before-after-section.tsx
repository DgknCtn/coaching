import { Check, X } from 'lucide-react'
import { BRAND } from '@/lib/brand'

// ÖNCE / SONRA.
//
// ============================================================
// NEDEN LİSTE, NEDEN İKİ SÜTUN
//
// Ürünün değeri özellik adlarıyla değil, ORTADAN KALKAN İŞLERLE
// anlaşılıyor. Soldaki maddelerin hepsi öğretmenin bugün gerçekten
// yaptığı şeyler; sağdakiler ürünün bugün gerçekten yaptıkları.
// Hiçbir satır gelecekte yapılacak bir şeyi anlatmıyor.
//
// İkonlar emoji değil: emoji platformdan platforma farklı çiziliyor ve
// koyu temada okunurluğu düşüyor.
// ============================================================

const BEFORE = [
  "WhatsApp'ta dağılan ödevler",
  "Excel'de tutulan öğrenci listeleri",
  'Defterde kitap takibi',
  '"Hocam ben ne yapacaktım?" mesajları',
  '"Çocuğum nasıl gidiyor?" soruları',
  'Kimin geride kaldığını fark edememe',
]

const AFTER = [
  'Tüm öğrenciler tek ekranda',
  'Haftalık ödev planı',
  'Kitap ilerleme takibi',
  'Öğretmen onaylı ilerleme',
  'Veli kendi panelinden takip eder',
  'Riskli öğrencileri anında görün',
]

export function BeforeAfterSection() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-muted/30 p-6">
          <h2 className="text-base font-semibold">{BRAND.name}&apos;den önce</h2>
          <ul className="mt-4 space-y-2.5">
            {BEFORE.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <X aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-primary/30 bg-card p-6">
          <h2 className="text-base font-semibold">{BRAND.name}&apos;den sonra</h2>
          <ul className="mt-4 space-y-2.5">
            {AFTER.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success-foreground" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
