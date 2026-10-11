import Link from 'next/link'
import { AuthShell } from '@/components/shared/auth-shell'
import { UnifiedLoginForm } from '@/components/auth/unified-login-form'
import { PinRequestForm } from '@/components/auth/pin-request-form'
import { studentLoginConfigured } from '@/lib/student-login'
import { TRIAL_DAYS } from '@/lib/plans'

// TEK GİRİŞ EKRANI — koç, öğrenci ve veli.
//
// Önceden koç /login'den, öğrenci ve veli /giris'ten giriyordu; her
// ekranda bir de Google düğmesi vardı. Kullanıcılar kapıları
// karıştırıyordu. Artık tek form: koç e-posta + şifre, öğrenci ve veli
// öğretmenin verdiği kullanıcı adı + PIN. /giris buraya yönlendirir.

export default function LoginPage() {
  const pinEnabled = studentLoginConfigured()

  return (
    <AuthShell
      title="Giriş"
      description={
        pinEnabled
          ? 'Koçlar e-posta ve şifreyle, öğrenci ve veliler öğretmenin verdiği kullanıcı adı ve PIN ile girer.'
          : 'E-posta adresin ve şifrenle gir.'
      }
      footer={
        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <p>
            Koç musun, hesabın yok mu?{' '}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {TRIAL_DAYS} gün ücretsiz dene
            </Link>
          </p>
          <p className="text-xs">
            Öğrenci ve veliler hesap açmaz; kullanıcı adını öğretmeninden alır.
          </p>
        </div>
      }
    >
      <UnifiedLoginForm />

      {pinEnabled && (
        <div className="mt-5 text-center">
          <PinRequestForm />
        </div>
      )}

      <p className="mt-6 rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        Daha önce Google ile giriyorsan: e-posta adresinle{' '}
        <Link href="/forgot-password" className="font-medium underline-offset-4 hover:underline">
          şifre belirle
        </Link>
        , sonra buradan gir.
      </p>
    </AuthShell>
  )
}
