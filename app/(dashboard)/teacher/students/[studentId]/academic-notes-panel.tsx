'use client'

import { useState, useTransition } from 'react'
import { Loader2, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/shared/empty-state'
import { StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  addAcademicNoteAction,
  deleteAcademicNoteAction,
  setAcademicNotePinnedAction,
} from './note-actions'

// Akademik Not / Öğrenci Hafızası (R6-07).
//
// Amaç: eğitmen öğrenciye döndüğünde birkaç saniyede "geçen hafta ne oldu,
// nerede kaldık, neye dikkat edeceğim?" bilgisini hatırlasın.
//
// Not ZORUNLU DEĞİLDİR. Hiç not yazılmadığında sistem görev veya uyarı
// üretmez (kabul #49) — bu ekran boş kalabilir ve bu normaldir.
//
// Sistem ödevi ve tamamlanmayı zaten biliyor; o veriler buraya elle
// yazdırılmaz. Buranın işi yalnız otomatikleştirilemeyen insan bağlamı.

export interface AcademicNote {
  id: string
  note_text: string
  pinned: boolean
  created_at: string
  author_name: string | null
}

export function AcademicNotesPanel({
  studentId,
  notes,
}: {
  studentId: string
  notes: AcademicNote[]
}) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [pinned, setPinned] = useState(false)
  const [isPending, startTransition] = useTransition()

  function add() {
    const value = text.trim()
    if (!value) return
    startTransition(async () => {
      const result = await addAcademicNoteAction(studentId, value, pinned)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setText('')
      setPinned(false)
      toast.success('Not eklendi.')
      router.refresh()
    })
  }

  function togglePin(note: AcademicNote) {
    startTransition(async () => {
      const result = await setAcademicNotePinnedAction(studentId, note.id, !note.pinned)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  function remove(note: AcademicNote) {
    if (!window.confirm('Bu not silinecek. Devam edilsin mi?')) return
    startTransition(async () => {
      const result = await deleteAcademicNoteAction(studentId, note.id)
      if (result.error) toast.error(result.error)
      else {
        toast.success('Not silindi.')
        router.refresh()
      }
    })
  }

  // Önemli/Sabit notlar üstte; gerisi tarih sırasında (yeniden eskiye).
  const ordered = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <Textarea
          rows={3}
          maxLength={2000}
          placeholder="Örn: Parçalı fonksiyonda zorlanıyor, gelecek hafta tekrar edeceğiz. Salı akşamları çalışamıyor."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4"
              checked={pinned}
              onChange={e => setPinned(e.target.checked)}
            />
            Önemli / Sabit olarak işaretle
          </label>
          <Button size="sm" onClick={add} disabled={isPending || !text.trim()}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Not ekle
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Bu notlar yalnız eğitmenlere görünür; öğrenci ve veli panelinde yer almaz.
        </p>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={StickyNote}
            title="Henüz akademik not yok"
            description="Derse başlarken hatırlamak istediğiniz her şeyi buraya yazabilirsiniz. Not tutmak zorunlu değildir."
          />
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {ordered.map(note => (
            <li key={note.id} className={cn('p-4', note.pinned && 'bg-warning-subtle/40')}>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 whitespace-pre-wrap text-sm">{note.note_text}</p>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => togglePin(note)}
                    disabled={isPending}
                    title={note.pinned ? 'Sabitlemeyi kaldır' : 'Önemli / Sabit yap'}
                  >
                    {note.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => remove(note)}
                    disabled={isPending}
                    title="Notu sil"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {new Date(note.created_at).toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {note.author_name && ` · ${note.author_name}`}
                {note.pinned && ' · Önemli'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
