'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle, FileJson, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { parseBookBackup, type BackupParseResult } from '@/lib/book-backup'
import { importBookBackupAction } from '@/app/(dashboard)/teacher/books/actions'

// KİTAP HAVUZUNU YEDEKTEN GERİ YÜKLEME ARAYÜZÜ.
//
// AKIŞ: dosya seç -> ne geleceğini GÖR -> onayla.
//
// ÖNİZLEME NEDEN ZORUNLU: bu, havuza yüzlerce kayıt yazan ve tek düğmeyle
// geri alınamayan bir işlem. "12 kitap, 148 bölüm, 1.240 test eklenecek"
// cümlesini görmeden onaylatmak, kullanıcıyı kendi havuzunda sürprizle
// karşılaştırmak olurdu.
//
// AYRIŞTIRMA TARAYICIDA, YAZMA SUNUCUDA. Önizleme için dosyayı sunucuya
// göndermek gereksiz bir tur; ama içe aktarmanın kendisi sunucu
// eyleminde, çünkü yetki ve yazma kuralları orada. İstemcideki ayrıştırma
// bir KOLAYLIK, kapı değil: sunucu aynı dosyayı baştan kendisi ayrıştırır.

const MAX_FILE_BYTES = 4_000_000

/** Rapor uzun olabilir; ekranda bu kadarı listelenir, gerisi sayılır. */
const SKIPPED_PREVIEW = 8

export function BookPoolImport() {
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<BackupParseResult | null>(null)
  const [pending, startTransition] = useTransition()
  const fileText = useRef<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function reset() {
    setFileName(null)
    setParsed(null)
    fileText.current = ''
    if (inputRef.current) inputRef.current.value = ''
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_BYTES) {
      setFileName(file.name)
      setParsed({ books: [], skipped: [], fatal: 'Dosya çok büyük (en fazla 4 MB).' })
      return
    }

    const text = await file.text()
    fileText.current = text
    setFileName(file.name)
    setParsed(parseBookBackup(text))
  }

  const books = parsed?.books ?? []
  const sectionCount = books.reduce((n, b) => n + b.sections.length, 0)
  const testCount = books.reduce((n, b) => n + b.testCount, 0)
  const canImport = books.length > 0 && !pending

  function handleImport() {
    startTransition(async () => {
      const res = await importBookBackupAction(fileText.current)

      if (res.error) {
        toast.error(res.error)
        return
      }

      // HİÇBİRİ EKLENMEDİYSE BU BİR BAŞARI DEĞİL. Yeşil bir "0 kitap
      // eklendi" bildirimi, kullanıcıya işin yürüdüğünü söylerdi.
      if (!res.imported) {
        toast.warning('Yeni kitap eklenmedi; dosyadaki kitaplar havuzda zaten var.')
      } else {
        const left = res.skipped?.length ?? 0
        toast.success(
          left > 0
            ? `${res.imported} kitap eklendi, ${left} kitap atlandı.`
            : `${res.imported} kitap havuza eklendi.`
        )
      }

      reset()
      setOpen(false)
      // Sunucu eylemi revalidatePath çağırıyor; refresh, açık olan listeyi
      // yeniden çizdirir.
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Upload />
            İçe aktar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yedekten kitap aktar</DialogTitle>
          <DialogDescription>
            &quot;Yedek al&quot; ile indirdiğiniz .json dosyasını seçin. Havuzda aynı
            ad, yayın ve baskı yılıyla bulunan kitaplar atlanır.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={onFile}
              disabled={pending}
              className="block w-full cursor-pointer rounded-md border border-input bg-card text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-input file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70 disabled:opacity-50"
            />
          </div>

          {parsed?.fatal ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive-border bg-destructive-subtle px-3 py-2.5 text-sm text-destructive-foreground"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{parsed.fatal}</span>
            </div>
          ) : parsed ? (
            <div className="rounded-md border bg-muted/30 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <FileJson className="size-4 text-muted-foreground" aria-hidden />
                {fileName}
              </p>

              {/* SAYILAR ÖNİZLEMENİN KENDİSİ: kullanıcı onayladığında ne
                  olacağını tek satırda görüyor. */}
              <p className="mt-2 text-sm tabular-nums">
                <strong className="font-medium">{books.length}</strong> kitap ·{' '}
                <strong className="font-medium">{sectionCount}</strong> bölüm ·{' '}
                <strong className="font-medium">{testCount.toLocaleString('tr-TR')}</strong>{' '}
                test eklenecek
              </p>

              {parsed.skipped.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <p className="text-xs font-medium text-warning-foreground">
                    {parsed.skipped.length} kitap alınamıyor:
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {parsed.skipped.slice(0, SKIPPED_PREVIEW).map((line) => (
                      <li key={line}>· {line}</li>
                    ))}
                    {parsed.skipped.length > SKIPPED_PREVIEW && (
                      <li>· … ve {parsed.skipped.length - SKIPPED_PREVIEW} kitap daha</li>
                    )}
                  </ul>
                </div>
              )}

              {/* KAPSAM SINIRI KARAR ANINDA SÖYLENİR: kullanıcı alt
                  bölümlerinin düzleştiğini içe aktardıktan SONRA fark
                  ederse, güveni yedeğin tamamına gider. */}
              <p className="mt-3 text-xs text-muted-foreground">
                Alt bölümler düz bölüm listesine çevrilir; test sayıları korunur,
                test adları yeniden üretilir.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Dosyayı seçtiğinizde ne ekleneceğini burada görürsünüz.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Vazgeç
          </Button>
          <Button type="button" disabled={!canImport} onClick={handleImport}>
            {pending
              ? 'Aktarılıyor…'
              : books.length > 0
                ? `${books.length} kitabı aktar`
                : 'Aktar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
