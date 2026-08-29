'use client'

// Sayfa takipli kitapların Kitap Haritası (R4 §4).
//
// Neden ayrı bir görünüm: sayfa modelinde birim tek bir fiziksel sayfadır
// (022), yani 400 sayfalık bir kitap 400 hücre demek olurdu. R4 §4 bunun
// yerine bölüm bazlı bir tablo istiyor — bölüm satırı gerektiğinde açılıp
// aralık verilir:
//
//   Bölüm    | Kapsam   | Tamamlanan   | Ödevde/Onay | Kalan          | %
//   Üçgenler | sf. 1-56 | 1-36, 42-48  | –           | 37-41, 49-56   | %77
//
// Durum türetmesi ve yüzde hesabı burada YAPILMAZ: lib/homework-status.ts
// ve lib/plan-scope.ts'ten gelir. Bu dosya yalnız sunum katmanıdır.

import { useMemo, useState } from 'react'
import { ChevronDown, Lightbulb, Plus, Video } from 'lucide-react'
import type { BookMapBook, BookMapSection } from '@/lib/book-map'
import { isSelectableState, type BookMapMode } from '@/lib/book-map'
import { SECTION_SELECT_OPTIONS, selectByState } from '@/lib/bulk-actions'
import { sectionPageProgress, sectionScopeLabel } from '@/lib/plan-scope'
import { formatRanges, parseRanges, pagesFromRanges } from '@/lib/page-ranges'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProgressBar } from '@/components/shared/progress-bar'
import { cn } from '@/lib/utils'

interface Props {
  book: BookMapBook
  selectedTestIds?: Set<string>
  /** Aralıktan gelen birimleri toplu ekler/çıkarır (BookMapGrid ile aynı imza). */
  onToggleSection?: (bookId: string, testIds: string[]) => void
  readOnly?: boolean
  /** plan (varsayılan) | manage — R6-03 yönetim modu. */
  mode?: BookMapMode
}

const EMPTY_SELECTION: Set<string> = new Set()

export function BookPageMap({
  book,
  selectedTestIds = EMPTY_SELECTION,
  onToggleSection,
  readOnly = false,
  mode = 'plan',
}: Props) {
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Kitap Haritası</h2>
        <p className="text-xs text-muted-foreground">
          Yüzde yalnız onaylanmış benzersiz sayfalar üzerinden hesaplanır.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="border-b px-4 py-2.5 text-left font-medium">Bölüm</th>
              <th scope="col" className="border-b px-3 py-2.5 text-left font-medium">Kapsam</th>
              <th scope="col" className="border-b px-3 py-2.5 text-left font-medium">Tamamlanan</th>
              <th scope="col" className="border-b px-3 py-2.5 text-left font-medium">Ödevde / Onay</th>
              <th scope="col" className="border-b px-3 py-2.5 text-left font-medium">Kalan</th>
              <th scope="col" className="border-b px-3 py-2.5 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {book.sections.map((section) => (
              <SectionRow
                key={section.id}
                book={book}
                section={section}
                open={openSectionId === section.id}
                onOpenChange={(open) => setOpenSectionId(open ? section.id : null)}
                selectedTestIds={selectedTestIds}
                onToggleSection={onToggleSection}
                readOnly={readOnly}
                mode={mode}
              />
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="flex items-start gap-2 border-t bg-muted/40 px-4 py-2.5">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            İpucu: Bir bölümü açıp <span className="font-medium">1-36, 42-48</span> gibi birden
            fazla aralık girebilirsiniz. Zaten tamamlanmış veya ödevde olan sayfalar plana
            eklenmez.
          </p>
        </div>
      )}
    </div>
  )
}

