import { ClipboardPaste, Library } from 'lucide-react'
import { SectionHeading } from './section-heading'
import { ImportMock } from './mock/import-mock'

// HIZLI KURULUM — "kurması zor mu?" itirazı. Kitap tek tek girilmez:
// hazır kütüphaneden seçilir ya da içindekiler yapıştırılır. Kütüphanedeki
// kitap SAYISI yazılmaz — doğrulanamayan sayı kullanılmaz (taahhütler).

export function SetupSection() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading
            className="max-w-xl"
            eyebrow="Hızlı kurulum"
            title="Kitapları tek tek girmezsiniz."
            description="İlk ödevinizi kaydolduğunuz gün verebilirsiniz."
          />
          <ul className="mt-8 space-y-5">
            <li className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Library className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Hazır kitap kütüphanesi</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Yaygın soru bankaları bölüm ve testleriyle hazır. Öğrenciye atarken arayın, seçin, ödeve başlayın.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardPaste className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">İçindekileri yapıştırın</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Kütüphanede olmayan kitabın içindekiler listesini yapıştırın; bölümler, testler ve sayfalar
                  kendiliğinden çıkar.
                </p>
              </div>
            </li>
          </ul>
        </div>

        <ImportMock />
      </div>
    </section>
  )
}
