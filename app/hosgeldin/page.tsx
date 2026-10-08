import { redirect } from 'next/navigation'
import Link from 'next/link'
import { GraduationCap, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/shared/auth-shell'
import { buttonVariants } from '@/components/ui/button'
import { listResult } from '@/lib/data-result'
import { SignOutLink } from '@/app/erisim/sign-out-link'
import { PendingInvitationList, type PendingInvitation } from './pending-invitations'

// HOŞ GELDİN — çalışma alanı olmayan, niyeti bilinmeyen kullanıcı.
//
// ============================================================
// NEDEN VAR
//
// Önceden alanı olmayan herkes otomatik öğretmen yapılıyordu. /login'den
// Google ile giren davetli öğrenci kendi öğretmen alanını açıyor, sonra
// davetini de kabul edemiyordu. Artık:
//
//   1. E-postasına kesilmiş bekleyen davet varsa listelenir; tek tıkla
//      kabul edilir (davet linkine gerek kalmaz).
//   2. Yoksa rol sorulur: öğretmen alanını kurar; öğrenci/veli ise
//      öğretmeninden link istemesi gerektiğini ve HANGİ e-postayla
//      girdiğini görür — yanlış hesapla girdiyse fark eder.
//   3. Öğrenci/veli girişinden (/giris) gelindiyse (`?giris=uye`) koç
//      kartı HİÇ gösterilmez (138); yalnız küçük bir "koç musun"
//      bağlantısı kalır. Kart gösterildiğinde de onay ekranına gider.
// ============================================================

export const dynamic = 'force-dynamic'

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ giris?: string }>
}) {
  const memberEntry = (await searchParams).giris === 'uye'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Alanı olan kullanıcının burada işi yok.
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_workspace_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (profile?.default_workspace_id) redirect('/')

  const invitations = listResult(
    await supabase.rpc('my_pending_invitations'),
    'hosgeldin.pending_invitations'
  )
  const pending = (invitations.ok ? invitations.data : []) as PendingInvitation[]

  return (
    <AuthShell
      title="Hoş geldin"
      description={
        pending.length > 0
          ? 'Seni bekleyen bir davet var.'
          : 'Devam etmek için nasıl kullanacağını seç.'
      }
      footer={<SignOutLink />}
    >
      <p className="mb-5 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Giriş yapılan hesap: <span className="font-medium text-foreground">{user.email}</span>
      </p>

      {pending.length > 0 && <PendingInvitationList invitations={pending} />}

      {/* Davet listesi okunamadıysa "davetin yok" DENMEZ (B01). */}
      {!invitations.ok && (
        <p className="mb-5 text-sm text-destructive">
          Bekleyen davetlerin şu an kontrol edilemedi. Sayfayı yenileyip tekrar dene.
        </p>
      )}

      <div className="grid gap-3">
        {!memberEntry && (
          <div className="rounded-lg border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="size-4 text-primary" /> Öğretmen / koçum
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Kendi çalışma alanını kur; öğrencilerini ve velilerini davet et.
            </p>
            {/* Onay ekranına gider; kurulum orada, açık bir tıklamayla. */}
            <Link
              href="/kurulum/ogretmen"
              prefetch={false}
              className={buttonVariants({ variant: 'outline', className: 'mt-3 w-full' })}
            >
              Koç olarak devam et
            </Link>
          </div>
        )}

        <div className="rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-primary" /> Öğrenci ya da veliyim
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Öğretmeninden davet linki iste. Linki açıp bu hesapla kabul edebilirsin.
            {pending.length === 0 &&
              ' Öğretmenin davetini farklı bir e-postaya gönderdiyse o hesapla gir.'}{' '}
            E-postan yoksa öğretmeninden kullanıcı adı + PIN iste.
          </p>
        </div>
      </div>

      {memberEntry && (
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Koç musun?{' '}
          <Link
            href="/kurulum/ogretmen"
            prefetch={false}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Kendi çalışma alanını kur
          </Link>
        </p>
      )}
    </AuthShell>
  )
}
