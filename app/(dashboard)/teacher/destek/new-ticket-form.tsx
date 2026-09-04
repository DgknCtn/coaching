'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { openTicketAction } from './actions'

// YENİ TALEP FORMU.
//
// Kapalı başlıyor: destek sayfasına gelenlerin çoğu ÖNCE eski talebine
// bakmaya geliyor. Açık bir form, listeyi aşağı iterek asıl aranan şeyi
// gizlerdi.

const CATEGORIES = [
  { value: 'genel', label: 'Genel' },
  { value: 'teknik', label: 'Teknik sorun' },
  { value: 'odeme', label: 'Ödeme ve lisans' },
  { value: 'oneri', label: 'Öneri' },
]

export function NewTicketForm() {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('genel')
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const res = await openTicketAction(subject, body, category)
      // Başarılıysa aksiyon yönlendirir ve buraya dönmez.
      if (res?.error) toast.error(res.error)
    })
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} className="gap-2">
        <Plus className="size-4" />
        Yeni destek talebi
      </Button>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Yeni destek talebi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-subject">Konu</Label>
            <Input
              id="ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Kısaca ne hakkında?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-category">Kategori</Label>
            <select
              id="ticket-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ticket-body">Mesajınız</Label>
          <Textarea
            id="ticket-body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            placeholder="Ne olduğunu ve ne beklediğinizi yazın. Ekran adı ve yaptığınız adımlar çok yardımcı olur."
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? 'Gönderiliyor…' : 'Gönder'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Vazgeç
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
