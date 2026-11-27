import { ArrowRight, ClipboardPaste, Library } from 'lucide-react'
import { SectionHeading } from './section-heading'
import { BrowserWindow } from './mock/browser-window'

// HIZLI KURULUM — "kurması zor mu?" itirazı. Kitap tek tek girilmez:
// hazır kütüphaneden seçilir ya da içindekiler yapıştırılır. Kütüphanedeki
// kitap SAYISI yazılmaz — doğrulanamayan sayı kullanılmaz (taahhütler).

const PASTED = ['1. Denklemler ........ 5', '   Test 1-6', '2. Problemler ........ 41', '   Test 1-8', '3. Oran ve Orantı .... 77', '   Test 1-7']

const PARSED = [
  { title: 'Denklemler', detail: '6 test' },
  { title: 'Problemler', detail: '8 test' },
  { title: 'Oran ve Orantı', detail: '7 test' },
]

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

        <BrowserWindow title="Kitap ekle · içindekileri yapıştır" label="İçindekiler metni yapıştırılınca bölüm listesinin kendiliğinden oluşması">
          <div className="grid items-center gap-3 p-4 sm:grid-cols-[1fr_auto_1fr]">
            <pre className="overflow-hidden rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {PASTED.join('\n')}
            </pre>
            <ArrowRight className="mx-auto size-5 rotate-90 text-primary sm:rotate-0" />
            <ul className="space-y-2">
              {PARSED.map(p => (
                <li key={p.title} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-muted-foreground">{p.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </BrowserWindow>
      </div>
    </section>
  )
}
