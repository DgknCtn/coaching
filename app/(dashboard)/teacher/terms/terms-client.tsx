'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, CheckCircle, Archive, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { createTermAction, updateTermAction, setTermActiveAction, archiveTermAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const schema = z.object({
  name: z.string().min(2, 'En az 2 karakter'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const statusLabel: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  completed: 'Tamamlandı',
  archived: 'Arşiv',
}
const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  active: 'default',
  completed: 'outline',
  archived: 'outline',
}

interface Term {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  status: string
  created_at: string
}

export function TermsClient({ terms }: { terms: Term[] }) {
  const [showForm, setShowForm] = useState(terms.length === 0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      await createTermAction(data.name, data.startDate, data.endDate)
      reset()
      setShowForm(false)
    })
  }

  const handleActivate = (id: string) => {
    setActionId(id)
    startTransition(async () => {
      await setTermActiveAction(id)
      setActionId(null)
    })
  }

  const handleArchive = (id: string) => {
    setActionId(id)
    startTransition(async () => {
      await archiveTermAction(id)
      setActionId(null)
    })
  }

  return (
    <div className="space-y-4">
      {terms.map(term => (
        <Card key={term.id}>
          {editingId === term.id ? (
            <CardContent className="py-4">
              <TermEditForm
                term={term}
                onDone={() => setEditingId(null)}
              />
            </CardContent>
          ) : (
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{term.name}</span>
                <Badge variant={statusVariant[term.status] ?? 'outline'}>
                  {statusLabel[term.status] ?? term.status}
                </Badge>
              </div>
              {(term.start_date || term.end_date) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {term.start_date ?? '?'} — {term.end_date ?? '?'}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingId(term.id)}
              >
                <Pencil className="size-3" />
                Düzenle
              </Button>
              {term.status !== 'active' && term.status !== 'archived' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending && actionId === term.id}
                  onClick={() => handleActivate(term.id)}
                >
                  {isPending && actionId === term.id ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3" />}
                  Aktif Yap
                </Button>
              )}
              {term.status === 'active' && (
                <Badge variant="default" className="text-xs">Aktif Dönem</Badge>
              )}
              {term.status !== 'archived' && term.status !== 'active' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending && actionId === term.id}
                  onClick={() => handleArchive(term.id)}
                >
                  <Archive className="size-3" />
                  Arşivle
                </Button>
              )}
            </div>
          </CardContent>
          )}
        </Card>
      ))}

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yeni Dönem</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Dönem Adı</Label>
                <Input id="name" placeholder="Örn: 2025–2026 Güz Dönemi" {...register('name')} aria-invalid={!!errors.name} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="startDate">Başlangıç</Label>
                  <Input id="startDate" type="date" {...register('startDate')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endDate">Bitiş</Label>
                  <Input id="endDate" type="date" {...register('endDate')} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="size-4 animate-spin" />}
                  Oluştur
                </Button>
                {terms.length > 0 && (
                  <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                    İptal
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setShowForm(true)}>
          <Plus className="size-4" /> Yeni Dönem Ekle
        </Button>
      )}
    </div>
  )
}

/**
 * Dönem düzenleme: kart, kendi RHF instance'ıyla yerinde forma dönüşür.
 * Durum (aktif/arşiv) burada değişmez — o iş kartın kendi butonlarında.
 */
function TermEditForm({ term, onDone }: { term: Term; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: term.name,
      startDate: term.start_date ?? '',
      endDate: term.end_date ?? '',
    },
  })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const result = await updateTermAction(term.id, data.name, data.startDate, data.endDate)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success('Dönem güncellendi.')
      onDone()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`name-${term.id}`}>Dönem Adı</Label>
        <Input id={`name-${term.id}`} {...register('name')} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`start-${term.id}`}>Başlangıç</Label>
          <Input id={`start-${term.id}`} type="date" {...register('startDate')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`end-${term.id}`}>Bitiş</Label>
          <Input id={`end-${term.id}`} type="date" {...register('endDate')} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          Kaydet
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          İptal
        </Button>
      </div>
    </form>
  )
}
