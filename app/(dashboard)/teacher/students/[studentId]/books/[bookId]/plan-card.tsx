'use client'

import { useState, useTransition } from 'react'
import { Loader2, Save, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { BookMapBook } from '@/lib/book-map'
import {
  BOOK_PLAN_STATUS_OPTIONS,
  BOOK_ROLE_OPTIONS,
  bookPlanStatusLabel,
} from '@/lib/resource-plan'
import { setStudentBookPlanAction } from './target-actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Kaynak Planı kartı (R5.1 §3.1).
//
// İki alan da yalnız NİYET kaydıdır; ilerleme verisine dokunmaz (KP-06).
//
// Durumlar arası geçiş için kilit/koşul motoru YOKTUR: "Bekliyor" başka bir
// kitabın bitmesini beklemek anlamına gelmez, yalnız "henüz başlamadık"
// der. Eğitmen istediği an istediği duruma geçebilir.

interface Props {
  studentId: string
  book: BookMapBook
}

export function ResourcePlanCard({ studentId, book }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // 'paused' ve 'archived' gibi geriye dönük değerler seçenek listesinde
  // yok; onları taşıyan bir kayıt açıldığında select boş kalmasın diye
  // en yakın anlamlı değere düşürülür.
  const initialStatus = ['pending', 'active', 'completed'].includes(book.status)
    ? book.status
    : book.status === 'paused'
      ? 'pending'
      : 'active'

  const [status, setStatus] = useState(initialStatus)
  const [role, setRole] = useState(book.role ?? '')

  const dirty = status !== initialStatus || role !== (book.role ?? '')

  function save() {
    startTransition(async () => {
      const result = await setStudentBookPlanAction(studentId, book.bookId, book.assignmentId, {
        status,
        role,
      })
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success('Kaynak planı güncellendi.')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4 text-muted-foreground" />
          Kaynak Planı
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Bu kaynağın öğrencinin planındaki yeri. İkisi de ilerleme hesabına girmez.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="planStatus">Kitap Durumu</Label>
            <NativeSelect
              id="planStatus"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {BOOK_PLAN_STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="planRole">Rol</Label>
            <NativeSelect id="planRole" value={role} onChange={e => setRole(e.target.value)}>
              <option value="">Belirtilmedi</option>
              {BOOK_ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {book.status !== initialStatus && (
          <p className="text-[11px] text-muted-foreground">
            Kayıtlı durum: {bookPlanStatusLabel(book.status)}
          </p>
        )}

        <Button type="button" onClick={save} disabled={isPending || !dirty}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Kaydet
        </Button>
      </CardContent>
    </Card>
  )
}
