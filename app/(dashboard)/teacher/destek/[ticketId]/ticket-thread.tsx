'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { replyTicketAction, closeTicketAction } from '../actions'

interface Message {
  id: string
  authorName: string | null
  body: string
  isStaff: boolean
  createdAt: string
}

// YAZIŞMA.
//
// Destek mesajları görsel olarak AYRIŞIYOR: kullanıcı kendi mesajıyla
// gelen yanıtı ayırt edebilmeli. Aynı hizada aynı renkte iki balon,
// uzun bir yazışmada kimin ne dediğini okunmaz hâle getirir.

export function TicketThread({
  ticketId,
  closed,
  messages,
}: {
  ticketId: string
  closed: boolean
  messages: Message[]
}) {
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()

  function reply() {
    startTransition(async () => {
      const res = await replyTicketAction(ticketId, body)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setBody('')
      toast.success('Mesajınız gönderildi.')
    })
  }

  function close() {
    startTransition(async () => {
      const res = await closeTicketAction(ticketId)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Talep kapatıldı.')
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'rounded-lg border p-4',
              m.isStaff
                ? 'border-primary/30 bg-primary/5'
                : 'bg-card'
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                {m.authorName ?? 'Bilinmiyor'}
                {m.isStaff && (
                  <span className="ml-2 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    Destek
                  </span>
                )}
              </p>
              <time className="text-xs text-muted-foreground tabular-nums">
                {new Date(m.createdAt).toLocaleString('tr-TR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
            {/* whitespace-pre-wrap: kullanıcının satır sonları korunmalı.
                Tek satıra düşen bir hata açıklaması okunmaz olur. */}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {m.body}
            </p>
          </div>
        ))}
      </div>

      {closed ? (
        <p className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Bu talep kapatıldı. Yeni bir sorunuz varsa yeni bir talep açabilirsiniz.
        </p>
      ) : (
        <div className="space-y-3">
          <Textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            placeholder="Yanıtınızı yazın…"
            aria-label="Yanıtınız"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={reply} disabled={pending || body.trim() === ''}>
              {pending ? 'Gönderiliyor…' : 'Gönder'}
            </Button>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Talebi kapat
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