function SectionRow({
  book,
  section,
  open,
  onOpenChange,
  selectedTestIds,
  onToggleSection,
  readOnly,
  mode,
}: {
  book: BookMapBook
  section: BookMapSection
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTestIds: Set<string>
  onToggleSection?: (bookId: string, testIds: string[]) => void
  readOnly: boolean
  mode: BookMapMode
}) {
  const progress = useMemo(() => sectionPageProgress(section), [section])

  const selectedCount = section.tests.filter((t) => selectedTestIds.has(t.id)).length
  const scope = sectionScopeLabel(section)

  return (
    <>
      <tr className="align-top">
        <td className="border-b px-4 py-2.5">
          {readOnly ? (
            <span className="text-sm">{section.title}</span>
          ) : (
            <button
              type="button"
              onClick={() => onOpenChange(!open)}
              aria-expanded={open}
              className="flex items-center gap-1.5 text-left text-sm hover:underline"
            >
              <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
              {section.title}
            </button>
          )}
          {/* R6-17: fasikül/tema üst grup metadata'sıdır; varsa gösterilir,
              yoksa satır bugünkü gibi sade kalır. */}
          {(section.groupLabel || section.themeLabel) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {[section.groupLabel, section.themeLabel].filter(Boolean).join(' · ')}
            </p>
          )}
          {section.note && (
            <p className="mt-0.5 text-xs text-muted-foreground">{section.note}</p>
          )}
          {selectedCount > 0 && (
            <p className="mt-0.5 text-xs text-primary">
              {selectedCount} sayfa {mode === 'manage' ? 'seçili' : 'planda'}
            </p>
          )}
        </td>
        <td className="border-b px-3 py-2.5 text-muted-foreground tabular-nums">{scope || '–'}</td>
        <td className="border-b px-3 py-2.5 tabular-nums">
          {formatRanges(progress.completedRanges) || '–'}
        </td>
        <td className="border-b px-3 py-2.5 tabular-nums text-muted-foreground">
          {formatRanges(progress.inProgressRanges) || '–'}
        </td>
        <td className="border-b px-3 py-2.5 tabular-nums text-muted-foreground">
          {formatRanges(progress.remainingRanges) || '–'}
        </td>
        <td className="border-b px-3 py-2.5 text-right">
          <div className="flex flex-col items-end gap-1">
            <span className="text-sm font-medium tabular-nums">%{progress.percentage}</span>
            <ProgressBar
              value={progress.percentage}
              label={`${section.title} ilerlemesi`}
              className="w-20"
            />
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {progress.completedPages}/{progress.totalPages} sayfa
            </span>
          </div>
        </td>
      </tr>

      {section.videoUrl && (
        <tr>
          <td colSpan={6} className="border-b px-4 pb-2 pt-0">
            <a
              href={section.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:underline"
            >
              <Video className="size-3.5" />
              Bölüm videoları
            </a>
          </td>
        </tr>
      )}

      {open && !readOnly && (
        <tr>
          <td colSpan={6} className="border-b bg-muted/30 px-4 py-3">
            <div className="space-y-3">
              {mode === 'manage' && (
                <SectionStateSelect
                  book={book}
                  section={section}
                  onToggleSection={onToggleSection}
                />
              )}
              <RangePicker
                book={book}
                section={section}
                onToggleSection={onToggleSection}
                mode={mode}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Bölüm bazlı durum seçimi (R6-03 §7).
 *
 * KRİTİK: Seçim yalnız BU bölümün sayfalarına uygulanır. Kitap genelinde
 * bağlamsız bir "6-45" aralığı YOKTUR; farklı fasiküllerde aynı sayfa
 * numaraları tekrar edebilir ve bunlar ayrı fiziksel sayfalardır.
 */
function SectionStateSelect({
  book,
  section,
  onToggleSection,
}: {
  book: BookMapBook
  section: BookMapSection
  onToggleSection?: (bookId: string, testIds: string[]) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{section.title} içinden seç</p>
      <div className="flex flex-wrap gap-1.5">
        {SECTION_SELECT_OPTIONS.map((option) => {
          const ids = selectByState(option.kind, section.tests)
          return (
            <button
              key={option.kind}
              type="button"
              disabled={ids.length === 0}
              onClick={() => onToggleSection?.(book.bookId, ids)}
              className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-40"
            >
              {option.label}
              <span className="ml-1 tabular-nums">({ids.length})</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RangePicker({
  book,
  section,
  onToggleSection,
  mode,
}: {
  book: BookMapBook
  section: BookMapSection
  onToggleSection?: (bookId: string, testIds: string[]) => void
  mode: BookMapMode
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const { ranges, invalid } = parseRanges(value)
    if (invalid.length > 0) {
      setError(`Anlaşılamayan aralık: ${invalid.join(', ')}`)
      return
    }
    if (ranges.length === 0) {
      setError('Örnek: 1-36, 42-48')
      return
    }

    const wanted = new Set(pagesFromRanges(ranges))
    // Yalnız henüz verilmemiş sayfalar plana eklenir; tamamlanmış veya
    // hâlihazırda ödevde olan sayfayı create_homework_batch zaten reddeder.
    const ids = section.tests
      .filter(
        (t) => t.pageStart != null && wanted.has(t.pageStart) && isSelectableState(t.state, mode)
      )
      .map((t) => t.id)

    if (ids.length === 0) {
      setError(
        mode === 'manage'
          ? 'Bu aralıkta seçilebilecek sayfa yok.'
          : 'Bu aralıkta planlanabilecek sayfa yok.'
      )
      return
    }

    setError(null)
    setValue('')
    onToggleSection?.(book.bookId, ids)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`range-${section.id}`} className="text-xs text-muted-foreground">
          Plana eklenecek sayfalar
        </label>
        <Input
          id={`range-${section.id}`}
          className="h-8 w-56"
          placeholder="1-36, 42-48"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="size-3.5" />
          Plana ekle
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
