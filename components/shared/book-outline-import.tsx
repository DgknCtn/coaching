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
import { parseBookOutline } from '@/lib/book-import'
import { importBookOutlineAction } from '@/app/(dashboard)/teacher/books/[bookId]/actions'

// TOPLU İÇE AKTARMA ARAYÜZÜ (Faz 5).
//
// AKIŞ: yapıştır -> ANINDA önizle -> onayla. Üç adım değil, tek ekran.
//
// ÖNİZLEME NEDEN ZORUNLU: bu, kitaba yüzlerce satır yazan geri alınamaz
// bir işlem. Öğretmen "60 alt bölüm, 177 test açılacak" cümlesini görmeden
// düğmeye basmamalı. Önizleme yazarken canlı güncellenir; ayrı bir "önizle"
// düğmesi, kullanıcıyı sonucu görmeden ilerlemeye davet ederdi.

const PLACEHOLDER = `01. Bölüm - Temel Kavramlar
Temel Kavramlar 1-4
Tek-Çift Sayılar 5-8
Asal Sayılar 9

02. Bölüm - Rasyonel Sayılar
Rasyonel Sayılar 10-14`

interface BookOutlineImportProps {
  bookId: string
}

export function BookOutlineImport({ bookId }: BookOutlineImportProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()

  // Her tuşta yeniden ayrıştırmak ucuz: saf fonksiyon, ağ yok, 300 satır
  // sınırlı. Böylece önizleme yazarken canlı kalıyor.
  const outline = useMemo(() => parseBookOutline(text), [text])

  const subsectionCount = outline.chapters.reduce(
    (n, c) => n + c.subsections.length,
    0
  )
  const canImport = outline.chapters.length > 0 && !pending

  function handleImport() {
    startTransition(async () => {
      const res = await importBookOutlineAction(bookId, outline.chapters)
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
            Kitabın içindekiler listesini yapıştırın. Satırın sonunda test aralığı
            varsa alt bölüm, yoksa bölüm başlığı olarak eklenir. Mevcut bölümler
            silinmez, yenileri sona eklenir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={10}
            className="font-mono text-xs"
            aria-label="İçindekiler metni"
          />

          {text.trim() !== '' && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">
                {outline.chapters.length} bölüm · {subsectionCount} alt bölüm ·{' '}
                {outline.totalTests} test eklenecek
              </p>

              <div className="max-h-52 space-y-2 overflow-y-auto text-sm">
                {outline.chapters.map((chapter, ci) => (
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
              {outline.issues.length > 0 && (
                <div className="space-y-1 border-t pt-2">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
                    {outline.issues.length} satır dikkat istiyor
                  </p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {outline.issues.map((issue, i) => (
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
