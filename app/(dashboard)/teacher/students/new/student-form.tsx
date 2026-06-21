'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createStudentAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

const schema = z.object({
  fullName: z.string().min(2, 'Ad en az 2 karakter'),
  email: z.string().email('Geçerli e-posta').optional().or(z.literal('')),
  phone: z.string().optional(),
  gradeLevel: z.string().optional(),
  examType: z.string().optional(),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const EXAM_TYPES = ['TYT', 'AYT', 'LGS', 'KPSS', 'DGS', 'Other']
const GRADE_LEVELS = ['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf', 'Mezun', 'Diğer']

interface Props {
  defaultValues?: Partial<FormData>
  mode?: 'create' | 'edit'
  studentId?: string
}

export function StudentForm({ defaultValues, mode = 'create', studentId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await createStudentAction(
        data.fullName,
        data.email || undefined,
        data.phone || undefined,
        data.gradeLevel || undefined,
        data.examType || undefined,
        data.notes || undefined
      )
      if (result?.error) setServerError(result.error)
    })
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Ad Soyad *</Label>
            <Input id="fullName" placeholder="Ahmet Yılmaz" aria-invalid={!!errors.fullName} {...register('fullName')} />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="examType">Sınav Türü</Label>
              <select
                id="examType"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register('examType')}
              >
                <option value="">Seçin</option>
                {EXAM_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gradeLevel">Sınıf</Label>
              <select
                id="gradeLevel"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register('gradeLevel')}
              >
                <option value="">Seçin</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-posta</Label>
              <Input id="email" type="email" placeholder="ornek@mail.com" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefon</Label>
              <Input id="phone" type="tel" placeholder="05xx xxx xx xx" {...register('phone')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notlar</Label>
            <Textarea id="notes" rows={3} placeholder="Öğrenci hakkında notlar..." {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {mode === 'create' ? 'Öğrenci Oluştur' : 'Kaydet'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              İptal
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
