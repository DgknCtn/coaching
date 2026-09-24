'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { HaftamPersonalItem } from '@/lib/haftam'
import {
  addPersonalItemAction,
  deletePersonalItemAction,
  togglePersonalItemAction,
} from './actions'

// KİŞİSEL ALAN (§14).
//
// ============================================================
// BU ALAN ÖĞRENCİNİN KENDİSİNE AİTTİR
//
// Öğretmene görünmez, veliye görünmez, resmi akademik istatistiklere
// girmez, performans puanına dönüşmez (§14, §21). Koruma burada değil
// ŞEMADA: 101'de bu tablo için öğretmen ve veli politikası yazılmadı.
// Arayüzdeki gizlilik, o kararın görünür yüzü.
//
// "Pilates", "10 sayfa kitap oku", "akşam ders tekrar" — bunlar
// öğrencinin hayatı. Akademik yükün yanında sayılsaydı öğrenci kendi
// ajandasını yazmaktan kaçınırdı ve alan boş kalırdı.
//
// ============================================================
// BOŞKEN YER KAPLAMAZ
//
// Belge: *"Kişisel alan boşsa geniş kart yer kaplamaz. Yalnızca
// '+ Kişisel madde' satırı görünür."* Öğrenci madde ekledikçe alan
// doğal şekilde büyür.

export function PersonalItems({
  date,
  items,
}: {
  date: string
  items: HaftamPersonalItem[]
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [isPending, startTransition] = useTransition()

  function add() {
    const text = title.trim()
    if (text === '') {
      setAdding(false)
      return
    }
    startTransition(async () => {
      const res = await addPersonalItemAction(date, text)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      setTitle('')
      // Alan AÇIK KALIR: öğrenci genelde tek madde değil birkaç madde
      // birden yazar; her seferinde düğmeye basmak gereksiz sürtünme.
    })
  }

  return (
    <div className="space-y-1">
      {items.map(item => (
        <div key={item.id} className="group flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={item.done}
            disabled={isPending}
            onChange={e => {
              const next = e.target.checked
              startTransition(async () => {
                const res = await togglePersonalItemAction(item.id, next)
                if (res?.error) toast.error(res.error)
              })
            }}
            aria-label={item.title}
            className="size-3.5 shrink-0 accent-primary"
          />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[11px]',
              item.done && 'text-muted-foreground line-through'
            )}
          >
            {item.title}
          </span>
          <button
            type="button"
            aria-label={`${item.title} maddesini sil`}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
            onClick={() =>
              startTransition(async () => {
                const res = await deletePersonalItemAction(item.id)
                if (res?.error) toast.error(res.error)
              })
            }
          >
            <X className="size-3" />
          </button>
        </div>
      ))}

      {adding ? (
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
            if (e.key === 'Escape') {
              setTitle('')
              setAdding(false)
            }
          }}
          onBlur={add}
          autoFocus
          placeholder="Ajanda ekle…"
          className="h-6 text-[11px]"
          aria-label="Kişisel madde"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          + Kişisel madde
        </button>
      )}
    </div>
  )
}
