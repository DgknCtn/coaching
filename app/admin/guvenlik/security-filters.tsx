import { Search } from 'lucide-react'
import { authEventLabel } from '@/lib/auth-audit'
import { cn } from '@/lib/utils'

/**
 * Giriş kaydı filtreleri.
 *
 * SUNUCU BİLEŞENİ VE DÜZ HTML FORM — bilinçli.
 *
 * Filtre durumu adres çubuğunda yaşıyor: yönetici bir görünümü ekip
 * arkadaşına gönderebiliyor, geri tuşu beklendiği gibi çalışıyor ve
 * sayfalama filtreyle tutarlı kalıyor. İstemci bileşeni yapılsaydı bu
 * üçü için ayrıca kod yazmak gerekirdi ve durum iki yerde yaşardı.
 *
 * Arama kutusu için `SearchInput` KULLANILMADI: o bileşen `useState` ile
 * çalışan bir istemci bileşeni ve süzmeyi anında yapıyor. Burada süzme
 * SUNUCUDA — tablo yüz binlerce satıra çıkabilir ve tamamını istemciye
 * indirmek mümkün değil.
 */

const FILTERS = [
  { value: '', label: 'Hepsi' },
  { value: 'login.success', label: null },
  { value: 'login.failed', label: null },
  { value: 'login.rate_limited', label: null },
  { value: 'logout', label: null },
  { value: 'password_changed', label: null },
] as const

export function SecurityFilters({
  selectedType,
  search,
}: {
  selectedType: string | null
  search: string
}) {
  return (
    <div className="mb-4 space-y-3">
      <form method="GET" action="/admin/guvenlik" className="flex flex-wrap gap-2">
        {/* Arama yapılırken seçili olay türü KORUNUR. Gizli alan
            olmasaydı arama, filtreyi sessizce sıfırlardı. */}
        {selectedType && <input type="hidden" name="tur" value={selectedType} />}

        <div className="relative flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Ad, IP veya ülke ara…"
            aria-label="Giriş kayıtlarında ara"
            className={cn(
              'h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          />
        </div>

        <button
          type="submit"
          className={cn(
            'h-9 rounded-md border border-input px-4 text-sm font-medium',
            'hover:bg-accent hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          Ara
        </button>

        {(search || selectedType) && (
          <a
            href="/admin/guvenlik"
            className="flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Temizle
          </a>
        )}
      </form>

      {/* Olay türü sekmeleri: bağlantı, düğme değil — aynı gerekçe. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Olay türü filtresi">
        {FILTERS.map((f) => {
          const active = (selectedType ?? '') === f.value
          const params = new URLSearchParams()
          if (f.value) params.set('tur', f.value)
          if (search) params.set('q', search)
          const qs = params.toString()

          return (
            <a
              key={f.value || 'hepsi'}
              href={`/admin/guvenlik${qs ? `?${qs}` : ''}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {f.label ?? authEventLabel(f.value)}
            </a>
          )
        })}
      </div>
    </div>
  )
}
