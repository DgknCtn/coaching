'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { parseBookOutline, parsePageOutline } from '@/lib/book-import'
import {
  importBookOutlineAction,
  importPageSectionsAction,
} from '@/app/(dashboard)/teacher/books/[bookId]/actions'

// TOPLU İÇE AKTARMA ARAYÜZÜ (Faz 5).
//
// AKIŞ: yapıştır -> ANINDA önizle -> onayla. Üç adım değil, tek ekran.
//
// ÖNİZLEME NEDEN ZORUNLU: bu, kitaba yüzlerce satır yazan geri alınamaz
// bir işlem. Öğretmen "60 alt bölüm, 177 test açılacak" cümlesini görmeden
// düğmeye basmamalı. Önizleme yazarken canlı güncellenir; ayrı bir "önizle"
// düğmesi, kullanıcıyı sonucu görmeden ilerlemeye davet ederdi.
//
// ============================================================
// İKİ TAKİP TÜRÜ, TEK EKRAN (R8)
//
// Bu ekran sayfa takipli kitaplara kapalıydı; gerekçe "sayfa takipli
// kitapta bölümler test değil sayfa aralığı taşır" idi. Ama öğretmenin
// YAPIŞTIRDIĞI metin iki durumda da aynı: başlık + sondaki sayı aralığı.
// Değişen tek şey aralığın ne anlama geldiği. Sayfa kitabının 60 bölümü
// bugüne dek tek tek elle giriliyordu.
//
// Bu yüzden ayrı bir ekran değil, aynı ekranın iki kipi var: ayrıştırıcı,
// önizleme ve sunucu eylemi moda göre seçilir. Öğretmenin öğrenmesi
// gereken ikinci bir format yok.
// ============================================================

const TEST_PLACEHOLDER = `01. Bölüm - Temel Kavramlar
Temel Kavramlar 1-4
Tek-Çift Sayılar 5-8
Asal Sayılar 9

02. Bölüm - Rasyonel Sayılar
Rasyonel Sayılar 10-14`

const PAGE_PLACEHOLDER = `Üçgenler 1-56
Çokgenler 57-98
Çember sf. 99-140`

interface BookOutlineImportProps {
  bookId: string
  /**
   * Kitabın takip türü. 'page' ise sayfa kipi; diğer tüm türler
   * (test/section/step/trial) `book_tests`'i test gibi kullanır ve test
   * kipinden geçer.
   */
  trackingMode?: string
}

export function BookOutlineImport({ bookId, trackingMode }: BookOutlineImportProps) {
  const isPage = trackingMode === 'page'
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()

  // Her tuşta yeniden ayrıştırmak ucuz: saf fonksiyon, ağ yok, 300 satır
  // sınırlı. Böylece önizleme yazarken canlı kalıyor.
  const outline = useMemo(
    () => (isPage ? null : parseBookOutline(text)),
    [text, isPage]
  )
  const pageOutline = useMemo(
    () => (isPage ? parsePageOutline(text) : null),
    [text, isPage]
  )

  const issues = (isPage ? pageOutline!.issues : outline!.issues)

  const subsectionCount = outline
    ? outline.chapters.reduce((n, c) => n + c.subsections.length, 0)
    : 0

  const canImport =
    !pending &&
    (isPage ? pageOutline!.sections.length > 0 : outline!.chapters.length > 0)

  function handleImport() {
    startTransition(async () => {
      if (isPage) {
        const res = await importPageSectionsAction(bookId, pageOutline!.sections)
        if (res.error) {
          toast.error(res.error)
          return
        }
        const r = res.result
        toast.success(
          r ? `${r.sections} bölüm ve ${r.pages} sayfa eklendi.` : 'İçe aktarıldı.'
        )
      } else {
        const res = await importBookOutlineAction(bookId, outline!.chapters)
        if (res.error) {
          toast.error(res.error)
          return
        }
        const r = res.result
        toast.success(
          r
            ? `${r.chapters} bölüm, ${r.subsections} alt bölüm ve ${r.tests} test eklendi.`
            : 'İçe aktarıldı.'
        )
      }
      setText('')
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            İçindekilerden aktar
          </Button>
        }
      />

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>İçindekilerden toplu aktar</DialogTitle>
          <DialogDescription>
            {isPage
              ? 'Kitabın içindekiler listesini yapıştırın. Her satır bir bölüm ve sayfa aralığı olmalı (örn. "Üçgenler 1-56"). Mevcut bölümler silinmez, yenileri sona eklenir.'
              : 'Kitabın içindekiler listesini yapıştırın. Satırın sonunda test aralığı varsa alt bölüm, yoksa bölüm başlığı olarak eklenir. Mevcut bölümler silinmez, yenileri sona eklenir.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isPage ? PAGE_PLACEHOLDER : TEST_PLACEHOLDER}
            rows={10}
            className="font-mono text-xs"
            aria-label="İçindekiler metni"
          />

          {text.trim() !== '' && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">
                {isPage
                  ? `${pageOutline!.sections.length} bölüm · ${pageOutline!.totalPages} sayfa eklenecek`
                  : `${outline!.chapters.length} bölüm · ${subsectionCount} alt bölüm · ${outline!.totalTests} test eklenecek`}
              </p>

              <div className="max-h-52 space-y-2 overflow-y-auto text-sm">
                {isPage
                  ? pageOutline!.sections.map((section, i) => (
                      <div key={i} className="flex justify-between gap-4">
                        <span className="truncate font-medium">{section.title}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {section.pageStart === section.pageEnd
                            ? `sf. ${section.pageStart}`
                            : `sf. ${section.pageStart}-${section.pageEnd}`}
                        </span>
                      </div>
                    ))
                  : outline!.chapters.map((chapter, ci) => (
                      <div key={ci}>
                        <p className="font-medium">{chapter.title}</p>
                        <ul className="ml-4 text-muted-foreground">
                          {chapter.subsections.map((sub, si) => (
                            <li key={si} className="flex justify-between gap-4">
                              <span className="truncate">{sub.title}</span>
                              <span className="shrink-0 tabular-nums">
                                {sub.testStart === sub.testEnd
                                  ? `Test ${sub.testStart}`
                                  : `Test ${sub.testStart}-${sub.testEnd}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
              </div>

              {/* Sorunlu satırlar işi durdurmaz ama GİZLENMEZ: öğretmen
                  neyin atlandığını satır numarasıyla görmeli, yoksa
                  eksik kitabı çok sonra fark eder. */}
              {issues.length > 0 && (
                <div className="space-y-1 border-t pt-2">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
                    {issues.length} satır dikkat istiyor
                  </p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {issues.map((issue, i) => (
                      <li key={i}>
                        <span className="tabular-nums">Satır {issue.line}:</span>{' '}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Vazgeç
          </Button>
          <Button type="button" onClick={handleImport} disabled={!canImport}>
            {pending ? 'Ekleniyor…' : 'Ekle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
