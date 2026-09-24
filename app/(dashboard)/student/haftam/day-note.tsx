'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { setDayNoteAction } from './actions'

// GÜNÜN AKADEMİK NOTU (§13).
//
// ============================================================
// NOT YOKSA İNCE TEK SATIR
//
// Belge açık: not yoksa yalnız ince bir satır görünür, not varsa açık
// şekilde görünür. Boş bir gün notu kartı yedi sütunda yedi kez yer
// kaplasaydı, ekranın asıl işi olan çalışmalar aşağı itilirdi.
//
// ============================================================
// KRİTİK İLKE: NOT YAZMAMAK BİR EKSİKLİK DEĞİLDİR
//
// *"Öğrenci not yazmadığı için hiçbir şekilde eksik veya başarısız
// sayılmaz. Not bağlam sağlar. Çalışmanın yerine geçmez."*
//
// Bu yüzden burada hiçbir zorlama işareti yok: kırmızı uyarı yok,
// "bugün not yazmadın" hatırlatması yok, sayaç yok. Alan davet eder,
// talep etmez.
//
// Notun öğretmene gitmesi için ayrı bir eylem de yok: yazıldığı anda
// öğretmenin Öğrenci Güncellemeleri akışına düşer.

export function DayNote({ date, note }: { date: string; note: string | null }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note ?? '')
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const res = await setDayNoteAction(date, text)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Bugün nasıl geçti?"
          className="text-[11px]"
          aria-label="Gün notu"
        />
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={isPending}
            onClick={save}
          >
            Kaydet
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              setText(note ?? '')
              setEditing(false)
            }}
          >
            Vazgeç
          </Button>
        </div>
      </div>
    )
  }

  if (!note) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full rounded-md border border-dashed px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground"
      >
        + Gün notu ekle…
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full rounded-md bg-muted px-2 py-1.5 text-left text-[11px] leading-snug"
    >
      {note}
    </button>
  )
}
