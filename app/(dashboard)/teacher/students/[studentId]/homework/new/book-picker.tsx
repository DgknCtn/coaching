'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { suggestScopeForBook } from '@/lib/homework-defaults'
import { assignBookAction } from '../../../actions'
import { setStudentBookPlanAction } from '../../books/[bookId]/target-actions'

// KİTAP SEÇİCİ — "Ödev Verme Akışını Kısaltma" (26.11.2026) §2.
//
// Ödev Ver ekranından çıkmadan: aktif kitaba geç, beklemedeki kitabı
// aktif et ya da havuzdan kitap ata. Havuzdan atama TEK TIK ONAY ister
// (ders/kapsam önerisiyle): yanlışlıkla yapılan seçim kayıt oluşturmaz.
// Atama/aktifleme sonrası ekran ?book= ile o kitapta yeniden açılır;
// sepet taslağı otomatik kaydedildiği için korunur.

export interface PendingBook {
  assignmentId: string
  bookId: string
  title: string
}

export interface PoolBook {
  id: string
  title: string
  subject: string | null
  levelExam: string | null
  publisher: string | null
}

export interface PickerScope {
  id: string
  name: string
  subject: string | null
  levelExam: string | null
}

type Pick = { kind: 'pending'; book: PendingBook } | { kind: 'pool'; book: PoolBook } | null

export function BookPicker({
  studentId,
  activeBooks,
  activeBookId,
  onSelectActive,
  pendingBooks,
  poolBooks,
  scopes,
}: {
  studentId: string
  activeBooks: { bookId: string; title: string }[]
  activeBookId: string | null
  onSelectActive: (bookId: string) => void
  pendingBooks: PendingBook[]
  poolBooks: PoolBook[]
  scopes: PickerScope[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pick, setPick] = useState<Pick>(null)
  const [scopeId, setScopeId] = useState('')

  const total = activeBooks.length + pendingBooks.length + poolBooks.length
  if (total === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Bu dönemde atanabilir kitap yok.{' '}
        <Link href={`/teacher/students/${studentId}?sekme=kitaplar`} className="text-primary underline underline-offset-2">
          Kaynaklar&apos;a git
        </Link>
      </p>
    )
  }
  // Tek aktif kitap ve başka seçenek yoksa seçici gürültüdür.
  if (activeBooks.length === 1 && pendingBooks.length === 0 && poolBooks.length === 0) return null

  function onChange(value: string) {
    if (value.startsWith('pending:')) {
      const book = pendingBooks.find(b => b.assignmentId === value.slice(8))
      if (book) setPick({ kind: 'pending', book })
      return
    }
    if (value.startsWith('pool:')) {
      const book = poolBooks.find(b => b.id === value.slice(5))
      if (book) {
        setPick({ kind: 'pool', book })
        setScopeId(suggestScopeForBook(book, scopes) ?? '')
      }
      return
    }
    setPick(null)
    onSelectActive(value)
  }

  function openBook(bookId: string) {
    setPick(null)
    // Builder yeniden kurulmaz (aynı rota): seçim istemcide de ayarlanır;
    // yenilenen liste kitabı getirince harita o kitapta açılır.
    onSelectActive(bookId)
    router.replace(`/teacher/students/${studentId}/homework/new?book=${bookId}`)
    router.refresh()
  }

  function activate(book: PendingBook) {
    startTransition(async () => {
      const r = await setStudentBookPlanAction(studentId, book.bookId, book.assignmentId, { status: 'active' })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(`${book.title} Aktif yapıldı.`)
      openBook(book.bookId)
    })
  }

  function assign(book: PoolBook) {
    startTransition(async () => {
      const r = await assignBookAction(studentId, book.id, scopeId || null, 'active')
      if (r.error && !r.assignmentId) {
        toast.error(r.error)
        return
      }
      if (r.error) toast.warning(r.error)
      else toast.success(`${book.title} atandı ve Aktif yapıldı.`)
      openBook(book.id)
    })
  }

  const suggested = pick?.kind === 'pool' ? suggestScopeForBook(pick.book, scopes) : null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="activeBook" className="shrink-0 text-xs text-muted-foreground">
          Kitap
        </Label>
        <NativeSelect
          id="activeBook"
          value={
            pick?.kind === 'pending'
              ? `pending:${pick.book.assignmentId}`
              : pick?.kind === 'pool'
                ? `pool:${pick.book.id}`
                : (activeBookId ?? '')
          }
          onChange={e => onChange(e.target.value)}
          className="max-w-sm"
          disabled={isPending}
        >
          {activeBooks.length === 0 && <option value="">Kitap seçin</option>}
          {activeBooks.length > 0 && (
            <optgroup label="Aktif">
              {activeBooks.map(b => (
                <option key={b.bookId} value={b.bookId}>
                  {b.title}
                </option>
              ))}
            </optgroup>
          )}
          {pendingBooks.length > 0 && (
            <optgroup label="Beklemede">
              {pendingBooks.map(b => (
                <option key={b.assignmentId} value={`pending:${b.assignmentId}`}>
                  {b.title} (beklemede)
                </option>
              ))}
            </optgroup>
          )}
          {poolBooks.length > 0 && (
            <optgroup label="Havuzdan ata">
              {poolBooks.map(b => (
                <option key={b.id} value={`pool:${b.id}`}>
                  {[b.title, b.publisher, b.levelExam].filter(Boolean).join(' · ')}
                </option>
              ))}
            </optgroup>
          )}
        </NativeSelect>
      </div>

      {pick?.kind === 'pending' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning-border bg-warning-subtle/40 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1">
            <strong className="font-medium">{pick.book.title}</strong> beklemede. Aktif edeyim mi?
          </span>
          <Button size="xs" disabled={isPending} onClick={() => activate(pick.book)}>
            {isPending && <Loader2 className="animate-spin" />}
            Aktif et
          </Button>
          <Button size="xs" variant="ghost" disabled={isPending} onClick={() => setPick(null)}>
            Vazgeç
          </Button>
        </div>
      )}

      {pick?.kind === 'pool' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <span className="min-w-0">
            <strong className="font-medium">{pick.book.title}</strong> bu öğrenciye atanacak.
          </span>
          <Label htmlFor="pickScope" className="text-xs text-muted-foreground">
            Ders/Kapsam
          </Label>
          <NativeSelect
            id="pickScope"
            value={scopeId}
            onChange={e => setScopeId(e.target.value)}
            disabled={isPending}
            className="max-w-[14rem]"
          >
            <option value="">Alan seçilmedi</option>
            {scopes.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.id === suggested ? ' (öneri)' : ''}
              </option>
            ))}
          </NativeSelect>
          <Button size="xs" disabled={isPending} onClick={() => assign(pick.book)}>
            {isPending && <Loader2 className="animate-spin" />}
            Ata ve aç
          </Button>
          <Button size="xs" variant="ghost" disabled={isPending} onClick={() => setPick(null)}>
            Vazgeç
          </Button>
        </div>
      )}
    </div>
  )
}
