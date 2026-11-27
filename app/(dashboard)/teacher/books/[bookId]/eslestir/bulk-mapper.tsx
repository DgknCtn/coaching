'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TopicMultiSelect, type TopicOption } from '@/components/shared/topic-multi-select'
import type { BulkRow } from '@/lib/topic-relevance'
import { cn } from '@/lib/utils'
import { setManySectionTopicsAction } from '../actions'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))

export function BulkMapper({
  bookId,
  rows,
  topics,
  filtered,
}: {
  bookId: string
  rows: BulkRow<TopicOption>[]
  topics: TopicOption[]
  filtered: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selection, setSelection] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(rows.map(r => [r.id, r.preselect ? [r.preselect] : r.topicIds]))
  )
  const [editing, setEditing] = useState<string | null>(null)
  const topicById = useMemo(() => new Map(topics.map(t => [t.id, t])), [topics])

  const changed = rows.filter(r => !sameSet(selection[r.id] ?? [], r.topicIds))
  const mapped = rows.filter(r => r.topicIds.length > 0).length
  const ready = rows.filter(r => r.preselect).length
  const noSuggestion = rows.filter(r => r.topicIds.length === 0 && r.suggestions.length === 0).length

  function toggle(rowId: string, topicId: string) {
    setSelection(prev => {
      const cur = prev[rowId] ?? []
      return { ...prev, [rowId]: cur.includes(topicId) ? cur.filter(x => x !== topicId) : [...cur, topicId] }
    })
  }

  function save() {
    startTransition(async () => {
      const r = await setManySectionTopicsAction(
        bookId,
        changed.map(row => ({ sectionId: row.id, topicIds: selection[row.id] ?? [] }))
      )
      if (r.error) {
        toast.error(r.error)
        return
      }
      if (r.failed) toast.warning(`${r.saved} bölüm kaydedildi, ${r.failed} bölüm kaydedilemedi.`)
      else toast.success(`${r.saved} bölümün eşlemesi kaydedildi.`)
      setEditing(null)
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Bu kitapta henüz bölüm yok.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
        <p className="tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">{rows.length} bölüm</span> · {mapped} eşli · {ready} öneri hazır
          {noSuggestion > 0 ? ` · ${noSuggestion} öneri yok` : ''}
        </p>
        <Button size="sm" disabled={isPending || changed.length === 0} onClick={save}>
          {isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {changed.length > 0 ? `${changed.length} bölümü kaydet` : 'Değişiklik yok'}
        </Button>
      </div>
      {!filtered && (
        <p className="text-xs text-muted-foreground">
          Bu kitabın ders/seviye bilgisine uyan kapsam bulunamadı; öneriler tüm kapsamlardan yapılıyor.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Öneriler bölüm adından çıkarılır ve yalnız eşlenmemiş bölümlerde ön işaretlidir. Kaydetmeden önce kontrol edin;
        işaretini kaldırdığınız öneri kaydedilmez.
      </p>

      <ul className="divide-y rounded-lg border bg-card">
        {rows.map(row => {
          const sel = selection[row.id] ?? []
          const dirty = !sameSet(sel, row.topicIds)
          const shown = [...new Set([...sel, ...row.suggestions.map(s => s.id)])]
          return (
            <li key={row.id} className={cn('grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]', dirty && 'bg-primary/5')}>
              <div className="min-w-0">
                {row.parentTitle && <p className="truncate text-[11px] text-muted-foreground">{row.parentTitle}</p>}
                <p className="text-sm font-medium">{row.title}</p>
                {row.topicIds.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Kayıtlı: {row.topicIds.map(id => topicById.get(id)?.name ?? 'Konu').join(', ')}
                  </p>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                {editing === row.id ? (
                  <TopicMultiSelect
                    topics={topics}
                    selectedIds={sel}
                    onChange={ids => setSelection(prev => ({ ...prev, [row.id]: ids }))}
                    filtered={filtered}
                    suggestFor={row.title}
                    defaultOpen
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {shown.length === 0 && <span className="text-xs text-muted-foreground">Öneri yok</span>}
                    {shown.map(id => {
                      const t = topicById.get(id)
                      const on = sel.includes(id)
                      return (
                        <button
                          key={id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggle(row.id, id)}
                          title={t?.scopeName}
                          className={cn(
                            'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs',
                            on ? 'border-primary bg-primary/10 text-primary' : 'border-dashed text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {on && <Check className="size-3 shrink-0" />}
                          <span className="truncate">{t?.name ?? 'Konu'}</span>
                        </button>
                      )
                    })}
                    <Button size="xs" variant="ghost" onClick={() => setEditing(row.id)}>
                      <Pencil /> Değiştir
                    </Button>
                  </div>
                )}
                {editing === row.id && (
                  <Button size="xs" variant="outline" onClick={() => setEditing(null)}>
                    Tamam
                  </Button>
                )}
                {dirty && <Badge variant="info" className="text-[10px]">Kaydedilecek</Badge>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
