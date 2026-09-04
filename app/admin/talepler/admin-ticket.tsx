'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  adminReplyAction,
  adminCloseTicketAction,
  adminLoadMessagesAction,
  type AdminMessage,
} from './actions'

// TEK TALEP — açılır satır.
//
// Yazışma AÇILDIĞINDA yükleniyor, listeyle birlikte değil: 200 talebin
// hepsinin mesajlarını önden çekmek, ekranın açılmasını yavaşlatır ve
// çoğu hiç okunmaz.

interface AdminTicketProps {
  ticketId: string
  subject: string
  workspaceName: string
  openedBy: string | null
  category: string
  statusLabel: string
  statusVariant: 'info' | 'success' | 'neutral'
  messageCount: number
  lastMessageAt: string
}

export function AdminTicket(props: AdminTicketProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AdminMessage[] | null>(null)
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && messages === null) {
      startTransition(async () => {
        const res = await adminLoadMessagesAction(props.ticketId)
        if (res.error) {
          toast.error(res.error)
          return
        }
        setMessages(res.messages ?? [])
      })
    }
  }

  function reply() {
    startTransition(async () => {
      const res = await adminReplyAction(props.ticketId, body)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setBody('')
      // Yeniden yükle: gönderilen mesaj listede hemen görünmeli.
      const fresh = await adminLoadMessagesAction(props.ticketId)
      setMessages(fresh.messages ?? [])
      toast.success('Yanıt gönderildi.')
    })
  }

  function close() {
    startTransition(async () => {
      const res = await adminCloseTicketAction(props.ticketId)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Talep kapatıldı.')
    })
  }

  return (
    <div className="py-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{props.subject}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {props.workspaceName}
            {props.openedBy && ` · ${props.openedBy}`} · {props.category} ·{' '}
            {props.messageCount} mesaj ·{' '}
            {new Date(props.lastMessageAt).toLocaleDateString('tr-TR')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={props.statusVariant}>{props.statusLabel}</Badge>
          <ChevronDown
            aria-hidden
            className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-l-2 border-muted pl-4">
          {messages === null ? (
            <p className="text-sm text-muted-foreground">Yükleniyor…</p>
          ) : (
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-md border p-3',
                    m.is_staff ? 'border-primary/30 bg-primary/5' : 'bg-card'
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-medium">{m.author_name ?? 'Bilinmiyor'}</p>
                    <time className="text-xs text-muted-foreground tabular-nums">
                      {new Date(m.created_at).toLocaleString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {m.body}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              placeholder="Yanıtınızı yazın…"
              aria-label={`${props.subject} yanıtı`}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={reply}
                disabled={pending || body.trim() === ''}
              >
                {pending ? 'Gönderiliyor…' : 'Yanıtla'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={close}
                disabled={pending}
              >
                Kapat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
