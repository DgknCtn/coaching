import { Plus, Send } from 'lucide-react'
import { BookMapGrid } from '@/components/shared/book-map-grid'
import { DEMO_BASKET, demoBook } from '../demo/tour-fixtures'
import { BrowserWindow } from './browser-window'

// ÖDEV VERME — gerçek Kitap Haritası (BookMapGrid, salt okunur) + sayfa
// aralığı satırı + haftalık plan sepeti. Renkler ve durum etiketleri
// uygulamanın kendisinden; örnek kitap tour-fixtures.ts'te.

export function HomeworkMock() {
  const book = demoBook()
  return (
    <BrowserWindow
      title="Ödev Ver · TYT Matematik Soru Bankası"
      label="Ödev verme ekranı: kitap haritasında testlerin durumu renklerle, sayfa aralığıyla ödeve ekleme ve haftalık plan sepeti"
    >
      <div className="grid gap-3 p-3 @2xl:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="min-w-0 space-y-3">
          <div className="max-h-[300px] overflow-hidden">
            <BookMapGrid book={book} readOnly />
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Sayfalar</span>
            <span className="rounded-md border bg-background px-2 py-1 font-mono tabular-nums">2-10</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground">
              <Plus className="size-3" />
              Ödeve ekle
            </span>
            <span className="text-muted-foreground">→ 9 sayfa ödeve eklendi</span>
          </div>
        </div>
        <div className="hidden space-y-2 rounded-lg border p-3 text-xs @2xl:block">
          <p className="font-medium">Haftalık Çalışma Planı</p>
          <p className="text-[11px] text-muted-foreground">Son teslim: sıradaki ders</p>
          <ul className="space-y-1.5 pt-1">
            {DEMO_BASKET.map(item => (
              <li key={item.unit} className="rounded-md border bg-background px-2 py-1.5">
                <p className="truncate text-[11px] font-medium text-primary">{item.book}</p>
                <p className="truncate text-[11px] text-muted-foreground">{item.unit}</p>
              </li>
            ))}
          </ul>
          <span className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground">
            <Send className="size-3" />
            Planı yayımla
          </span>
        </div>
      </div>
    </BrowserWindow>
  )
}
