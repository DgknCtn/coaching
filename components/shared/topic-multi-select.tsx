'use client'

import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Müfredat konusu çoklu seçici (R7-02 §8).
//
// Neden ayrı bir bileşen: NativeSelect tek seçimdir ve 200+ konu içinde
// arama yapılamaz. Şartnamenin istediği üç şey aynı anda gerekiyordu:
// filtreli liste, arama ve çoklu seçim (kabul #8, #9).
//
// Bilinçli olarak sade: popover/command palette yerine düz bir arama kutusu
// + kaydırılabilir liste. Bölüm satırı zaten yoğun; buraya ikinci bir katman
// açan bir menü koymak düzenleme akışını ağırlaştırırdı.
//
// FİLTRELEME BURADA YAPILMAZ: hangi konuların gösterileceğine çağıran karar
// verir (kitabın dersi/seviyesi/programı). Bu bileşen yalnız aldığı listeyi
// gösterir — "TYT Matematik'te AYT Felsefe görünmesin" kuralının tek yeri
// sorgu tarafıdır, iki yerde ayrı ayrı uygulanmaz.

export interface TopicOption {
  id: string
  name: string
  scopeName: string
}

interface Props {
  topics: TopicOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  /**
   * Liste kitabın ders/seviye bilgisine göre gerçekten filtrelenebildi mi?
   *
   * false ise eşleşen kapsam bulunamamıştır ve tüm konular listeleniyordur.
   * Bu bir hata değil, kaçış yoludur: filtre listeyi daraltmalı, eşleştirmeyi
   * imkânsız kılmamalı.
   */
  filtered?: boolean
  /** Liste boşken gösterilecek metin; kitabın dersine uygun kapsam yoksa
   *  öğretmen nedenini bilmeli. */
  emptyHint?: string
}

export function TopicMultiSelect({
  topics,
  selectedIds,
  onChange,
  disabled,
  filtered = true,
  emptyHint = 'Önce Müfredat ekranından bir kapsam ve konu tanımlayın.',
}: Props) {
  const [query, setQuery] = useState('')

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const groupedTopics = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    const list = q
      ? topics.filter(
          t =>
            t.name.toLocaleLowerCase('tr').includes(q) ||
            t.scopeName.toLocaleLowerCase('tr').includes(q)
        )
      : topics

    // Kapsam başlığı altında grupla: aynı ad farklı kapsamlarda ayrı
    // konudur ("Fonksiyonlar" hem TYT hem AYT Matematik'te olabilir).
    const groups = new Map<string, TopicOption[]>()
    for (const topic of list) {
      const bucket = groups.get(topic.scopeName)
      if (bucket) bucket.push(topic)
      else groups.set(topic.scopeName, [topic])
    }
    return [...groups.entries()]
  }, [topics, query])

  const selectedTopics = useMemo(
    () => topics.filter(t => selected.has(t.id)),
    [topics, selected]
  )

  function toggle(id: string) {
    if (disabled) return
    onChange(selected.has(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  if (topics.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyHint}</p>
  }

  return (
    <div className="space-y-2">
      {selectedTopics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTopics.map(topic => (
            <Badge key={topic.id} variant="info" className="gap-1">
              <span className="truncate">{topic.name}</span>
              <button
                type="button"
                onClick={() => toggle(topic.id)}
                disabled={disabled}
                aria-label={`${topic.name} eşlemesini kaldır`}
                className="rounded-sm hover:bg-background/40"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {!filtered && (
        <p className="text-xs text-muted-foreground">
          Bu kitabın ders/seviye bilgisine uyan kapsam bulunamadı; tüm konular
          listeleniyor.
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="Konu ara"
          className="h-8 pl-8 text-xs"
          aria-label="Müfredat konusu ara"
        />
      </div>

      <div className="max-h-48 overflow-y-auto rounded-md border">
        {groupedTopics.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Eşleşen konu yok.</p>
        ) : (
          groupedTopics.map(([scopeName, list]) => (
            <div key={scopeName}>
              <p className="sticky top-0 bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {scopeName}
              </p>
              {list.map(topic => {
                const isSelected = selected.has(topic.id)
                return (
                  <button
                    key={topic.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggle(topic.id)}
                    disabled={disabled}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                      isSelected && 'text-primary',
                      disabled && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'
                      )}
                    >
                      {isSelected && <Check className="size-2.5" />}
                    </span>
                    <span className="truncate">{topic.name}</span>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Eşleme zorunlu değildir ve bölümün tamamlanması konuyu otomatik
        &quot;öğrenildi&quot; yapmaz.
      </p>
    </div>
  )
}
