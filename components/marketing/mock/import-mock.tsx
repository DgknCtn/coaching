import { ArrowRight } from 'lucide-react'
import { parseBookOutline } from '@/lib/book-import'
import { BrowserWindow } from './browser-window'

// İÇİNDEKİLERİ YAPIŞTIR — sağdaki önizleme UYGULAMANIN GERÇEK
// ayrıştırıcısının (lib/book-import.ts) bu metin için ürettiği sonuçtur;
// elle yazılmış bir liste değil.

export const DEMO_OUTLINE = [
  '1. Bölüm - Sayılar',
  '  Temel Kavramlar      1-4',
  '  Tek-Çift Sayılar     5-8',
  '2. Bölüm - Problemler',
  '  Yaş Problemleri      1-6',
  '  Hız Problemleri      7-10',
].join('\n')

export function ImportMock() {
  const parsed = parseBookOutline(DEMO_OUTLINE)
  return (
    <BrowserWindow
      title="Kitap ekle · içindekileri yapıştır"
      label="İçindekiler metni yapıştırılınca bölüm, alt bölüm ve test aralıklarının önizlemesi"
    >
      <div className="grid items-center gap-3 p-4 @lg:grid-cols-[1fr_auto_1fr]">
        <pre className="overflow-hidden rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {DEMO_OUTLINE}
        </pre>
        <ArrowRight className="mx-auto size-5 rotate-90 text-primary @lg:rotate-0" />
        <div className="space-y-2">
          {parsed.chapters.map(ch => (
            <div key={ch.title} className="rounded-lg border bg-background px-3 py-2 text-xs">
              <p className="font-medium">{ch.title}</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {ch.subsections.map(s => (
                  <li key={s.title} className="flex justify-between gap-2">
                    <span>{s.title}</span>
                    <span className="tabular-nums">
                      Test {s.testStart}
                      {s.testEnd !== s.testStart ? `-${s.testEnd}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[11px] font-medium text-primary">Önizleme: {parsed.totalTests} test oluşturulacak</p>
        </div>
      </div>
    </BrowserWindow>
  )
}
