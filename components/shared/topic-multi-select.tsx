'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronRight, Plus, Search, Sparkles, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { suggestTopics, TIER_ORDER, type ScopeTier } from '@/lib/topic-relevance'

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
// KADEME ÇAĞIRANDAN GELİR (Kitap Girişi ve Konu Eşleme · 2a): her konu
// kapsamının kitaba göre kademesini (`tier`) taşır. Bu bileşen yalnız
// sıralar ve "Diğer kapsamlar"ı kapalı tutar; kademe kararı
// lib/topic-relevance.ts'te, tek yerde.
//
// 2d: liste varsayılan KAPALI — bölümde yalnız eşlenmiş konular, öneriler
// ve "Konu ekle" görünür.

export interface TopicOption {
  id: string
  name: string
  scopeName: string
  /** Kitaba göre kapsam kademesi (2a). Yoksa "ilgili" sayılır. */
  tier?: ScopeTier
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
  /** Bölüm adı (2b): verilirse en yakın 1–3 konu öneri düğmesi olarak çıkar. */
  suggestFor?: string
  /** Liste açık mı başlasın (2d: varsayılan KAPALI — 30 bölümde 30 tam liste sayfayı ağırlaştırıyordu). */
  defaultOpen?: boolean
}

export function TopicMultiSelect({
  topics,
  selectedIds,
  onChange,
  disabled,
  filtered = true,
  emptyHint = 'Önce Müfredat ekranından bir kapsam ve konu tanımlayın.',
  suggestFor,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const [showOther, setShowOther] = useState(false)

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const selectedTopics = useMemo(
    () => topics.filter(t => selected.has(t.id)),
    [topics, selected]
  )

  // 2b: öneriler — seçili olanlar önerilmez.
  const suggestions = useMemo(
    () =>
      suggestFor
        ? suggestTopics(
            suggestFor,
            topics.filter(t => !selected.has(t.id))
          ).map(s => s.topic)
        : [],
    [suggestFor, topics, selected]
  )

  const { main, other } = useMemo(() => {
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
    // 2a: gruplar kademeye göre sıralanır — kitabın kendi kapsamı en üstte.
    const groups = new Map<string, { tier: ScopeTier; list: TopicOption[] }>()
    for (const topic of list) {
      const tier = topic.tier ?? 'related'
      const bucket = groups.get(topic.scopeName)
      if (bucket) bucket.list.push(topic)
      else groups.set(topic.scopeName, { tier, list: [topic] })
    }
    const sorted = [...groups.entries()].sort(
      (a, b) => TIER_ORDER[a[1].tier] - TIER_ORDER[b[1].tier]
    )
    return {
      main: sorted.filter(([, g]) => g.tier !== 'other'),
      other: sorted.filter(([, g]) => g.tier === 'other'),
    }
  }, [topics, query])

  function toggle(id: string) {
    if (disabled) return
    onChange(selected.has(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  if (topics.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyHint}</p>
  }

  // Arama yapılırken "Diğer kapsamlar" kendiliğinden açılır; yalnız
  // diğerlerinde eşleşme varsa da öyle.
  const otherOpen = showOther || query.trim() !== '' || main.length === 0
  const otherCount = other.reduce((n, [, g]) => n + g.list.length, 0)

  return (
    <div className="space-y-2">
      {(selectedTopics.length > 0 || suggestions.length > 0 || !open) && (
        <div className="flex flex-wrap items-center gap-1">
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
          {suggestions.map(topic => (
            <button
              key={topic.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(topic.id)}
              title={`Öneri: ${topic.scopeName}`}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-primary/50 px-2 text-xs text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <Sparkles className="size-3" />
              <span className="max-w-64 truncate">{topic.name}</span>
            </button>
          ))}
          {!open && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOpen(true)}
              className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3" />
              Konu ekle
            </button>
          )}
        </div>
      )}

      {open && (
        <>
          {!filtered && (
            <p className="text-xs text-muted-foreground">
              Bu kitabın ders/seviye bilgisine uyan kapsam bulunamadı; tüm konular
              listeleniyor.
            </p>
          )}

          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                disabled={disabled}
                placeholder="Konu ara"
                className="h-8 pl-8 text-xs"
                aria-label="Müfredat konusu ara"
                autoFocus={!defaultOpen}
              />
            </div>
            {!defaultOpen && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setQuery('')
                }}
                className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Kapat
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border">
            {main.length === 0 && other.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Eşleşen konu yok.</p>
            ) : (
              <>
                {main.map(([scopeName, g]) => (
                  <TopicGroup key={scopeName} scopeName={scopeName} list={g.list} selected={selected} disabled={disabled} onToggle={toggle} />
                ))}
                {other.length > 0 &&
                  (otherOpen ? (
                    other.map(([scopeName, g]) => (
                      <TopicGroup key={scopeName} scopeName={scopeName} list={g.list} selected={selected} disabled={disabled} onToggle={toggle} />
                    ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowOther(true)}
                      className="flex w-full items-center gap-1 border-t px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      <ChevronRight className="size-3" />
                      Diğer kapsamlar ({otherCount} konu)
                    </button>
                  ))}
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Eşleme zorunlu değildir ve bölümün tamamlanması konuyu otomatik
            &quot;öğrenildi&quot; yapmaz.
          </p>
        </>
      )}
    </div>
  )
}

function TopicGroup({
  scopeName,
  list,
  selected,
  disabled,
  onToggle,
}: {
  scopeName: string
  list: TopicOption[]
  selected: Set<string>
  disabled?: boolean
  onToggle: (id: string) => void
}) {
  return (
    <div>
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
            onClick={() => onToggle(topic.id)}
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
  )
}
