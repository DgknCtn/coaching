import Link from 'next/link'
import { ArrowRight, Users } from 'lucide-react'
import { AuthShell } from '@/components/shared/auth-shell'
import { GoogleSignInBlock } from '@/components/shared/google-button'
import { EmailLoginForm } from '@/components/auth/email-login-form'
import { TRIAL_DAYS } from '@/lib/plans'

// KOÇ GİRİŞİ.
//
// Önceden öğretmen, öğrenci ve veli bu tek formu kullanıyordu ve altında
// "X gün ücretsiz deneyin" bağlantısı vardı. Öğrenci o bağlantıdan
// /register'a gidip kendi koç alanını açıyordu. Öğrenci ve velinin ayrı
// bir kapısı var (/giris); burası ona en üstte, formdan önce yönlendirir.

export default function LoginPage() {
  return (
    <AuthShell
      title="Koç girişi"
      description="Çalışma alanınıza kaldığınız yerden devam edin."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Koç musunuz, hesabınız yok mu?{' '}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {TRIAL_DAYS} gün ücretsiz deneyin
          </Link>
        </p>
      }
    >
      {/* FORMDAN ÖNCE: öğrenci formu doldurmaya başlamadan doğru kapıyı
          görmeli. Altta olsaydı önce şifre denerdi. */}
      <Link
        href="/giris"
        className="mb-5 flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted"
      >
        <Users className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="flex-1">
          <span className="font-medium">Öğrenci ya da veli misin?</span>{' '}
          <span className="text-muted-foreground">Öğrenci/veli girişini kullan.</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>

      {/* GOOGLE FORMUN ÜSTÜNDE: en hızlı yol en görünür yerde olmalı. */}
      <GoogleSignInBlock />

      <EmailLoginForm autoFocus />
    </AuthShell>
  )
}
