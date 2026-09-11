'use client'

import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Liste ekranlarının arama kutusu.
 *
 * NEDEN AYRI BİR BİLEŞEN: `Input` + içine mutlak konumlanmış `Search`
 * ikonu deseni `finance-table.tsx` ve `book-pool-filters.tsx`'te iki kez
 * elle yazılmıştı. Üçüncü kopya, üç farklı ikon boşluğu ve üç farklı
 * temizleme davranışı demekti.
 *
 * FİLTRELEME BURADA DEĞİL: bileşen yalnız görünüm ve değer taşır.
 * Çağıran istemcide mi süzüyor (finans tablosu), URL'ye mi yazıyor
 * (kitap havuzu) — bu kararı bileşen vermez.
 *
 * TEMİZLEME DÜĞMESİ YALNIZ DEĞER VARKEN: boş kutunun yanında duran bir
 * çarpı, basıldığında hiçbir şey yapmayan bir düğmedir.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Ara…',
  ariaLabel,
  className,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        // TARAYICININ KENDİ TEMİZLEME DÜĞMESİ GİZLENİYOR.
        //
        // `type="search"` Chromium'da bir ✕ çiziyor ve aşağıdaki kendi
        // düğmemizle yan yana düşüyordu: aynı işi yapan iki düğme,
        // hangisinin ne yaptığı belirsiz. Kendi düğmemiz kalıyor çünkü
        // erişilebilir adı var ve her tarayıcıda aynı görünüyor.
        className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Aramayı temizle"
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
