'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronRight, Copy, FileText, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LedgerPayment } from '@/lib/finance-ledger'
import { formatIsoDayDate } from '@/lib/service-structure'
import {
  buildParentSummary,
  formatMoney,
  openLineAmount,
  openTotalLabel,
  parentSummaryText,
  type SummaryAccrual,
} from '@/lib/parent-account-summary'

// VELİ HESAP ÖZETİ — İz V2 R09.
//
// Finans ekranından açılır; paylaşım iki yolla: metni kopyala (WhatsApp)
// ya da yazdır/PDF. Herkese açık bağlantı YOK — veli verisi bir URL ile
// dolaşıma girmez (karar: kopyalanabilir metin + yazdırılabilir sayfa).

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!
  )
}

/** Yalnız özet metnini yazdırır — gizli iframe, uygulama ekranı basılmaz. */
function printText(title: string, text: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc || !frame.contentWindow) {
    frame.remove()
    return
  }
  doc.open()
  doc.write(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      '<style>body{font:14px/1.6 system-ui,sans-serif;margin:32px;color:#111}pre{white-space:pre-wrap;font:inherit}</style>' +
      `</head><body><pre>${escapeHtml(text)}</pre></body></html>`
  )
  doc.close()
  frame.contentWindow.focus()
  frame.contentWindow.print()
  setTimeout(() => frame.remove(), 1000)
}

export function ParentSummaryButton({
  studentName,
  today,
  accruals,
  payments,
}: {
  studentName: string
  today: string
  accruals: SummaryAccrual[]
  payments: LedgerPayment[]
}) {
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [copied, setCopied] = useState(false)
  const summary = useMemo(() => buildParentSummary(accruals, payments), [accruals, payments])
  const text = useMemo(() => parentSummaryText(studentName, summary, today), [studentName, summary, today])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Metin kopyalanamadı.')
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileText className="size-4" />
        Veli hesap özeti
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Veli hesap özeti · {studentName}</DialogTitle>
            <DialogDescription>
              Tüm aylardan açık dersler ve son tahsilatlar. İç giderler, kesintiler ve notlar
              özette yer almaz.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto text-sm">
            <section>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Açık tutar</h3>
              {summary.openLines.length === 0 ? (
                <p className="text-muted-foreground">Açık tutar yok.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {summary.openLines.map(l => (
                    <li key={l.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <span>
                        {l.no && <span className="tabular-nums text-muted-foreground">{l.no}) </span>}
                        {l.label}
                      </span>
                      <span className="shrink-0 tabular-nums">{openLineAmount(l)}</span>
                    </li>
                  ))}
                  <li className="flex items-baseline justify-between gap-3 bg-muted/40 px-3 py-2 font-medium">
                    <span>{openTotalLabel(summary)}</span>
                    <span className="tabular-nums">{formatMoney(summary.totalOpenKurus)}</span>
                  </li>
                </ul>
              )}
              {summary.creditKurus > 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Fazla ödeme (alacak): {formatMoney(summary.creditKurus)}
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Son tahsilatlar</h3>
              {summary.recentPayments.length === 0 ? (
                <p className="text-muted-foreground">Tahsilat kaydı yok.</p>
              ) : (
                <ul className="space-y-1">
                  {summary.recentPayments.map(p => (
                    <li key={p.id} className="flex justify-between gap-3">
                      <span>{formatIsoDayDate(p.date, true)}</span>
                      <span className="tabular-nums">{formatMoney(p.amountKurus)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {summary.history.length > 0 && (
              <section>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
                  aria-expanded={showHistory}
                  onClick={() => setShowHistory(v => !v)}
                >
                  {showHistory ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  Tüm geçmiş ({summary.history.length} kayıt)
                </button>
                {showHistory && (
                  <ul className="mt-1.5 space-y-1 text-xs">
                    {summary.history.map(h => (
                      <li key={`${h.payment ? 'p' : 'a'}-${h.id}`} className="flex justify-between gap-3">
                        <span>{h.label}</span>
                        <span className={`tabular-nums ${h.payment ? 'text-success-foreground' : ''}`}>
                          {h.payment ? '+' : ''}
                          {formatMoney(h.amountKurus)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" onClick={() => printText(`${studentName} · Hesap özeti`, text)}>
              <Printer className="size-4" />
              Yazdır / PDF
            </Button>
            <Button size="sm" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Kopyalandı!' : 'Metni kopyala'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
