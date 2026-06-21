'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Loader2 } from 'lucide-react'
import { assignBookAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const schema = z.object({
  bookId: z.string().min(1, 'Kitap seçin'),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  studentId: string
  books: { id: string; title: string; subject: string }[]
}

export function AssignBookDialog({ studentId, books }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await assignBookAction(studentId, data.bookId, data.startDate, data.targetEndDate)
      if (result?.error) {
        setServerError(result.error)
      } else {
        reset()
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="outline"><Plus className="size-3" /> Kitap Ata</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kitap Ata</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="bookId">Kitap</Label>
            <select
              id="bookId"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-invalid={!!errors.bookId}
              {...register('bookId')}
            >
              <option value="">Kitap seçin</option>
              {books.map(b => (
                <option key={b.id} value={b.id}>{b.title} — {b.subject}</option>
              ))}
            </select>
            {errors.bookId && <p className="text-xs text-destructive">{errors.bookId.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Başlangıç</Label>
              <Input id="startDate" type="date" {...register('startDate')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetEndDate">Hedef Bitiş</Label>
              <Input id="targetEndDate" type="date" {...register('targetEndDate')} />
            </div>
          </div>
          {serverError && <p className="text-xs text-destructive">{serverError}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Ata
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
