'use client'

// KÜTÜPHANE ÇOKLU SEÇİM LİSTESİ (069).
//
// Koçun kütüphaneye gelme sebebi tek bir kitap değil: yeni açtığı havuzu
// bir oturumda doldurmak. Bu yüzden ana etkileşim "kartı aç" değil "kutuyu
// işaretle" — kart tıklanınca seçilir, ayrıntı sayfasına GİTMEZ. Kaynağın
// bölüm/test ağacını merak eden için kartın kendi "Önizle" bağlantısı var.
//
// SEÇİM İSTEMCİDE, YAZMA SUNUCUDA: filtreleme ve sayfalama sunucuda
// yapıldığı için buraya yalnız eşleşen kitaplar iner; seçim de yalnız
// görünen bu kümenin üzerinde çalışır. "Tümünü seç" bu yüzden bilinçli
// olarak "filtredeki tümü"dür — görmediği bir kitabı koçun havuzuna
// yazmak sürpriz olurdu.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { BookOpen, Check, Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatUnitCount } from '@/lib/unit-labels'
import type { UnitMode } from '@/lib/unit-labels'
import { copyLibraryBooksAction } from '../actions'

export interface LibraryBook {
  id: string
  title: string
  subject: string
  publisher: string | null
  level_exam: string | null
  exam_type: string | null
  edition_year: number | null
  curriculum_program: string | null
  resource_type: string | null
  structure_kind: string | null
  tracking_mode: UnitMode | null
  sectionCount: number
  testCount: number
  /** Bu kütüphane kitabı koçun havuzunda zaten var mı? */
  alreadyOwned: boolean
}

/** RPC ile aynı üst sınır; kullanıcı sunucuya gidip hata almadan görsün. */
const MAX_SELECTION = 50

export function LibraryPicker({ books }: { books: LibraryBook[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const selectable = useMemo(() => books.filter((b) => !b.alreadyOwned), [books])
  const allSelected = selectable.length > 0 && selected.size === selectable.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size >= MAX_SELECTION) {
        toast.error(`Tek seferde en fazla ${MAX_SELECTION} kitap eklenebilir.`)
        return prev
      } else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) return setSelected(new Set())
    const next = selectable.slice(0, MAX_SELECTION).map((b) => b.id)
    if (selectable.length > MAX_SELECTION) {
      toast.warning(`İlk ${MAX_SELECTION} kitap seçildi; filtreyi daraltıp devam edin.`)
    }
    setSelected(new Set(next))
  }

  function submit() {
    const ids = [...selected]
    if (ids.length === 0) return

    startTransition(async () => {
      const result = await copyLibraryBooksAction(ids)

      if (result.error) {
        toast.error(result.error)
        return
      }

      // Atlanan kitap bir hata değil, bir SONUÇ: kullanıcı ne olduğunu
      // görmeden "eklendi" demek, havuzunda beklediğinden az kitap
      // bulmasına yol açardı.
      const copied = result.copied ?? 0
      const skipped = result.skipped ?? 0
      toast.success(
        skipped > 0
          ? `${copied} kitap havuzuna eklendi, ${skipped} kitap atlandı.`
          : `${copied} kitap havuzuna eklendi.`
      )

      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={toggleAll} disabled={selectable.length === 0}>
          {allSelected ? 'Seçimi kaldır' : 'Filtredeki tümünü seç'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => {
          const isSelected = selected.has(book.id)
          const disabled = book.alreadyOwned

          return (
            <div
              key={book.id}
              className={cn(
                'group relative flex h-full flex-col rounded-lg border bg-card p-4 text-left transition-colors',
                disabled && 'opacity-60',
                !disabled && 'cursor-pointer hover:border-foreground/20',
                isSelected && 'border-primary ring-1 ring-primary'
              )}
            >
              {/* Kartın TAMAMI seçim yüzeyidir; 12 kitap işaretleyecek
                  koçun küçük bir kutuyu nişan alması gerekmiyor. */}
              <button
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => toggle(book.id)}
                className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
              >
                <span className="sr-only">
                  {disabled ? `${book.title} havuzunuzda zaten var` : `${book.title} seç`}
                </span>
              </button>

              <div className="mb-3 flex min-w-0 items-start gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border',
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                  )}
                >
                  {isSelected ? <Check className="size-3" /> : null}
                </span>

                <div className="min-w-0">
                  <h3 className="text-sm font-medium leading-snug">{book.title}</h3>
                  {book.publisher && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{book.publisher}</p>
                  )}
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {[
                      book.subject,
                      book.level_exam || book.exam_type,
                      book.resource_type && book.resource_type !== 'Belirtilmedi'
                        ? book.resource_type
                        : null,
                      book.structure_kind === 'multi' ? 'Çok parçalı' : null,
                      book.curriculum_program && book.curriculum_program !== 'Belirtilmedi'
                        ? book.curriculum_program
                        : null,
                      book.edition_year != null ? String(book.edition_year) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-sm text-muted-foreground">
                <span className="truncate">
                  {[
                    `${book.sectionCount} bölüm`,
                    formatUnitCount(book.testCount, book.tracking_mode ?? undefined),
                  ].join(' · ')}
                </span>

                {disabled ? (
                  <Badge variant="neutral" className="relative z-10">
                    Havuzunuzda var
                  </Badge>
                ) : (
                  // Bağlantı seçim düğmesinin ÜSTÜNDE durur (z-10): kartı
                  // seçmek isteyen ile içeriğine bakmak isteyen çakışmasın.
                  <Link
                    href={`/teacher/books/library/${book.id}`}
                    className="relative z-10 shrink-0 text-xs underline underline-offset-4 hover:text-foreground"
                  >
                    Önizle
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
          <BookOpen className="size-4 text-muted-foreground" />
          <span className="text-sm tabular-nums">{selected.size} kitap seçildi</span>

          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
            Havuzuma ekle
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
            disabled={pending}
          >
            <X className="size-3.5" />
            <span className="sr-only">Seçimi temizle</span>
          </Button>
        </div>
      )}
    </>
  )
}
