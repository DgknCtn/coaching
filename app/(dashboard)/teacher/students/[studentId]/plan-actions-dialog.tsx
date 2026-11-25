'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Copy, Loader2, Lock, MessageCircle } from 'lucide-react'
import { buildHomeworkCheckIn, whatsappShareUrl } from '@/lib/share-text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { localDateString } from '@/lib/homework-status'
import { localClock, dueAtFromLocal } from '@/lib/homework-load'
import { formatSessionLong } from '@/lib/service-structure'
import {
  planDisplayTitle,
  planPrefix,
  planResultLine,
  type HomeworkPlanRef,
  type PlanResult,
} from '@/lib/homework-plan'
import { closePlanAction, setPlanDueAction, setPlanTitleAction } from './homework-actions'

// ÖDEV PLANI İŞLEMLERİ — Revize Mini 05 + 06 (156).
//
// Dört işlem, hiçbiri kalem ya da tamamlama kaydını değiştirmez:
//   Son teslimi değiştir — ilk teslim saklanır; öğrenci görünümü ve
//     yeniden kopyalanan mesaj yeni teslimi kullanır. Numara artmaz.
//   Açıklamayı düzenle — numaralı ön ek sabit, açıklama öğretmenin.
//   Mesaj metnini kopyala — planın güncel mesajı.
//   Planı kapat — o anki sonuç saklanır; sonraki tamamlamalar onu
//     yükseltmez. Kapatmadan önce sonuç gösterilir (tarayıcı onayı yok).

export function PlanActionsDialog({
  studentId,
  plan,
  result,
  message,
  studentName,
  onClose,
}: {
  studentId: string
  /** Ödev yoklaması metni için (Calendar belgesi §4, WhatsApp ara çözümü). */
  studentName?: string
  plan: HomeworkPlanRef
  result: PlanResult | null
  message: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const due = plan.dueAt ? new Date(plan.dueAt) : null
  const [dueDay, setDueDay] = useState(due ? localDateString(due) : '')
  const [dueTime, setDueTime] = useState(due ? localClock(due) : '18:00')
  const [suffix, setSuffix] = useState(plan.titleSuffix ?? '')
  const [confirmClose, setConfirmClose] = useState(false)
  const [copied, setCopied] = useState(false)
  const closed = plan.status === 'closed'

  function run(fn: () => Promise<{ error?: string }>, ok: string, close = false) {
    startTransition(async () => {
      const r = await fn()
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(ok)
      router.refresh()
      if (close) onClose()
    })
  }

  function saveDue() {
    const at = dueAtFromLocal(dueDay, dueTime)
    if (!at) {
      toast.error('Tarih ve saati tam girin.')
      return
    }
    run(() => setPlanDueAction(studentId, plan.id, at.toISOString()), `Son teslim ${formatSessionLong(at.toISOString())} olarak güncellendi.`)
  }

  async function copy() {
    if (!message) return
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Metin kopyalanamadı.')
    }
  }

  return (
    <Dialog open onOpenChange={next => !next && !isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{planDisplayTitle(plan)}</DialogTitle>
          <DialogDescription>
            {closed
              ? `Kapandı${plan.closedAt ? ` · ${formatSessionLong(plan.closedAt)}` : ''}. Kapanış sonucu saklı; sonraki tamamlamalar değiştirmez.`
              : `Yayımlandı ${formatSessionLong(plan.publishedAt)}${
                  plan.initialDueAt && plan.dueAt && plan.initialDueAt !== plan.dueAt
                    ? ` · ilk teslim ${formatSessionLong(plan.initialDueAt)}`
                    : ''
                }`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {result && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 tabular-nums">
              {closed ? 'Kapanış sonucu: ' : 'Güncel sonuç: '}
              {planResultLine(result)}
            </p>
          )}

          {!closed && (
            <div className="space-y-1.5">
              <Label htmlFor="plan-due-day" className="text-xs">Son teslim</Label>
              <div className="flex gap-2">
                <Input id="plan-due-day" type="date" value={dueDay} onChange={e => setDueDay(e.target.value)} />
                <Input
                  type="time"
                  aria-label="Son teslim saati"
                  value={dueTime}
                  onChange={e => setDueTime(e.target.value)}
                  className="w-28"
                />
                <Button size="sm" variant="outline" disabled={isPending} onClick={saveDue}>
                  Kaydet
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Aynı plan devam eder: numara artmaz, kalemler ve tamamlamalar korunur.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="plan-suffix" className="text-xs">Açıklama</Label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-medium">{planPrefix(plan.planNo)} ·</span>
              <Input
                id="plan-suffix"
                maxLength={160}
                value={suffix}
                placeholder="örn: Yazılı Hazırlığı"
                onChange={e => setSuffix(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={isPending || suffix.trim() === (plan.titleSuffix ?? '')}
                onClick={() => run(() => setPlanTitleAction(studentId, plan.id, suffix), 'Açıklama güncellendi.')}
              >
                Kaydet
              </Button>
            </div>
            {plan.legacyTitle && (
              <p className="text-[11px] text-muted-foreground">
                Eski başlık: {plan.legacyTitle}. Açıklama kaydedilirse başlık yeni biçime geçer.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {/* Hafta içi ödev yoklaması: hazır metin; yanıt WhatsApp'ta kalır,
                otomatik gönderim yok. */}
            {!closed && studentName && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(buildHomeworkCheckIn(studentName))
                      .then(() => toast.success('Ödev yoklaması metni kopyalandı.'))
                      .catch(() => toast.error('Metin kopyalanamadı.'))
                  }
                >
                  <MessageCircle />
                  Ödev yoklaması
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open(whatsappShareUrl(buildHomeworkCheckIn(studentName)), '_blank', 'noopener')}
                >
                  WhatsApp&apos;ta aç
                </Button>
              </>
            )}
            {message && (
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Kopyalandı!' : 'Mesaj metnini kopyala'}
              </Button>
            )}
            {!closed &&
              (confirmClose ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  Bu sonuç saklanacak. Emin misiniz?
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(() => closePlanAction(studentId, plan.id), 'Plan kapatıldı; sonuç saklandı.', true)}
                  >
                    {isPending ? <Loader2 className="animate-spin" /> : <Lock />}
                    Planı kapat
                  </Button>
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setConfirmClose(false)}>
                    Vazgeç
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmClose(true)}>
                  <Lock />
                  Planı kapat
                </Button>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
