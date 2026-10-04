'use client'

import { useState, useTransition } from 'react'
import { Loader2, Save, Layers, Archive, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { BookMapBook } from '@/lib/book-map'
import {
  BOOK_PLAN_STATUS_OPTIONS,
  BOOK_ROLE_OPTIONS,
  bookPlanStatusLabel,
} from '@/lib/resource-plan'
import {
  assignmentCleanupAction,
  setStudentBookPlanAction,
  setStudentBookScopeAction,
} from './target-actions'
import type { StudentScope } from '@/lib/student-scopes'
import { UNASSIGNED_SCOPE_LABEL } from '@/lib/student-scopes'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
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
  /** Çalışma alanının aktif ders/kapsamları (M1.0-01 §1.3). */
  scopes: StudentScope[]
  /** Kaynak ödev veya resmi tamamlama üretmiş mi (sunucuda hesaplanır). */
  isUsed: boolean
  /** Temizlikten sonra dönülecek liste. */
  backHref: string
}

export function ResourcePlanCard({ studentId, book, scopes, isUsed, backHref }: Props) {
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
  // Kayıtlı alan listede yoksa (pasif/silinmiş alan) "Alan atanmamış"
  // gibi davranılır; seçim yapılınca düzelir.
  const initialScope = book.scopeId && scopes.some(s => s.id === book.scopeId) ? book.scopeId : ''
  const [scopeId, setScopeId] = useState(initialScope)

  const planDirty = status !== initialStatus || role !== (book.role ?? '')
  const scopeDirty = scopeId !== initialScope
  const dirty = planDirty || scopeDirty

  function save() {
    startTransition(async () => {
      if (planDirty) {
        const result = await setStudentBookPlanAction(studentId, book.bookId, book.assignmentId, {
          status,
          role,
        })
        if (result?.error) {
          toast.error(result.error)
          return
        }
      }
      // DERS / KAPSAM (M1.0-01 §1.3): kaynağı silip yeniden eklemeden
      // alan değişir; ilerleme, hedef, tarih ve ödev geçmişi korunur.
      if (scopeDirty) {
        const result = await setStudentBookScopeAction(
          studentId,
          book.bookId,
          book.assignmentId,
          scopeId || null
        )
        if (result?.error) {
          toast.error(result.error)
          return
        }
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

        <div className="space-y-1.5">
          <Label htmlFor="planScope">Ders / Kapsam</Label>
          <NativeSelect
            id="planScope"
            value={scopeId}
            onChange={e => setScopeId(e.target.value)}
          >
            <option value="">{UNASSIGNED_SCOPE_LABEL}</option>
            {scopes.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          {scopeDirty && (
            <p className="text-[11px] text-muted-foreground">
              Yalnız alan değişir: ilerleme, hedefler, tarihler ve ödev geçmişi korunur.
            </p>
          )}
        </div>

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

        {/* KAYNAK TEMİZLİĞİ (M1.0-01 §1.2): kullanılmamış kaynak silinir,
            kullanılmış kaynak arşivlenir. Hangisinin sunulacağı sunucuda
            hesaplanır; RPC kullanımı ayrıca yeniden denetler. */}
        <div className="border-t pt-4">
          {isUsed ? (
            <ConfirmActionDialog
              trigger={
                <Button type="button" variant="outline" size="sm">
                  <Archive className="size-4" />
                  Arşivle / öğrenciden kaldır
                </Button>
              }
              title="Kaynak öğrenciden kaldırılsın mı?"
              description={
                <div className="space-y-2">
                  <p>
                    <strong>{book.title}</strong> aktif Kaynak Planından ve yeni ödev seçiminden
                    çıkar.
                  </p>
                  <p>
                    Bekleyen ve onay bekleyen çalışmaları aktif yükten çıkarılır. Tamamlanan
                    çalışmalar, ilerleme ve geçmiş haftalar olduğu gibi kalır. Kaynak Planındaki
                    arşiv bölümünden geri alınabilir.
                  </p>
                </div>
              }
              confirmLabel="Arşivle"
              onConfirm={() =>
                assignmentCleanupAction(studentId, book.bookId, book.assignmentId, 'archive')
              }
              successMessage="Kaynak arşivlendi."
              onDone={() => router.push(backHref)}
            />
          ) : (
            <ConfirmActionDialog
              trigger={
                <Button type="button" variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="size-4" />
                  Kaynağı sil
                </Button>
              }
              title="Kaynak silinsin mi?"
              description={
                <p>
                  <strong>{book.title}</strong> bu öğrencide hiç ödev veya ilerleme üretmedi;
                  atama, hedefi ve taslaktaki seçimleriyle birlikte silinir. Kitap havuzdan
                  silinmez.
                </p>
              }
              confirmLabel="Sil"
              destructive
              onConfirm={() =>
                assignmentCleanupAction(studentId, book.bookId, book.assignmentId, 'delete')
              }
              successMessage="Kaynak silindi."
              onDone={() => router.push(backHref)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
