import { hashToken } from '@/lib/invite'
import { createClient } from '@/lib/supabase/server'
import { InviteForm } from './invite-form'
import { AlertCircle, GraduationCap } from 'lucide-react'

export const dynamic = 'force-dynamic'

const roleLabels: Record<string, string> = {
  student: 'Öğrenci',
  parent: 'Veli',
  teacher: 'Öğretmen',
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const tokenHash = await hashToken(token)
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .rpc('get_invitation_by_token', { p_token_hash: tokenHash })

  const invitation = rows?.[0] ?? null

  if (!invitation || error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 auth-hero">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="size-6 text-red-500" />
          </div>
          <h2 className="font-bold text-lg mb-1">Davet bulunamadı</h2>
          <p className="text-sm text-gray-500">Link geçersiz veya daha önce kullanılmış.</p>
        </div>
      </div>
    )
  }

  if (invitation.status !== 'pending') {
    const labels: Record<string, string> = {
      accepted: 'Bu davet zaten kullanıldı.',
      expired: 'Bu davetin süresi dolmuş.',
      revoked: 'Bu davet iptal edilmiş.',
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-4 auth-hero">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="size-6 text-red-500" />
          </div>
          <h2 className="font-bold text-lg mb-1">{labels[invitation.status] ?? 'Geçersiz davet'}</h2>
          <p className="text-sm text-gray-500">Öğretmenden yeni bir davet linki isteyin.</p>
        </div>
      </div>
    )
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 auth-hero">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="size-6 text-amber-500" />
          </div>
          <h2 className="font-bold text-lg mb-1">Davetin süresi dolmuş</h2>
          <p className="text-sm text-gray-500">Öğretmenden yeni bir davet linki isteyin.</p>
        </div>
      </div>
    )
  }

  const roleLabel = roleLabels[invitation.role] ?? invitation.role

  return (
    <div className="min-h-screen flex items-center justify-center p-4 auth-hero">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden w-full max-w-sm">
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <GraduationCap className="size-5 text-primary" />
            </div>
            <span className="font-bold text-base tracking-tight">Koçluk Takip</span>
          </div>
          <h1 className="font-bold text-xl mb-1">Daveti kabul et</h1>
          <p className="text-sm text-gray-500">
            {invitation.student_full_name ? (
              <>
                <span className="font-medium text-gray-800">{invitation.student_full_name}</span> için{' '}
                <span className="font-medium text-gray-800">{roleLabel}</span> olarak davet edildiniz.
              </>
            ) : (
              <><span className="font-medium text-gray-800">{roleLabel}</span> olarak davet edildiniz.</>
            )}
          </p>
        </div>
        <div className="px-8 py-6">
          <InviteForm token={token} defaultEmail={invitation.invited_email ?? ''} />
        </div>
      </div>
    </div>
  )
}
