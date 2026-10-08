import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, GraduationCap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/shared/auth-shell'
import { buttonVariants } from '@/components/ui/button'
import { SignOutLink } from '@/app/erisim/sign-out-link'
import { SetupTeacherButton } from './setup-button'

// KOÇ ALANI KURULUM ONAYI (138).
//
// Buraya üç yoldan gelinir: kayıt sayfasındaki Google düğmesi, e-posta
// doğrulamasından dönen öğretmen (app/page.tsx) ve /hosgeldin'deki koç
// kartı. Hiçbiri artık kendiliğinden alan kurmuyor: öğrenci kayıt
// ekranını kendi girişi sanıp Google'a bastığında koç oluyordu.

export const dynamic = 'force-dynamic'

export default async function TeacherSetupPage() {
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

  return (
    <AuthShell
      title="Koç çalışma alanını kur"
      description="Son bir adım: hesabın koç olarak açılacak."
      footer={<SignOutLink />}
    >
      <p className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Giriş yapılan hesap: <span className="font-medium text-foreground">{user.email}</span>
      </p>

      <div className="mb-5 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2.5 text-sm text-warning-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Kendi çalışma alanını açıp öğrencilerini ve velilerini davet edeceksin.{' '}
          <span className="font-medium">Öğrenci ya da veliysen bunu yapma</span>; öğretmeninden
          davet linki ya da kullanıcı adı + PIN iste.
        </p>
      </div>

      <div className="grid gap-3">
        <SetupTeacherButton />
        <Link
          href="/hosgeldin?giris=uye"
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          <GraduationCap className="size-4" aria-hidden /> Öğrenci ya da veliyim
        </Link>
      </div>
    </AuthShell>
  )
}
