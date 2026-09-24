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

// ============================================================
// ÖĞRENCİNİN KENDİ CÜMLELERİ DE HAFIZANIN PARÇASI (R8 §13)
//
// Haftam'da yazılan gün notları bu listeye KARIŞMADAN katılıyor:
// *"haftalık görüşmede otomatik görünür, Öğrenci Hafızası'na eklenir."*
// Öğretmenin görüşmeye başlarken sorduğu soru zaten "geçen hafta ne
// oldu" ve o haftanın en iyi anlatıcısı çoğu zaman öğrencinin kendi
// cümlesi ("Perşembe sınavım var, bugün ona hazırlanıyorum").
//
// İKİSİ AYNI KUTUYA KONMUYOR:
//   - Öğretmenin notu düzenlenebilir, sabitlenebilir, silinebilir.
//   - Öğrencinin notu SALT OKUNUR. Öğretmenin öğrenci ağzından yazılmış
//     bir cümleyi değiştirebilmesi, notun bağlam değerini yok ederdi;
//     silebilmesi de öğrencinin bıraktığı izi ortadan kaldırırdı.
//
// Ayrım görsel olarak da duruyor: öğretmen "bunu ben mi yazmıştım?"
// diye sormak zorunda kalmamalı.
// ============================================================

export interface AcademicNote {
  id: string
  note_text: string
  pinned: boolean
  created_at: string
  author_name: string | null
}

/** Öğrencinin Haftam'da yazdığı gün notu (101). */
export interface StudentDayNote {
  id: string
  note_date: string
  note_text: string
}

type PanelEntry =
  | { kind: 'teacher'; id: string; date: string; pinned: boolean; note: AcademicNote }
  | { kind: 'student'; id: string; date: string; pinned: false; note: StudentDayNote }

export function AcademicNotesPanel({
  studentId,
  notes,
  dayNotes = [],
  studentName,
}: {
  studentId: string
  notes: AcademicNote[]
  dayNotes?: StudentDayNote[]
  studentName?: string | null
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
  //
  // Gün notları da aynı çizgiye giriyor — hafıza kronolojik olmak
  // zorunda (031'in kuruluş gerekçesi). "Sabit" yalnız öğretmenin
  // notunda var; öğrencinin günlük cümlesi kalıcı bir uyarı değil.
  const ordered: PanelEntry[] = [
    ...notes.map(
      (note): PanelEntry => ({
        kind: 'teacher',
        id: note.id,
        date: note.created_at,
        pinned: note.pinned,
        note,
      })
    ),
    ...dayNotes.map(
      (note): PanelEntry => ({
        kind: 'student',
        id: note.id,
        date: note.note_date,
        pinned: false,
        note,
      })
    ),
  ].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return Date.parse(b.date) - Date.parse(a.date)
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
          Buraya yazdıklarınız yalnız eğitmenlere görünür; öğrenci ve veli panelinde
          yer almaz. Aşağıdaki listede öğrencinin kendi yazdığı gün notları da
          görünür — onlar öğrenciye açıktır, veliye değil.
        </p>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={StickyNote}
            title="Henüz akademik not yok"
            description="Derse başlarken hatırlamak istediğiniz her şeyi buraya yazabilirsiniz. Öğrencinin Haftam'da yazdığı gün notları da burada görünür. Not tutmak zorunlu değildir."
          />
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {ordered.map(entry =>
            entry.kind === 'student' ? (
              // ÖĞRENCİNİN CÜMLESİ — SALT OKUNUR.
              // Sabitleme ve silme düğmeleri bilerek YOK: bu metin
              // öğretmenin değil öğrencinin.
              <li key={`day-${entry.id}`} className="bg-info-subtle/30 p-4">
                <p className="min-w-0 whitespace-pre-wrap text-sm">{entry.note.note_text}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {new Date(entry.note.note_date).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  {' · '}
                  {studentName ? `${studentName} yazdı` : 'Öğrenci yazdı'}
                  {' · Gün notu'}
                </p>
              </li>
            ) : (
              <li
                key={entry.id}
                className={cn('p-4', entry.note.pinned && 'bg-warning-subtle/40')}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 whitespace-pre-wrap text-sm">{entry.note.note_text}</p>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => togglePin(entry.note)}
                      disabled={isPending}
                      title={entry.note.pinned ? 'Sabitlemeyi kaldır' : 'Önemli / Sabit yap'}
                    >
                      {entry.note.pinned ? (
                        <PinOff className="size-3.5" />
                      ) : (
                        <Pin className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => remove(entry.note)}
                      disabled={isPending}
                      title="Notu sil"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {new Date(entry.note.created_at).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  {entry.note.author_name && ` · ${entry.note.author_name}`}
                  {entry.note.pinned && ' · Önemli'}
                </p>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}
