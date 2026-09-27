import { hashToken } from '@/lib/invite'
import { createClient } from '@/lib/supabase/server'
import { InviteForm } from './invite-form'
import { AlertCircle, GraduationCap } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { buttonVariants } from '@/components/ui/button'
import { GoogleSignInBlock } from '@/components/shared/google-button'
import { maskEmail } from '@/lib/invite-accept'
import { SwitchAccountButton } from './switch-account-button'

// ?hata= kodları /invite/[token]/kabul'den gelir.
const ACCEPT_ERRORS: Record<string, string> = {
  sure: 'Bu davetin süresi dolmuş. Öğretmeninden yeni bir link iste.',
  gecersiz: 'Bu davet geçersiz ya da zaten kullanılmış.',
}

export const dynamic = 'force-dynamic'

const roleLabels: Record<string, string> = {
  student: 'Öğrenci',
  parent: 'Veli',
  teacher: 'Öğretmen',
}

function InviteNotice({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-center">
        <AlertCircle className="mx-auto size-5 text-muted-foreground" />
        <h2 className="mt-3 text-sm font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ hata?: string }>
}) {
  const { token } = await params
  const { hata } = await searchParams
  const tokenHash = await hashToken(token)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: rows, error } = await supabase
    .rpc('get_invitation_by_token', { p_token_hash: tokenHash })

  const invitation = rows?.[0] ?? null

  if (!invitation || error) {
    return (
      <InviteNotice
        title="Davet bulunamadı"
        description="Link geçersiz veya daha önce kullanılmış."
      />
    )
  }

  if (invitation.status !== 'pending') {
    const labels: Record<string, string> = {
      accepted: 'Bu davet zaten kullanıldı.',
      expired: 'Bu davetin süresi dolmuş.',
      revoked: 'Bu davet iptal edilmiş.',
    }
    return (
      <InviteNotice
        title={labels[invitation.status] ?? 'Geçersiz davet'}
        description="Öğretmenden yeni bir davet linki isteyin."
      />
    )
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return (
      <InviteNotice
        title="Davetin süresi dolmuş"
        description="Öğretmenden yeni bir davet linki isteyin."
      />
    )
  }

  const roleLabel = roleLabels[invitation.role] ?? invitation.role

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-muted">
            <GraduationCap className="size-4 text-muted-foreground" />
          </div>
          <span className="text-sm font-semibold">{BRAND.name}</span>
        </div>

        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">Daveti kabul et</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invitation.student_full_name ? (
              <>
                <span className="font-medium text-foreground">
                  {invitation.student_full_name}
                </span>{' '}
                için{' '}
                <span className="font-medium text-foreground">{roleLabel}</span> olarak davet
                edildiniz.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{roleLabel}</span> olarak davet
                edildiniz.
              </>
            )}
          </p>
        </div>

        {/* YANLIŞ HESAP: davet başka bir adrese kesilmiş. İki adres de
            maskeli gösterilir; kullanıcı neden olmadığını anlar ve doğru
            hesaba geçebilir. */}
        {hata === 'eposta' && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-destructive-border bg-destructive-subtle px-3 py-2.5 text-sm text-destructive-foreground"
          >
            Bu davet <strong>{maskEmail(invitation.invited_email)}</strong> adresine gönderildi;
            sen <strong>{maskEmail(user?.email)}</strong> ile girdin. Davetin gönderildiği
            hesapla gir.
          </div>
        )}
        {hata && ACCEPT_ERRORS[hata] && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-destructive-border bg-destructive-subtle px-3 py-2.5 text-sm text-destructive-foreground"
          >
            {ACCEPT_ERRORS[hata]}
          </div>
        )}

        {user ? (
          // OTURUM AÇIK: form doldurtulmaz. İkinci çocuğunun davetini açan
          // veli ya da Google'la girmiş öğrenci tek tıkla kabul eder.
          <div className="space-y-3">
            {/* Route Handler: prefetch daveti kabul etmesin diye düz <a>. */}
            <a
              href={`/invite/${token}/kabul`}
              className={buttonVariants({ size: 'lg', className: 'w-full' })}
            >
              {user.email} olarak kabul et
            </a>
            <SwitchAccountButton returnTo={`/invite/${token}`} />
          </div>
        ) : (
          <>
            <GoogleSignInBlock
              label="Google ile kabul et"
              next={`/invite/${token}/kabul`}
            />
            <InviteForm token={token} defaultEmail={invitation.invited_email ?? ''} />
          </>
        )}
      </div>
    </div>
  )
}
