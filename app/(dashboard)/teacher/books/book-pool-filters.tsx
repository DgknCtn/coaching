'use client'

// Kitap Havuzu filtre çubuğu (R4 §2).
//
// Filtre durumu URL'de tutulur: sunucu bileşeni sorguyu searchParams'tan
// kurar, bu bileşen yalnızca URL'i günceller. Böylece filtreli bir havuz
// görünümü paylaşılabilir/yer imlenebilir ve 100+ kitapta filtreleme
// istemciye tüm listeyi indirmeden yapılır.

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SUBJECTS, LEVEL_EXAMS, TRACKING_MODE_OPTIONS } from '@/lib/book-taxonomy'

interface Props {
  /** Havuzda gerçekten bulunan yayınlar — boş seçenek göstermemek için. */
  publishers: string[]
  /** Havuzda gerçekten bulunan baskı yılları. */
  editionYears: number[]
  resultCount: number
}

const SEARCH_DEBOUNCE_MS = 300

export function BookPoolFilters({ publishers, editionYears, resultCount }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  const [search, setSearch] = useState(params.get('q') ?? '')

  // Arama kutusu her tuşta yeni bir sunucu isteği tetiklemesin.
  useEffect(() => {
    const current = params.get('q') ?? ''
    if (search === current) return
    const timer = setTimeout(() => setParam('q', search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    startTransition(() => {
      router.replace(next.toString() ? `${pathname}?${next}` : pathname)
    })
  }

  const activeFilters = ['subject', 'level', 'publisher', 'year', 'tracking', 'q'].filter((k) =>
    params.get(k)
  )

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Kitap adı veya yayın ara"
          aria-label="Kitap havuzunda ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="filter-subject" className="text-xs text-muted-foreground">Ders</Label>
          <NativeSelect
            id="filter-subject"
            value={params.get('subject') ?? ''}
            onChange={(e) => setParam('subject', e.target.value)}
          >
            <option value="">Tümü</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
        </div>

        <div className="space-y-1">
          <Label htmlFor="filter-level" className="text-xs text-muted-foreground">Seviye / Sınav</Label>
          <NativeSelect
            id="filter-level"
            value={params.get('level') ?? ''}
            onChange={(e) => setParam('level', e.target.value)}
          >
            <option value="">Tümü</option>
            {LEVEL_EXAMS.map((l) => <option key={l} value={l}>{l}</option>)}
          </NativeSelect>
        </div>

        <div className="space-y-1">
          <Label htmlFor="filter-publisher" className="text-xs text-muted-foreground">Yayın</Label>
          <NativeSelect
            id="filter-publisher"
            value={params.get('publisher') ?? ''}
            onChange={(e) => setParam('publisher', e.target.value)}
          >
            <option value="">Tümü</option>
            {publishers.map((p) => <option key={p} value={p}>{p}</option>)}
          </NativeSelect>
        </div>

        <div className="space-y-1">
          <Label htmlFor="filter-year" className="text-xs text-muted-foreground">Baskı Yılı</Label>
          <NativeSelect
            id="filter-year"
            value={params.get('year') ?? ''}
            onChange={(e) => setParam('year', e.target.value)}
          >
            <option value="">Tümü</option>
            {editionYears.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </NativeSelect>
        </div>

        <div className="space-y-1">
          <Label htmlFor="filter-tracking" className="text-xs text-muted-foreground">Takip Türü</Label>
          <NativeSelect
            id="filter-tracking"
            value={params.get('tracking') ?? ''}
            onChange={(e) => setParam('tracking', e.target.value)}
          >
            <option value="">Tümü</option>
            {TRACKING_MODE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </NativeSelect>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{resultCount} kitap listeleniyor</p>
        {activeFilters.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              startTransition(() => router.replace(pathname))
            }}
          >
            <X className="size-3.5" />
            Filtreleri temizle
          </Button>
        )}
      </div>
    </div>
  )
}
