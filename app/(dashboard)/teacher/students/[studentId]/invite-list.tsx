'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { revokeInviteAction } from './invite-actions'
import {
  INVITE_STATUS_LABEL,
  deriveInviteStatus,
  inviteTimeLeftLabel,
  type InviteDisplayStatus,
} from '@/lib/invite-status'
import { Badge } from '@/components/ui/badge'

// Davet geçmişi ve açık davetler.
//
// NEDEN VAR: "davet gönderdim mi, kaç tane açık, kabul edildi mi?" sorusunun
// arayüzde hiçbir cevabı yoktu. invitations tablosunu okuyan tek yer davet
// linkinin kendi sayfasıydı; öğretmen ekranı yalnız INSERT yapıyordu.
//
// Öğrenci daveti için dolaylı bir ipucu vardı (hesap açılınca buton
// kayboluyordu) ama veli davetinde o da yoktu: parent_student_links satırı
// ancak KABUL anında oluştuğu için bekleyen davet hiçbir yerde görünmüyordu.

const STATUS_VARIANT: Record<InviteDisplayStatus, 'warning' | 'success' | 'neutral'> = {
  active: 'warning',
  accepted: 'success',
  expired: 'neutral',
  revoked: 'neutral',
}

export interface InviteListRow {
  id: string
  role: 'student' | 'parent'
  status: string
  expiresAt: string
  createdAt: string
  acceptedAt: string | null
  /** Davet bir e-postaya kilitli mi? Veli davetinde çoğu zaman değil. */
  invitedEmail: string | null
  createdByName: string | null
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function InviteList({
  studentId,
  invites,
}: {
  studentId: string
  invites: InviteListRow[]
}) {
  if (invites.length === 0) return null

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Davet</th>
            <th className="px-3 py-2 font-medium">Gönderildi</th>
            <th className="px-3 py-2 font-medium">Durum</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {invites.map(invite => {
            const status = deriveInviteStatus(invite)
            return (
              <tr key={invite.id}>
                <td className="px-3 py-2">
                  <p className="text-sm">
                    {invite.role === 'student' ? 'Öğrenci' : 'Veli'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {invite.invitedEmail ?? 'E-postaya kilitli değil'}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                  {formatDate(invite.createdAt)}
                  {invite.createdByName && (
                    <span className="ml-1">· {invite.createdByName}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={STATUS_VARIANT[status]}>
                    {INVITE_STATUS_LABEL[status]}
                  </Badge>
                  <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {status === 'active'
                      ? inviteTimeLeftLabel(invite.expiresAt)
                      : status === 'accepted' && invite.acceptedAt
                        ? formatDate(invite.acceptedAt)
                        : ''}
                  </p>
                </td>
                <td className="px-3 py-2 text-right">
                  {/* Yalnız açık davet iptal edilebilir: kabul edilmiş bir
                      daveti iptal etmek kurulmuş bağlantıyı koparmaz, o iş
                      veli bağlantısını kaldırmaktır. */}
                  {status === 'active' && (
                    <RevokeButton studentId={studentId} invitationId={invite.id} />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RevokeButton({
  studentId,
  invitationId,
}: {
  studentId: string
  invitationId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      title="Daveti iptal et"
      aria-label="Daveti iptal et"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm('Bu davet iptal edilecek ve link çalışmayacak. Devam edilsin mi?')) {
          return
        }
        startTransition(async () => {
          const result = await revokeInviteAction(studentId, invitationId)
          if (result.error) toast.error(result.error)
          else {
            toast.success('Davet iptal edildi.')
            router.refresh()
          }
        })
      }}
      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
    </button>
  )
}
