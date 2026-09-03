'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpenCheck, Loader2, MoreVertical, Pin, PinOff, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import {
  addTopicContactAction,
  setTopicKeepActiveAction,
} from '@/app/(dashboard)/teacher/students/[studentId]/protection/actions'
import { addAcademicNoteAction } from '@/app/(dashboard)/teacher/students/[studentId]/note-actions'
import { todayDateString } from '@/lib/homework-status'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Kitap Haritası bölüm satırı menüsü.
//
// NEDEN VAR: bölüm satırında bugüne kadar hiçbir eylem yoktu. Öğretmen
// haritaya bakarken "bu konuyu ders olarak işledim" ya da "bunu aktif tut"
// demek için Koruma Havuzu ekranına gidip konuyu listede yeniden bulmak
// zorundaydı. Eylemler zaten vardı, erişim yeri yoktu.
//
// MENÜDE OLMAYAN İKİ ŞEY ve nedenleri:
//   - "Plana dahil et / Plan dışı bırak": hedef kapsamı bölüm id LİSTESİ
//     olarak saklanıyor (set_student_book_target, replace semantiği). Tek
//     bölümü açıp kapamak "tüm kitap" hedefini önce listeye çevirmeyi ya da
//     birim listesi hedefinde karşılığı olmayan bir dönüşümü gerektirirdi.
//     Kapsam düzenlemesi Hedefler kartında TEK yerde kalır.
//   - "Koruma havuzuna al" ayrı bir eylem DEĞİLDİR: havuz temaslardan
//     türetilir, ayrı bir "havuza al" RPC'si yoktur. Konuyu havuzun görüş
//     alanına sokmak = "Aktif Tut" override'ını kaldırmak. Bu yüzden tek
//     toggle vardır ve etiketi duruma göre değişir.
//
// KONU EŞLEMESİ ZORUNLU: üç eylem de topic_id ile çalışır (041). Bölümün
// konusu yoksa (book_sections.topic_id nullable, 040) eylemler devre dışı
// kalır ve nedeni yazılır — sessizce çalışmaz görünmemeli.

interface Props {
  studentId: string
  /** Not metninin bağlam ön eki için: "345 TYT Matematik / Polinomlar — ..." */
  bookTitle: string
  sectionTitle: string
  /** Bölümün müfredat konusu; null ise konu bazlı eylemler kapalı. */
  topicId: string | null
  /** Konu şu an "Aktif Tut" ile havuz dışında mı? */
  keepActive: boolean
  className?: string
}

export function SectionRowMenu({
  studentId,
  bookTitle,
  sectionTitle,
  topicId,
  keepActive,
  className,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')

  const noTopic = topicId === null
  const noTopicReason = 'Bu bölüm bir müfredat konusuna eşlenmemiş'

  // Ön ek de nota yazıldığı için sunucudaki 2000 karakter sınırından düşülür;
  // aksi hâlde kullanıcı sınıra kadar yazıp reddedilirdi.
  const notePrefix = `${bookTitle} / ${sectionTitle} — `
  const noteMaxLength = Math.max(1, 2000 - notePrefix.length)

  function run(action: () => Promise<{ error?: string | null }>, successMessage: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(successMessage)
      router.refresh()
    })
  }

  function toggleKeepActive() {
    if (!topicId) return
    run(
      () => setTopicKeepActiveAction(studentId, topicId, !keepActive),
      keepActive ? 'Konu koruma havuzuna alındı.' : 'Konu aktif tutuluyor.'
    )
  }

  function markLesson() {
    if (!topicId) return
    // Temas kaydı koruma havuzu sıralamasını DEĞİŞTİRİR ve geri alma yolu
    // bu ekranda yok; onay isteniyor.
    if (
      !window.confirm(
        `"${sectionTitle}" konusu bugün ders olarak işlendi sayılacak ve koruma ` +
          'havuzundaki son temas tarihi güncellenecek. Devam edilsin mi?'
      )
    ) {
      return
    }
    run(
      () => addTopicContactAction(studentId, topicId, 'lesson', todayDateString()),
      'Ders teması kaydedildi.'
    )
  }

  function submitNote() {
    const body = noteText.trim()
    if (!body) return
    // Öğrenciye özel BÖLÜM notu için tablo yok: not öğrencinin akademik
    // notlarına yazılır ve bağlamı metnin başında taşınır. Böylece not
    // öğrenci sayfasındaki Akademik Not panelinde de anlamlı okunur.
    const text = notePrefix + body
    startTransition(async () => {
      const result = await addAcademicNoteAction(studentId, text)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setNoteText('')
      setNoteOpen(false)
      toast.success('Not eklendi.')
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${sectionTitle} bölüm işlemleri`}
          disabled={isPending}
          className={className}
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MoreVertical className="size-3.5" />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            <span className="block truncate">{sectionTitle}</span>
            {noTopic && (
              <span className="block text-xs font-normal text-muted-foreground">
                {noTopicReason}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem disabled={noTopic || isPending} onClick={toggleKeepActive}>
            {keepActive ? <PinOff className="size-4 shrink-0" /> : <Pin className="size-4 shrink-0" />}
            {keepActive ? 'Koruma havuzuna al' : 'Aktif tut'}
          </DropdownMenuItem>

          <DropdownMenuItem disabled={noTopic || isPending} onClick={markLesson}>
            <BookOpenCheck className="size-4 shrink-0" />
            Ders işlendi olarak işaretle
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Not öğrenciye yazıldığı için konu eşlemesi gerekmez. */}
          <DropdownMenuItem disabled={isPending} onClick={() => setNoteOpen(true)}>
            <StickyNote className="size-4 shrink-0" />
            Not ekle
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Not ekle</DialogTitle>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="sectionNote">Not</Label>
            <Textarea
              id="sectionNote"
              rows={4}
              maxLength={noteMaxLength}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Örn: bu bölümde grafik yorumlama zayıf, tekrar gerekli."
            />
            <p className="text-xs text-muted-foreground">
              Not öğrencinin akademik notlarına eklenir ve{' '}
              <span className="font-medium">
                {bookTitle} / {sectionTitle} —
              </span>{' '}
              ön ekiyle başlar.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)} disabled={isPending}>
              Vazgeç
            </Button>
            <Button onClick={submitNote} disabled={isPending || !noteText.trim()}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
