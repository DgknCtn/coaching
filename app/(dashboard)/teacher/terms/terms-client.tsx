'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, CheckCircle, Archive, Loader2 } from 'lucide-react'
import { createTermAction, setTermActiveAction, archiveTermAction } from './actions'
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
