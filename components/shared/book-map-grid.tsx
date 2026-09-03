'use client'

import { Fragment } from 'react'
import { Check, Circle, Clock3, AlertTriangle, Undo2, Hourglass, Lightbulb } from 'lucide-react'
import type { BookMapBook } from '@/lib/book-map'
import { isSelectableState, type BookMapMode } from '@/lib/book-map'
import { SECTION_SELECT_OPTIONS, selectByState } from '@/lib/bulk-actions'
import { SectionTitle } from '@/components/shared/section-title'
import { hasActiveSignal } from '@/lib/curriculum-signal'
import { isSectionInTarget } from '@/lib/plan-scope'
import {
  testStateLabel,
  type HomeworkTestState,
  type StatusAudience,
} from '@/lib/homework-status'
import { BookPageMap } from '@/components/shared/book-page-map'
import { SectionRowMenu } from '@/components/shared/section-row-menu'
import { cn } from '@/lib/utils'

// Masaüstü Kitap Haritası (R3 v2 §1). Bölüm satır, test sütun.
// Ağır grid kütüphanesi yok: normal table + sticky bölüm sütunu + yatay kaydırma.
// Hücreler pastel zemin + ikon taşır; yalnız renge güvenilmez.

const STATE_STYLE: Record<HomeworkTestState, string> = {
  completed: 'bg-success-subtle text-success-foreground border-success-border',
  pending_approval: 'bg-info-subtle text-info-foreground border-info-border',
  assigned: 'bg-warning-subtle text-warning-foreground border-warning-border',
  returned: 'bg-warning-subtle text-warning-foreground border-warning-border',
  overdue: 'bg-destructive-subtle text-destructive-foreground border-destructive-border',
  not_assigned: 'bg-card text-muted-foreground/60 border-border',
  no_test: 'bg-muted/50 text-muted-foreground/40 border-transparent',
}

const STATE_ICON: Record<HomeworkTestState, typeof Check | null> = {
  completed: Check,
  pending_approval: Hourglass,
  assigned: Clock3,
  returned: Undo2,
  overdue: AlertTriangle,
  not_assigned: null,
  no_test: null,
}

/** Lejant — renk tek başına anlam taşımadığı için her zaman gösterilir. */
const LEGEND: HomeworkTestState[] = [
  'completed',
  'assigned',
  'pending_approval',
  'overdue',
  'not_assigned',
  'no_test',
]

const LEGEND_LABEL: Partial<Record<HomeworkTestState, string>> = {
  no_test: 'Bu konumda test yok',
}

export function BookMapLegend({
  className,
  audience = 'teacher',
  book,
}: {
  className?: string
  audience?: StatusAudience
  /**
   * Verilirse lejant bu kitapta GERÇEKTEN görünen bölüm işaretlerini de
   * açıklar. Bölüm başlığındaki ● ve "Plan dışı" bugüne kadar hiçbir yerde
   * tanımlanmıyordu: kullanıcı işareti görüyor ama karşılığını bilmiyordu.
   *
   * Koşullu gösterilirler — müfredat eşlemesi olmayan ya da hedefi tüm kitap
   * olan bir kaynakta o satırlar hiç çizilmez ve lejantta yer kaplamamalı.
   */
  book?: BookMapBook
}) {
  const hasSignal = !!book?.sections.some(s => hasActiveSignal(s.curriculumStatus))
  const hasOutOfScope = !!book?.sections.some(s => !isSectionInTarget(s, book.target))

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {LEGEND.map(state => (
        <span key={state} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={cn('size-3 shrink-0 rounded-sm border', STATE_STYLE[state])}
          />
          {LEGEND_LABEL[state] ?? testStateLabel(state, audience)}
        </span>
      ))}

      {/* Bölüm işaretleri hücre durumlarından AYRI bir kavramdır: konuya
          aittir, teste değil. Ayırıcı çizgiyle ayrılırlar. */}
      {(hasSignal || hasOutOfScope) && (
        <span aria-hidden className="h-3 w-px shrink-0 bg-border" />
      )}

      {/* Sinyalin GÖRÜNÜMÜ iki haritada farklı: test haritasında ● (bkz.
          section-title.tsx), sayfa haritasında kalın bölüm adı. Lejant
          örneği hangisi çiziliyorsa onu göstermeli, yoksa kullanıcı
          olmayan bir işareti arar. */}
      {hasSignal && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {book?.trackingMode === 'page' ? (
            <span aria-hidden className="shrink-0 text-xs font-semibold text-foreground">
              Konu
            </span>
          ) : (
            <Circle aria-hidden className="size-2 shrink-0 fill-primary text-primary" />
          )}
          Müfredat sinyali (konunun zamanı geldi)
        </span>
      )}

      {hasOutOfScope && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="shrink-0 rounded border px-1 text-[10px] leading-4 text-muted-foreground"
          >
            Plan dışı
          </span>
          Hedef kapsamının dışında
        </span>
      )}
    </div>
  )
}

