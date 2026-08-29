'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createStudentAction, updateStudentAction } from '../actions'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { EXAM_TYPE_OPTIONS, GRADE_LEVELS, LESSON_TYPE_OPTIONS } from '@/lib/validation'

const schema = z.object({
  fullName: z.string().min(2, 'Ad en az 2 karakter'),
  email: z.string().email('Geçerli e-posta').optional().or(z.literal('')),
  phone: z.string().optional(),
  gradeLevel: z.string().optional(),
  examType: z.string().optional(),
  lessonType: z.string().optional(),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>


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
      // R6-11: düzenleme modu artık gerçekten kaydediyor. Önceden
      // `mode`/`studentId` propları alınıyordu ama onSubmit her durumda
      // createStudentAction çağırıyordu — düzenleme yolu ölü koddu.
      if (mode === 'edit' && studentId) {
        const result = await updateStudentAction(
          studentId,
          data.fullName,
          data.email || undefined,
          data.phone || undefined,
          data.gradeLevel || undefined,
          data.examType || undefined,
          data.lessonType || undefined,
          data.notes || undefined
        )
        if (result?.error) {
          setServerError(result.error)
          return
        }
        toast.success('Öğrenci bilgileri güncellendi.')
        router.push(`/teacher/students/${studentId}`)
        router.refresh()
        return
      }

      const result = await createStudentAction(
        data.fullName,
        data.email || undefined,
        data.phone || undefined,
        data.gradeLevel || undefined,
        data.examType || undefined,
        data.lessonType || undefined,
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

          {/* R6-11: iki alan BAĞIMSIZDIR. "9. Sınıf + YKS" ya da
              "10. Sınıf + IB" geçerli kombinasyonlardır; form da backend de
              aralarında kısıtlama uygulamaz. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="examType">Hazırlık Programı</Label>
              <NativeSelect
                id="examType"
                {...register('examType')}
              >
                <option value="">Seçin</option>
                {EXAM_TYPE_OPTIONS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gradeLevel">Sınıf / Durum</Label>
              <NativeSelect
                id="gradeLevel"
                {...register('gradeLevel')}
              >
                <option value="">Seçin</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lessonType">Çalışma Modeli</Label>
            <NativeSelect
              id="lessonType"
              {...register('lessonType')}
            >
              <option value="">Seçin</option>
              {LESSON_TYPE_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </NativeSelect>
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

          {/* R6-07: notlar artık academic_notes tablosunda ve öğrenci
              detayındaki Akademik Not sekmesinden yönetiliyor. Burada yalnız
              OLUŞTURMA anında bir ilk not alınır (kaydedilirken akademik nota
              dönüşür). Düzenleme modunda alan gösterilmez — aksi halde ikinci
              bir yazma yolu oluşur ve hangisinin geçerli olduğu belirsizleşir. */}
          {mode === 'create' && (
            <div className="space-y-1.5">
              <Label htmlFor="notes">
                İlk akademik not <span className="text-muted-foreground">(isteğe bağlı)</span>
              </Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="Örn: Parçalı fonksiyonda zorlanıyor. Salı akşamları çalışamıyor."
                {...register('notes')}
              />
              <p className="text-[11px] text-muted-foreground">
                Yalnız eğitmenlere görünür. Sonraki notları öğrenci detayındaki
                Akademik Not sekmesinden ekleyebilirsiniz.
              </p>
            </div>
          )}

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
