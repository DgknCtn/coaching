import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/shared/auth-shell'
import { GoogleSignInBlock } from '@/components/shared/google-button'
import { EmailLoginForm } from '@/components/auth/email-login-form'
import { studentLoginConfigured } from '@/lib/student-login'
import { MemberCodeLoginForm } from './login-form'

// ÖĞRENCİ VE VELİ GİRİŞİ.
//
// ============================================================
// NEDEN AYRI BİR KAPI
//
// Tek giriş ekranında öğrenci "hesabım yok" deyip kayıt bağlantısına
// tıklıyor ve kendi koç alanını açıyordu. Bu ekranda KAYIT BAĞLANTISI
// YOK ve buradan giren, alanı olmayan kullanıcı /hosgeldin'de koç
// kartını görmez (`?giris=uye`). Öğrenci/veli olmak bir davetin ya da
// öğretmenin verdiği PIN'in sonucudur, hesap açmanın değil.
// ============================================================

export const metadata: Metadata = {
  title: 'Öğrenci ve Veli Girişi',
  description: 'Öğretmeninin verdiği kullanıcı adı ve PIN ya da davet e-postanla giriş yap.',
  alternates: { canonical: '/giris' },
}

// Alanı olmayan davetliyi bekleyen davetlerine götürür; koç kartı gizli.
const MEMBER_NEXT = '/hosgeldin?giris=uye'

export default function MemberLoginPage() {
  const pinEnabled = studentLoginConfigured()

  return (
    <AuthShell
      title="Öğrenci ve veli girişi"
      description={
        pinEnabled
          ? 'Öğretmeninin verdiği kullanıcı adı ve 6 haneli PIN ile gir.'
          : 'Öğretmeninin davet ettiği e-postayla ya da Google hesabınla gir.'
      }
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Koç musun?{' '}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Koç girişi
          </Link>
        </p>
      }
    >
      {pinEnabled && (
        <>
          <MemberCodeLoginForm />
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-xs text-muted-foreground">
                ya da davet e-postanla
              </span>
            </div>
          </div>
        </>
      )}

      <GoogleSignInBlock next={MEMBER_NEXT} />
      <EmailLoginForm next={MEMBER_NEXT} autoFocus={!pinEnabled} />

      <p className="mt-6 rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        Burada hesap açılmaz. Öğretmeninden davet linki ya da kullanıcı adı + PIN iste; davet
        linkini açtığında hesabın öğretmeninin alanına bağlanır.
      </p>
    </AuthShell>
  )
}