interface Props {
  book: BookMapBook
  /** Salt okunur modda boş geçilebilir. */
  selectedTestIds?: Set<string>
  /**
   * R7 (R6-03 güncellemesi): haftalık plan sepetine ALINMIŞ birimler.
   *
   * Seçimden ayrı bir kavramdır: seçim yapılacak işlemin hedefidir, sepet
   * ise "Ödeve Ekle" ile o işlemin sonucudur. Harita ikisini ayrı gösterir
   * ki öğretmen neyin plana girdiğini seçimi kaybetmeden görebilsin.
   */
  basketTestIds?: Set<string>
  onToggleTest?: (bookId: string, testId: string) => void
  onToggleSection?: (bookId: string, testIds: string[]) => void
  /** Shift+tık: son tıklanan hücreden buraya kadar seçilebilir testleri seçer. */
  onSelectRange?: (bookId: string, testId: string) => void
  /**
   * Öğrenci ve veli haritayı yalnız okur: hücreler tıklanamaz, seçim ve
   * ipucu çubuğu gösterilmez. Ödev atama tek yerde kalır (öğretmen ekranı).
   */
  readOnly?: boolean
  /** Etiket dili: öğretmende "Reddedildi", öğrenci/velide "İade Edildi". */
  audience?: StatusAudience
  /**
   * plan   — sepet doldurma (varsayılan, bugünkü davranış)
   * manage — eğitmenin akademik kayıt yönetimi (R6-03): tüm durumlar seçilebilir
   */
  mode?: BookMapMode
  /**
   * Bölüm satırı menüsü. studentId VERİLMEZSE menü hiç çizilmez.
   *
   * Menü `readOnly`ye bağlanmadı bilerek: readOnly "hücre seçilemez"
   * demektir (ödev atama tek yüzeyde, R7), oysa menüdeki eylemler konu
   * bazlıdır ve öğretmenin salt okunur Kaynak Haritasında da anlamlıdır.
   * Öğrenci ve veli sayfaları bu alanı GEÇMEZ; menü orada görünmez.
   */
  studentId?: string
  /** "Aktif Tut" override'ı olan konular (lib/topic-overrides.ts). */
  keepActiveTopicIds?: Set<string>
}

const EMPTY_SELECTION: Set<string> = new Set()

