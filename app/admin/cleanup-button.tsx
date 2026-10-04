'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionDialog } from '@/components/admin/action-dialog'
import {
  cleanupPreviewAction,
  deleteCleanupAction,
  type CleanupKind,
  type CleanupPreview,
} from '@/app/admin/admin-actions'

// SEÇEREK TEMİZLEME (136).
//
// Diyalog açılınca önizleme istenir: neyin silineceği sayılarla, varsa
// ENGEL nedeniyle gösterilir ve engelde onay düğmesi kapanır. Onay için
// çalışma alanı / partner ADI ya da kullanıcı E-POSTASI birebir yazılır;
// gerekçe yönetim kaydına değişmez olarak düşer. Asıl denetim RPC'de.

const KIND_TEXT: Record<CleanupKind, { title: string; noun: string }> = {
  workspace: { title: 'Çalışma alanını kalıcı sil', noun: 'çalışma alanının adını' },
  partner: { title: 'Partneri sil', noun: 'partnerin adını' },
  user: { title: 'Kullanıcıyı sil', noun: 'kullanıcının e-postasını' },
}

const COUNT_LABEL: Record<string, string> = {
  students: 'Öğrenci',
  books: 'Kitap',
  homework_batches: 'Ödev',
  members: 'Üye',
  orders: 'Sipariş',
  paid_orders: 'Ödenmiş sipariş',
  paid_commissions: 'Ödenmiş komisyon',
  referred_workspaces: 'Yönlendirdiği alan',
  commissions: 'Komisyon',
}

export function CleanupButton({
  kind,
  id,
  label = 'Kalıcı sil',
  redirectTo,
  size = 'sm',
}: {
  kind: CleanupKind
  id: string
  label?: string
  /** Silmeden sonra gidilecek sayfa (ör. detaydan listeye). */
  redirectTo?: string
  size?: 'xs' | 'sm'
}) {
  const router = useRouter()
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load(open: boolean) {
    if (!open) return
    setPreview(null)
    setError(null)
    setLoading(true)
    const res = await cleanupPreviewAction(kind, id)
    setLoading(false)
    if (res.error) setError(res.error)
    else setPreview(res.preview ?? null)
  }

  const confirmPhrase =
    (kind === 'user' ? (preview?.email as string | null) : (preview?.name as string | null)) ??
    undefined

  return (
    <ActionDialog
      triggerLabel={label}
      trigger={
        <Button size={size} variant="ghost" className="text-destructive-foreground">
          <Trash2 />
          {label}
        </Button>
      }
      title={KIND_TEXT[kind].title}
      description={`Bu işlem geri alınamaz. Onay için ${KIND_TEXT[kind].noun} yazın.`}
      submitLabel="Kalıcı sil"
      destructive
      successMessage="Kalıcı olarak silindi."
      confirmPhrase={confirmPhrase}
      disabled={!preview || Boolean(preview.blocked)}
      onOpenChange={load}
      preview={<PreviewBody kind={kind} preview={preview} loading={loading} error={error} />}
      onSubmit={async (reason, confirm) => {
        const res = await deleteCleanupAction({ kind, id, confirm, reason })
        if (!res.error) {
          if (redirectTo) router.push(redirectTo)
          else router.refresh()
        }
        return res
      }}
    />
  )
}

function PreviewBody({
  kind,
  preview,
  loading,
  error,
}: {
  kind: CleanupKind
  preview: CleanupPreview | null
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Önizleme hazırlanıyor…
      </p>
    )
  }
  if (error) return <p className="text-destructive-foreground">{error}</p>
  if (!preview) return null

  const counts = Object.entries(COUNT_LABEL).filter(
    ([key]) => typeof preview[key] === 'number' || typeof preview[key] === 'string'
  )
  const owned = (preview.owned_workspaces as { name: string }[] | undefined) ?? []
  const memberships = (preview.memberships as { workspace: string; role: string }[] | undefined) ?? []
  const blockers = (preview.blockers as Record<string, number> | undefined) ?? {}

  return (
    <div className="space-y-2">
      <p className="font-medium">
        {(preview.name as string) || '—'}
        {kind === 'user' && preview.email ? (
          <span className="font-normal text-muted-foreground"> · {preview.email as string}</span>
        ) : null}
      </p>
      {kind === 'user' && preview.learner ? (
        <p className="text-xs text-muted-foreground">
          Öğrenci/veli hesabı: ad gizli, e-posta maskeli. Onay için maskeli e-postayı yazın.
        </p>
      ) : null}
      {kind === 'workspace' && preview.owner_name ? (
        <p className="text-xs text-muted-foreground">
          Sahibi: {preview.owner_name as string}
          {preview.owner_email ? ` (${preview.owner_email as string})` : ''}
        </p>
      ) : null}

      {counts.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          {counts.map(([key, text]) => (
            <li key={key} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{text}</span>
              <span className="tabular-nums">{String(preview[key])}</span>
            </li>
          ))}
        </ul>
      )}

      {kind === 'user' && (
        <div className="space-y-1 text-xs">
          {owned.length > 0 && (
            <p>
              <span className="text-muted-foreground">Sahibi olduğu alanlar: </span>
              {owned.map(o => o.name).join(', ')}
            </p>
          )}
          {memberships.length > 0 && (
            <p>
              <span className="text-muted-foreground">Üyelikler: </span>
              {memberships.map(m => `${m.workspace} (${m.role})`).join(', ')}
            </p>
          )}
          {Object.keys(blockers).length > 0 && (
            <p>
              <span className="text-muted-foreground">Bağlı kayıtlar: </span>
              {Object.entries(blockers)
                .map(([k, n]) => `${k} (${n})`)
                .join(', ')}
            </p>
          )}
        </div>
      )}

      {preview.blocked ? (
        <p role="alert" className="text-sm font-medium text-destructive-foreground">
          {preview.block_reason as string}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {kind === 'workspace'
            ? 'Alanın tüm öğrencileri, ödevleri, kitapları, üyelikleri ve kayıtları silinir.'
            : kind === 'partner'
              ? 'Bekleyen komisyonları silinir; yönlendirdiği alanlar partnersiz kalır.'
              : 'Giriş hesabı ve profili silinir; üyelikleri kaldırılır.'}
        </p>
      )}
    </div>
  )
}
