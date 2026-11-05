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

// EK-05 (04.11.2026): dosya PARTİLER hâlinde gönderilir. Eskiden tüm yedek
// tek sunucu eylemine gidiyordu ve 4 MB gövde sınırı (next.config) dosya
// sınırını belirliyordu; 131 kitaplık ≈15 MB'lık havuz hiç aktarılamıyordu.
// Artık sınır yalnız tarayıcının ayrıştırabileceği makul bir boyut; her
// parti birkaç yüz KB. Tek kaynak bu sabit — ekrandaki metin de buradan.
export const MAX_FILE_BYTES = 25_000_000
const MAX_FILE_LABEL = '25 MB'
/** Bir sunucu çağrısındaki kitap sayısı. */
const BOOKS_PER_BATCH = 10

/** Rapor uzun olabilir; ekranda bu kadarı listelenir, gerisi sayılır. */
const SKIPPED_PREVIEW = 8

/** İçe aktarmayı yapan sunucu eylemi. */
export type BookImportAction = (
  fileText: string
) => Promise<{ error?: string; imported?: number; skipped?: string[] }>

interface BookPoolImportProps {
  /**
   * 069/071: aynı diyalog hem koçun havuzuna hem ortak kütüphaneye
   * aktarıyor. Ayrıştırma, önizleme ve uyarılar İKİSİNDE DE AYNI —
   * ikinci bir kopya çıkarmak, 4 MB sınırı ya da "alt bölümler düzleşir"
   * uyarısı değiştiğinde bir yerde unutulacak bakım borcu olurdu.
   * Değişen tek şey hedefi yazan sunucu eylemi ve metinler.
   */
  action?: BookImportAction
  /** "havuzda" / "kütüphanede" — Türkçe ek uyumu tek bir kökten
   *  türetilemediği için hazır biçim geçilir. */
  targetLocative?: string
  /** "havuza" / "kütüphaneye" */
  targetDative?: string
  triggerLabel?: string
}

export function BookPoolImport({
  action = importBookBackupAction,
  targetLocative = 'havuzda',
  targetDative = 'havuza',
  triggerLabel = 'İçe aktar',
}: BookPoolImportProps = {}) {
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<BackupParseResult | null>(null)
  const [pending, startTransition] = useTransition()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
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
      setParsed({
        books: [],
        skipped: [],
        fatal: `Dosya çok büyük (en fazla ${MAX_FILE_LABEL}). Havuzda yalnız gereken kitapları seçip "Seçilenleri dışa aktar" ile daha küçük bir dosya alın.`,
      })
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
      // PARTİLER: ham kitap kayıtları 10'ar 10'ar ayrı çağrılarla gider.
      // Sunucu her partiyi BAŞTAN kendisi ayrıştırır (istemci ayrıştırması
      // kapı değil). Her kitap tek RPC'dir — yarım kitap kalmaz; mevcut
      // havuz her partide yeniden okunduğu için tekrar deneme kopya
      // üretmez (bookIdentityKey).
      let rawBooks: unknown[]
      try {
        const raw = JSON.parse(fileText.current) as unknown
        rawBooks = Array.isArray(raw) ? raw : ((raw as { books?: unknown[] }).books ?? [])
      } catch {
        toast.error('Dosya okunamadı.')
        return
      }

      const batches: unknown[][] = []
      for (let i = 0; i < rawBooks.length; i += BOOKS_PER_BATCH) {
        batches.push(rawBooks.slice(i, i + BOOKS_PER_BATCH))
      }

      let imported = 0
      const skipped: string[] = []
      let failedAt: number | null = null
      let failure: string | null = null
      setProgress({ done: 0, total: batches.length })

      for (let i = 0; i < batches.length; i++) {
        // EYLEMİN KENDİSİ PATLARSA SAYFA ÇÖKMESİN: ağ koparsa ya da dağıtım
        // sırasında eylem kimliği değişirse hata yakalanır, rapor edilir.
        let res: Awaited<ReturnType<BookImportAction>>
        try {
          res = await action(JSON.stringify(batches[i]))
        } catch (error) {
          console.error('[book-import] parti gönderilemedi:', error)
          failedAt = i
          failure = 'sunucuya gönderilemedi'
          break
        }
        if (res.error) {
          // Partideki tüm kitaplar okunamadıysa (ör. hepsi arşivli) bu bir
          // ayrıştırma sonucu; işlem sürer, rapora yazılır.
          if (res.error === 'Dosyadaki kitapların hiçbiri içe aktarılamadı.') {
            skipped.push(`${i + 1}. parti — okunabilir kitap yok`)
          } else {
            failedAt = i
            failure = res.error
            break
          }
        } else {
          imported += res.imported ?? 0
          skipped.push(...(res.skipped ?? []))
        }
        setProgress({ done: i + 1, total: batches.length })
      }
      setProgress(null)

      if (failedAt !== null) {
        // BAŞARISIZ İŞLEM "EKLENDİ" DEMEZ: kaç kitabın girdiği ve nerede
        // durduğu açıkça söylenir; dosya yeniden seçilirse girenler atlanır.
        toast.error(
          `${imported} kitap eklendi; ${failedAt + 1}. partide durdu (${failure}). ` +
            'Dosyayı yeniden aktarırsanız eklenenler atlanır.',
          { duration: 10000 }
        )
        router.refresh()
        return
      }

      // HİÇBİRİ EKLENMEDİYSE BU BİR BAŞARI DEĞİL.
      if (!imported) {
        toast.warning(`Yeni kitap eklenmedi; dosyadaki kitaplar ${targetLocative} zaten var ya da okunamadı.`)
      } else {
        toast.success(
          skipped.length > 0
            ? `${imported} kitap eklendi, ${skipped.length} kitap atlandı.`
            : `${imported} kitap ${targetDative} eklendi.`
        )
      }

      reset()
      setOpen(false)
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
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yedekten kitap aktar</DialogTitle>
          <DialogDescription>
            &quot;Yedek al&quot; ile indirdiğiniz .json dosyasını seçin. Hedefte aynı
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
              ? progress
                ? `Aktarılıyor… ${progress.done}/${progress.total}`
                : 'Aktarılıyor…'
              : books.length > 0
                ? `${books.length} kitabı aktar`
                : 'Aktar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