export function BookMapGrid({
  book,
  selectedTestIds = EMPTY_SELECTION,
  basketTestIds,
  onToggleTest,
  onToggleSection,
  onSelectRange,
  readOnly = false,
  audience = 'teacher',
  mode = 'plan',
  studentId,
  keepActiveTopicIds,
}: Props) {
  // Sayfa takipli kitapta birim tek bir fiziksel sayfadır (022): 400 sayfa
  // = 400 hücre olurdu. R4 §4 bunun yerine bölüm bazlı bir tablo istiyor.
  // Ayrım tek yerde, burada yapılır; çağıran ekranların (öğretmen, öğrenci,
  // veli) hiçbiri hangi görünümü çizeceğini bilmek zorunda değil.
  if (book.trackingMode === 'page') {
    return (
      <BookPageMap
        book={book}
        selectedTestIds={selectedTestIds}
        basketTestIds={basketTestIds}
        onToggleSection={onToggleSection}
        readOnly={readOnly}
        mode={mode}
        studentId={studentId}
        keepActiveTopicIds={keepActiveTopicIds}
      />
    )
  }

  const columns = Array.from({ length: book.maxTestsPerSection }, (_, i) => i)

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Kitap Haritası</h2>
        <BookMapLegend audience={audience} book={book} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-56 border-b border-r bg-card px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
              >
                Bölümler
              </th>
              {columns.map(i => (
                <th
                  key={i}
                  scope="col"
                  className="border-b bg-card px-1 py-2.5 text-center text-xs font-medium tabular-nums text-muted-foreground"
                >
                  {i + 1}.Test
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {book.sections.map((section, sectionIndex) => {
              const selectableIds = section.tests
                .filter(t => isSelectableState(t.state, mode))
                .map(t => t.id)
              const allSelected =
                selectableIds.length > 0 && selectableIds.every(id => selectedTestIds.has(id))

              // R7-02 §6.4: çok parçalı kaynakta bölümler parça başlığı
              // altında toplanır. Parça değiştiğinde tek bir ayırıcı satır
              // yeterli; parçasız kaynakta hiç görünmez ve harita bugünkü
              // düz listesini korur.
              const previousPart = book.sections[sectionIndex - 1]?.partTitle ?? null
              const startsNewPart = !!section.partTitle && section.partTitle !== previousPart

              return (
                <Fragment key={section.id}>
                {startsNewPart && (
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={columns.length + 1}
                      className="sticky left-0 border-b bg-muted/60 px-4 py-1.5 text-left text-[11px] font-medium text-muted-foreground"
                    >
                      {section.partTitle}
                    </th>
                  </tr>
                )}
                <tr className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 min-w-56 max-w-72 border-b border-r bg-card px-4 py-1.5 text-left font-normal group-hover:bg-muted/40"
                  >
                    {/* Başlık ve menü tek satırda: menü sağ uçta durur ve
                        bölüm adı uzun olsa da yerini korur. */}
                    <span className="flex items-start gap-1">
                    <span className="min-w-0 flex-1">
                    {readOnly ? (
                      <span className="flex w-full items-center justify-between gap-2">
                        <SectionTitle
                          section={section}
                          outOfScope={!isSectionInTarget(section, book.target)}
                        />
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {section.completedCount}/{section.tests.length}
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onToggleSection?.(book.bookId, selectableIds)}
                        disabled={selectableIds.length === 0}
                        className="flex w-full items-center justify-between gap-2 rounded text-left disabled:cursor-default"
                        title={
                          selectableIds.length === 0
                            ? 'Bu bölümde seçilebilir test yok'
                            : allSelected
                              ? 'Bölüm seçimini kaldır'
                              : 'Bölümdeki seçilebilir testleri seç'
                        }
                      >
                        <SectionTitle
                          section={section}
                          outOfScope={!isSectionInTarget(section, book.target)}
                        />
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {section.completedCount}/{section.tests.length}
                        </span>
                      </button>
                    )}
                    </span>

                    {studentId && (
                      <SectionRowMenu
                        studentId={studentId}
                        bookTitle={book.title}
                        sectionTitle={section.title}
                        topicId={section.topicId}
                        keepActive={
                          !!section.topicId && !!keepActiveTopicIds?.has(section.topicId)
                        }
                        className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted"
                      />
                    )}
                    </span>

                    {/* Durum bazlı toplu seçim yalnız yönetim modunda; plan
                        modunda bölüm başlığına tıklamak bugünkü gibi
                        seçilebilir testleri toplar (R6-03 §5). */}
                    {!readOnly && mode === 'manage' && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {SECTION_SELECT_OPTIONS.filter(o => o.kind !== 'all').map(option => {
                          const ids = selectByState(option.kind, section.tests)
                          if (ids.length === 0) return null
                          return (
                            <button
                              key={option.kind}
                              type="button"
                              onClick={() => onToggleSection?.(book.bookId, ids)}
                              title={`${section.title} · ${option.label}`}
                              className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
                            >
                              {option.shortLabel}
                              <span className="ml-0.5 tabular-nums">{ids.length}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </th>

                  {columns.map(i => {
                    const test = section.tests[i]

                    if (!test) {
                      return (
                        <td key={i} className="border-b px-0.5 py-1">
                          <span
                            className={cn(
                              'flex size-7 items-center justify-center rounded-md border',
                              STATE_STYLE.no_test
                            )}
                          >
                            <span aria-hidden>–</span>
                            <span className="sr-only">
                              {LEGEND_LABEL.no_test}
                            </span>
                          </span>
                        </td>
                      )
                    }

                    const Icon = STATE_ICON[test.state]
                    const selectable = isSelectableState(test.state, mode)
                    const selected = selectedTestIds.has(test.id)
                    const inBasket = basketTestIds?.has(test.id) ?? false
                    const label =
                      section.title +
                      ' / ' +
                      test.title +
                      ' — ' +
                      testStateLabel(test.state, audience) +
                      (basketTestIds?.has(test.id) ? ' · plana eklendi' : '')

                    if (readOnly) {
                      return (
                        <td key={test.id} className="border-b px-0.5 py-1">
                          <span
                            title={label}
                            aria-label={label}
                            className={cn(
                              'flex size-7 items-center justify-center rounded-md border',
                              STATE_STYLE[test.state]
                            )}
                          >
                            {Icon ? <Icon className="size-3" /> : <span aria-hidden>–</span>}
                          </span>
                        </td>
                      )
                    }

                    return (
                      <td key={test.id} className="border-b px-0.5 py-1">
                        <button
                          type="button"
                          disabled={!selectable}
                          aria-pressed={selectable ? selected : undefined}
                          onClick={event => {
                            if (event.shiftKey) onSelectRange?.(book.bookId, test.id)
                            else onToggleTest?.(book.bookId, test.id)
                          }}
                          title={label}
                          aria-label={label}
                          className={cn(
                            'flex size-7 items-center justify-center rounded-md border transition-colors',
                            STATE_STYLE[test.state],
                            selectable && 'cursor-pointer hover:brightness-95',
                            !selectable && 'cursor-not-allowed',
                            selected &&
                              'border-primary bg-primary/10 text-primary ring-1 ring-primary',
                            // Sepettekiler kesik çerçeveyle ayrılır: seçili
                            // olmasalar da plana girecekleri görünür kalmalı.
                            !selected && inBasket && 'border-dashed border-primary text-primary'
                          )}
                        >
                          {selected ? (
                            <Check className="size-3.5" />
                          ) : Icon ? (
                            <Icon className="size-3" />
                          ) : (
                            <span aria-hidden>–</span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && (
      <div className="flex items-start gap-2 border-t bg-muted/40 px-4 py-2.5">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          İpucu: Haritada bir teste tıklayarak o testi planınıza ekleyebilirsiniz. Aralık seçmek
          için Shift tuşuyla tıklayın, tüm bölümü seçmek için bölüm adına tıklayın.
        </p>
      </div>
      )}
    </div>
  )
}
