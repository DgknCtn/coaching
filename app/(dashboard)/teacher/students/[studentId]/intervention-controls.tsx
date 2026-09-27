'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { OUTCOME_LABEL, type InterventionOutcome } from '@/lib/interventions'
import type { StudentStatus } from '@/lib/student-status'
import {
  closeInterventionAction,
  openInterventionAction,
  updateInterventionAction,
} from './intervention-actions'

export interface SessionChoice {
  id: string
  label: string
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function InterventionControls({
  studentId,
  open,
  currentStatus,
  sessions,
}: {
  studentId: string
  open: { id: string; note: string; sessionId: string | null } | null
  currentStatus: StudentStatus
  sessions: SessionChoice[]
}) {
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'open' | 'edit' | 'close'>('idle')
  const [note, setNote] = useState(open?.note ?? '')
  const [sessionId, setSessionId] = useState<string>(open?.sessionId ?? '')
  const [outcome, setOutcome] = useState<InterventionOutcome | ''>('')
  const [closeNote, setCloseNote] = useState('')

  function run(fn: () => Promise<{ error?: string; success?: boolean }>, ok: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.error) toast.error(res.error)
      else {
        toast.success(ok)
        setMode('idle')
      }
    })
  }

  const sessionPicker = (
    <div className="space-y-1">
      <Label htmlFor="iv-session" className="text-xs">
        Görüşme <span className="text-muted-foreground">(isteğe bağlı)</span>
      </Label>
      <select
        id="iv-session"
        className={SELECT_CLASS}
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
      >
        <option value="">Bağlı görüşme yok</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )

  const noteField = (
    <div className="space-y-1">
      <Label htmlFor="iv-note" className="text-xs">
        Ne yapılıyor?
      </Label>
      <Textarea
        id="iv-note"
        rows={3}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Örn: Veliyle görüşüldü, haftalık yük azaltıldı."
      />
    </div>
  )

  // AÇIK MÜDAHALE YOK
  if (!open) {
    if (mode !== 'open') {
      // Yolunda olan öğrenciye de açılabilir (öğretmen bir şey fark etmiş
      // olabilir) ama düğme öne çıkarılmaz.
      return (
        <Button
          type="button"
          size="sm"
          variant={currentStatus === 'yolunda' ? 'outline' : 'default'}
          onClick={() => setMode('open')}
        >
          Müdahale başlat
        </Button>
      )
    }
    return (
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-xs text-muted-foreground">
          Başlangıçtaki durum ve gerekçeler otomatik kaydedilir.
        </p>
        {noteField}
        {sessionPicker}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => openInterventionAction(studentId, note, sessionId || undefined),
                'Müdahale başlatıldı.'
              )
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Başlat
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode('idle')}>
            Vazgeç
          </Button>
        </div>
      </div>
    )
  }

  // AÇIK MÜDAHALE VAR
  return (
    <div className="space-y-3">
      {/* Durum Yolunda'ya döndüyse kapatma ÖNERİLİR; kendiliğinden
          kapanmaz — karar öğretmenin (118). */}
      {currentStatus === 'yolunda' && mode === 'idle' && (
        <p className="text-xs text-success-foreground">
          Öğrencinin durumu artık Yolunda. Müdahaleyi kapatabilirsin.
        </p>
      )}

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setMode('edit')}>
            Not / görüşme güncelle
          </Button>
          <Button type="button" size="sm" onClick={() => setMode('close')}>
            Müdahaleyi kapat
          </Button>
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-3 rounded-md border p-3">
          {noteField}
          {sessionPicker}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => updateInterventionAction(open.id, studentId, note, sessionId || null),
                  'Müdahale güncellendi.'
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Kaydet
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode('idle')}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}

      {mode === 'close' && (
        <div className="space-y-3 rounded-md border p-3">
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium">Sonuç</legend>
            {(Object.keys(OUTCOME_LABEL) as InterventionOutcome[]).map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="iv-outcome"
                  value={o}
                  checked={outcome === o}
                  onChange={() => setOutcome(o)}
                />
                {OUTCOME_LABEL[o]}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="iv-close-note" className="text-xs">
              Kapanış notu <span className="text-muted-foreground">(isteğe bağlı)</span>
            </Label>
            <Textarea
              id="iv-close-note"
              rows={2}
              maxLength={2000}
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || !outcome}
              onClick={() =>
                run(
                  () => closeInterventionAction(open.id, studentId, outcome, closeNote),
                  'Müdahale kapatıldı.'
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Kapat
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode('idle')}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
