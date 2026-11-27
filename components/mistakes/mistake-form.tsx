'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/mistakes/image-compress'
import { PHOTO_BUCKET, type MistakeFormOptions } from '@/lib/mistakes/load'
import { ANSWERS, MISTAKE_REASONS, REASON_LABEL, type MistakeReason } from '@/lib/mistakes/reasons'
import type { ExamTag } from '@/lib/mistakes/net'
import type { MistakeInput } from '@/lib/mistakes/schema'
import { cn } from '@/lib/utils'

// HATA EKLE — telefon öncelikli. Öğrenci ve öğretmen aynı formu kullanır;
// kaydı yapan eylem prop olarak gelir. Fotoğraf yüklemeden ÖNCE
// sıkıştırılır ve doğrudan öğrencinin klasörüne gider (161 depolama
// kuralı yolu doğrular).

const OTHER = '__diger'

type PhotoSlot = { path: string; preview: string } | null

export function MistakeForm({
  workspaceId,
  studentId,
  examTags,
  options,
  onSubmit,
  doneHref,
  defaults,
}: {
  workspaceId: string
  studentId: string
  examTags: ExamTag[]
  options: MistakeFormOptions
  onSubmit: (input: MistakeInput) => Promise<{ error?: string; id?: string }>
  doneHref: string
  defaults?: { bookId?: string; bookTestId?: string }
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [examTag, setExamTag] = useState<ExamTag>(examTags[0])
  const [scopeId, setScopeId] = useState(options.subjects[0]?.id ?? OTHER)
  const [subjectText, setSubjectText] = useState('')
  const [topicId, setTopicId] = useState('')
  const [topicText, setTopicText] = useState('')
  const [bookId, setBookId] = useState(defaults?.bookId && options.books.some(b => b.id === defaults.bookId) ? defaults.bookId : '')
  const [bookTestId, setBookTestId] = useState(defaults?.bookTestId ?? '')
  const [sourceText, setSourceText] = useState('')
  const [pageRef, setPageRef] = useState('')
  const [reason, setReason] = useState<MistakeReason | ''>('')
  const [studentAnswer, setStudentAnswer] = useState('')
  const [correctAnswer, setCorrectAnswer] = useState('')
  const [solutionNote, setSolutionNote] = useState('')
  const [questionPhoto, setQuestionPhoto] = useState<PhotoSlot>(null)
  const [solutionPhoto, setSolutionPhoto] = useState<PhotoSlot>(null)
  const [uploading, setUploading] = useState<'question' | 'solution' | null>(null)

  const subject = options.subjects.find(s => s.id === scopeId)
  const book = options.books.find(b => b.id === bookId)

  async function upload(file: File, slot: 'question' | 'solution') {
    setUploading(slot)
    try {
      const blob = await compressImage(file)
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${workspaceId}/${studentId}/${crypto.randomUUID()}.${ext}`
      const { error } = await createClient().storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type })
      if (error) throw new Error('Fotoğraf yüklenemedi; bağlantınızı kontrol edip yeniden deneyin.')
      const value = { path, preview: URL.createObjectURL(blob) }
      if (slot === 'question') setQuestionPhoto(value)
      else setSolutionPhoto(value)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fotoğraf eklenemedi.')
    } finally {
      setUploading(null)
    }
  }

  async function discard(slot: 'question' | 'solution') {
    const current = slot === 'question' ? questionPhoto : solutionPhoto
    if (slot === 'question') setQuestionPhoto(null)
    else setSolutionPhoto(null)
    if (current) await createClient().storage.from(PHOTO_BUCKET).remove([current.path])
  }

  function reset() {
    setTopicId('')
    setTopicText('')
    setPageRef('')
    setReason('')
    setStudentAnswer('')
    setCorrectAnswer('')
    setSolutionNote('')
    setQuestionPhoto(null)
    setSolutionPhoto(null)
  }

  function submit(another: boolean) {
    if (!reason) {
      toast.error('Hatanın nedenini seçin.')
      return
    }
    const isOther = scopeId === OTHER
    startTransition(async () => {
      const r = await onSubmit({
        examTag,
        scopeId: isOther ? null : scopeId,
        subjectText: isOther ? subjectText : null,
        topicId: !isOther && topicId && topicId !== OTHER ? topicId : null,
        topicText: isOther || !topicId || topicId === OTHER ? topicText : null,
        bookId: bookId && bookId !== OTHER ? bookId : null,
        bookTestId: bookId && bookId !== OTHER && bookTestId ? bookTestId : null,
        sourceText: !bookId || bookId === OTHER ? sourceText : null,
        pageRef,
        reason,
        studentAnswer: (studentAnswer || null) as MistakeInput['studentAnswer'],
        correctAnswer: (correctAnswer || null) as MistakeInput['correctAnswer'],
        solutionNote,
        questionPhotoPath: questionPhoto?.path ?? null,
        solutionPhotoPath: solutionPhoto?.path ?? null,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success('Hata deftere eklendi. İlk tekrarı bugün.')
      if (another) {
        reset()
        router.refresh()
      } else {
        router.push(doneHref)
      }
    })
  }

  const busy = isPending || uploading !== null

  return (
    <form
      className="space-y-5"
      onSubmit={e => {
        e.preventDefault()
        submit(false)
      }}
    >
      {examTags.length > 1 && (
        <Field label="Sınav">
          <div className="flex gap-2">
            {examTags.map(t => (
              <Chip key={t} active={examTag === t} onClick={() => setExamTag(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ders" htmlFor="mf-subject">
          <NativeSelect
            id="mf-subject"
            value={scopeId}
            onChange={e => {
              setScopeId(e.target.value)
              setTopicId('')
            }}
          >
            {options.subjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={OTHER}>Diğer (yazarak)</option>
          </NativeSelect>
          {scopeId === OTHER && (
            <Input className="mt-2" placeholder="Ders adı" maxLength={80} value={subjectText} onChange={e => setSubjectText(e.target.value)} />
          )}
        </Field>
        <Field label="Konu" htmlFor="mf-topic">
          {subject && subject.topics.length > 0 ? (
            <NativeSelect id="mf-topic" value={topicId} onChange={e => setTopicId(e.target.value)}>
              <option value="">Konu seçin (isteğe bağlı)</option>
              {subject.topics.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={OTHER}>Diğer (yazarak)</option>
            </NativeSelect>
          ) : null}
          {(!subject || subject.topics.length === 0 || topicId === OTHER) && (
            <Input
              id={subject && subject.topics.length > 0 ? undefined : 'mf-topic'}
              className={cn(subject && subject.topics.length > 0 && 'mt-2')}
              placeholder="ör. Türev"
              maxLength={120}
              value={topicText}
              onChange={e => setTopicText(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Kaynak" htmlFor="mf-source">
          {options.books.length > 0 && (
            <NativeSelect
              id="mf-source"
              value={bookId}
              onChange={e => {
                setBookId(e.target.value)
                setBookTestId('')
              }}
            >
              <option value="">Kitap seçin (isteğe bağlı)</option>
              {options.books.map(b => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
              <option value={OTHER}>Başka kaynak (yazarak)</option>
            </NativeSelect>
          )}
          {book && book.tests.length > 0 && (
            <NativeSelect className="mt-2" aria-label="Test" value={bookTestId} onChange={e => setBookTestId(e.target.value)}>
              <option value="">Test seçin (isteğe bağlı)</option>
              {book.tests.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </NativeSelect>
          )}
          {(options.books.length === 0 || bookId === OTHER) && (
            <Input
              id={options.books.length === 0 ? 'mf-source' : undefined}
              className={cn(options.books.length > 0 && 'mt-2')}
              placeholder="ör. 3D TYT Deneme 4"
              maxLength={160}
              value={sourceText}
              onChange={e => setSourceText(e.target.value)}
            />
          )}
        </Field>
        <Field label="Sayfa / soru" htmlFor="mf-page">
          <Input id="mf-page" placeholder="s.48 / 6" maxLength={40} value={pageRef} onChange={e => setPageRef(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PhotoField
          label="Soru fotoğrafı"
          photo={questionPhoto}
          uploading={uploading === 'question'}
          disabled={busy}
          onPick={f => upload(f, 'question')}
          onRemove={() => discard('question')}
        />
        <PhotoField
          label="Çözüm fotoğrafı (isteğe bağlı)"
          photo={solutionPhoto}
          uploading={uploading === 'solution'}
          disabled={busy}
          onPick={f => upload(f, 'solution')}
          onRemove={() => discard('solution')}
        />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Yalnız soruyu çekin; yüz, isim ya da kişisel bilgi görünmesin. Fotoğraf sıkıştırılarak saklanır.
      </p>

      <Field label="Neden yanlış yaptın?">
        <div className="flex flex-wrap gap-2">
          {MISTAKE_REASONS.map(r => (
            <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
              {REASON_LABEL[r]}
            </Chip>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Senin cevabın">
          <div className="flex flex-wrap gap-1.5">
            {ANSWERS.map(a => (
              <Chip key={a} active={studentAnswer === a} onClick={() => setStudentAnswer(studentAnswer === a ? '' : a)}>
                {a === 'bos' ? 'Boş' : a}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Doğru cevap">
          <div className="flex flex-wrap gap-1.5">
            {ANSWERS.filter(a => a !== 'bos').map(a => (
              <Chip key={a} active={correctAnswer === a} onClick={() => setCorrectAnswer(correctAnswer === a ? '' : a)}>
                {a}
              </Chip>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Çözüm notu (isteğe bağlı)" htmlFor="mf-note">
        <Textarea
          id="mf-note"
          rows={3}
          maxLength={1000}
          placeholder="Doğru yol neydi? Bir dahakine neye dikkat edeceksin?"
          value={solutionNote}
          onChange={e => setSolutionNote(e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={busy} className="sm:flex-1">
          {isPending && <Loader2 className="animate-spin" />}
          Kaydet
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => submit(true)} className="sm:flex-1">
          Kaydet ve yeni ekle
        </Button>
      </div>
    </form>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {htmlFor ? <Label htmlFor={htmlFor}>{label}</Label> : <p className="text-sm font-medium">{label}</p>}
      {children}
    </div>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-md border px-3 text-sm transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}

function PhotoField({
  label,
  photo,
  uploading,
  disabled,
  onPick,
  onRemove,
}: {
  label: string
  photo: PhotoSlot
  uploading: boolean
  disabled: boolean
  onPick: (f: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {photo ? (
        <div className="relative overflow-hidden rounded-lg border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- yerel önizleme (blob:) */}
          <img src={photo.preview} alt={label} className="max-h-56 w-full object-contain" />
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            className="absolute top-2 right-2"
            aria-label="Fotoğrafı kaldır"
            onClick={onRemove}
          >
            <X />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
          {uploading ? 'Sıkıştırılıyor…' : 'Fotoğraf çek ya da seç'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPick(f)
        }}
      />
    </div>
  )
}
