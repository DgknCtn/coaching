'use client'

import { useMemo, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Loader2, Search } from 'lucide-react'
import { assignBookAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CURRICULUM_PROGRAM_OPTIONS } from '@/lib/book-taxonomy'

// Kitap Ata (R4 + R6-15).
//
// Tek dropdown 10-15 kitapta çalışıyordu; onlarca/yüzlerce kaynakta isimler
// karışıyor ve aynı adlı baskılar ayırt edilemiyordu. R6-15 arama + filtre
// ekliyor.
//
// KRİTİK KURAL: Filtre YALNIZ LİSTEYİ DARALTIR, atamayı kısıtlamaz.
// 10. sınıf öğrencisine 9. sınıf kaynağı atanabilmelidir (kabul #81) —
// eksik konuyu kapatmak gerçek ve sık bir senaryodur.

const schema = z.object({
  bookId: z.string().min(1, 'Kitap seçin'),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export interface AssignableBook {
  id: string
  title: string
  subject: string
  publisher?: string | null
  level_exam?: string | null
  edition_year?: number | null
  curriculum_program?: string | null
}

interface Props {
  studentId: string
  books: AssignableBook[]
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) =>
    a.localeCompare(b, 'tr')
  )
}

/** Aynı adlı farklı baskılar baskı yılıyla ayrışır (kabul #82). */
function bookOptionLabel(book: AssignableBook): string {
  const parts = [book.title]
  if (book.publisher) parts.push(book.publisher)
  if (book.level_exam) parts.push(book.level_exam)
  if (book.edition_year != null) parts.push(String(book.edition_year))
  return parts.join(' · ')
}

export function AssignBookDialog({ studentId, books }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [level, setLevel] = useState('')
  const [program, setProgram] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  // Seçenek listeleri gerçekten atanabilir kitaplardan türetilir; hiç
  // karşılığı olmayan bir filtre değeri gösterilmez.
  const subjects = useMemo(() => uniqueSorted(books.map(b => b.subject)), [books])
  const levels = useMemo(() => uniqueSorted(books.map(b => b.level_exam)), [books])

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr')
    return books.filter(b => {
      // Arama kitap adı VE yayın/marka üzerinde çalışır.
      if (term) {
        const haystack = `${b.title} ${b.publisher ?? ''}`.toLocaleLowerCase('tr')
        if (!haystack.includes(term)) return false
      }
      if (subject && b.subject !== subject) return false
      if (level && b.level_exam !== level) return false
      if (program && (b.curriculum_program ?? 'Belirtilmedi') !== program) return false
      return true
    })
  }, [books, search, subject, level, program])

  const hasActiveFilter = Boolean(search || subject || level || program)

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await assignBookAction(
        studentId,
        data.bookId,
        data.startDate,
        data.targetEndDate
      )
      if (result?.error) {
        setServerError(result.error)
      } else {
        reset()
        setSearch('')
        setSubject('')
        setLevel('')
        setProgram('')
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="xs" variant="outline">
            <Plus className="size-3" /> Kitap Ata
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kitap Ata</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-2 space-y-4">
          <div className="space-y-2 rounded-lg border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Kitap veya yayın adı ara"
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <NativeSelect
                aria-label="Ders"
                value={subject}
                onChange={e => setSubject(e.target.value)}
              >
                <option value="">Tüm dersler</option>
                {subjects.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>

              <NativeSelect
                aria-label="Seviye / Sınav"
                value={level}
                onChange={e => setLevel(e.target.value)}
              >
                <option value="">Tüm seviyeler</option>
                {levels.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </NativeSelect>

              <NativeSelect
                aria-label="Öğretim Programı"
                value={program}
                onChange={e => setProgram(e.target.value)}
              >
                <option value="">Tüm programlar</option>
                {CURRICULUM_PROGRAM_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Filtre yalnız listeyi daraltır; her kaynak atanabilir.
              </p>
              {hasActiveFilter && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setSearch('')
                    setSubject('')
                    setLevel('')
                    setProgram('')
                  }}
                >
                  Filtreleri temizle
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bookId">
              Kitap{' '}
              <span className="text-muted-foreground tabular-nums">
                ({filtered.length} kaynak)
              </span>
            </Label>
            <NativeSelect
              id="bookId"
              aria-invalid={!!errors.bookId}
              disabled={filtered.length === 0}
              {...register('bookId')}
            >
              {filtered.length === 0 ? (
                <option value="">Bu filtreyle eşleşen kaynak yok</option>
              ) : (
                <>
                  <option value="">Kitap seçin</option>
                  {filtered.map(b => (
                    <option key={b.id} value={b.id}>
                      {bookOptionLabel(b)}
                    </option>
                  ))}
                </>
              )}
            </NativeSelect>
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

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              İptal
            </Button>
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
