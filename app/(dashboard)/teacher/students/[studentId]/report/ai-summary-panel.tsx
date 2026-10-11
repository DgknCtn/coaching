'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { generateStudentSummaryAction } from './ai-actions'
import type { SummaryKind } from '@/lib/ai/student-week'

// AI HAFTALIK ÖZET PANELİ (Faz 6). Yalnız AI_SUMMARIES_ENABLED açıkken
// sayfa bu paneli çizer. Hiçbir şey kaydedilmez ya da otomatik
// gönderilmez; koç metni düzenler ve kendisi iletir.

const LABEL: Record<SummaryKind, string> = {
  coach: 'Koç için haftalık özet',
  parent: 'Veli mesajı taslağı',
}

export function AiSummaryPanel({ studentId }: { studentId: string }) {
  const [kind, setKind] = useState<SummaryKind | null>(null)
  const [text, setText] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function generate(k: SummaryKind) {
    setKind(k)
    startTransition(async () => {
      const res = await generateStudentSummaryAction(studentId, k)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setText(res.text)
      setRemaining(res.remaining)
    })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Metin kopyalandı.')
    } catch {
      toast.error('Kopyalanamadı; metni elle seçin.')
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 print:hidden">
      <p className="text-sm text-muted-foreground">
        Son haftanın ödev, teslim, onay, durum bildirimi ve kitap ilerlemesi sayılarından taslak
        üretir. Yapay zekâ sağlayıcısına öğrencinin adı, mesajları ve notlarınız{' '}
        <span className="font-medium text-foreground">gönderilmez</span>; yalnız sayılar ve kitap
        adları gider. Taslağı kontrol edip düzenledikten sonra kullanın.
      </p>

      <div className="flex flex-wrap gap-2">
        {(['coach', 'parent'] as const).map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={k === 'coach' ? 'default' : 'outline'}
            disabled={pending}
            onClick={() => generate(k)}
          >
            {pending && kind === k ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {LABEL[k]}
          </Button>
        ))}
      </div>

      {text && kind && (
        <div className="space-y-2">
          <Label htmlFor="ai-summary-text">{LABEL[kind]} (düzenleyebilirsiniz)</Label>
          <Textarea
            id="ai-summary-text"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              <Copy className="size-3.5" /> Kopyala
            </Button>
            {kind === 'parent' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                render={
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                WhatsApp ile gönder
              </Button>
            )}
            {remaining !== null && (
              <span className="text-xs text-muted-foreground">Bu ay kalan hak: {remaining}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
