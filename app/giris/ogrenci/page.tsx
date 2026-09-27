import Link from 'next/link'
import { AuthShell } from '@/components/shared/auth-shell'
import { studentLoginConfigured } from '@/lib/student-login'
import { StudentCodeLoginForm } from './login-form'

// Kullanıcı adı + PIN girişi (10a). Sunucu yapılandırması yoksa (ör. alan
// adı henüz alınmadı) form yerine açıklama gösterilir; yarım bir form
// öğrenciyi boşuna PIN denemeye iterdi.
export default function StudentCodeLoginPage() {
  if (!studentLoginConfigured()) {
    return (
      <AuthShell
        title="Öğrenci girişi"
        description="Kullanıcı adı ve PIN ile giriş henüz açık değil."
        footer={
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              E-posta ya da Google ile gir
            </Link>
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          Öğretmeninden davet linki iste; linki açıp e-postanla ya da Google hesabınla katılabilirsin.
        </p>
      </AuthShell>
    )
  }
  return <StudentCodeLoginForm />
}
