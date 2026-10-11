import { Section } from '@/components/shared/section'
import { createClient } from '@/lib/supabase/server'
import { studentLoginConfigured } from '@/lib/student-login'
import { StudentLoginControls } from './student-login-controls'
import type { MemberLoginRow } from './student-login-actions'

// GİRİŞ BİLGİLERİ KARTI (10a · 138 · 143) — öğrenci ve velileri için
// kullanıcı adı + PIN. Öğretmenin öğrenciyi ve veliyi "davet etmesi"
// budur: kullanıcı adı + PIN üretir, kişiye iletir.
//
// E-posta ya da Google ile katılmış hesap da listelenir; öğretmen tek
// düğmeyle onu kullanıcı adı + PIN'e çevirebilir (Google girişi kalktı).
// "PIN'imi unuttum" isteği olan satırda rozet görünür.

export async function StudentLoginSection({
  studentId,
  studentName,
}: {
  studentId: string
  studentName: string
}) {
  // Yapılandırılmamışsa (STUDENT_LOGIN_EMAIL_DOMAIN / SECRET yok) kart
  // hiç çizilmez: işe yaramayan bir "PIN oluştur" düğmesi göstermektense
  // öğretmen e-postalı davet yolunu kullanır.
  if (!studentLoginConfigured()) return null

  const supabase = await createClient()
  const [logins, requests] = await Promise.all([
    supabase.rpc('student_member_logins', { p_student_id: studentId }),
    supabase.rpc('pending_pin_reset_requests'),
  ])
  // Migration uygulanmadıysa ya da okuma düştüyse kart gösterilmez; bu
  // bölüm isteğe bağlı bir giriş yolu, eksikliği başka bir şeyi yanıltmaz.
  if (logins.error) return null
  const rows = (logins.data ?? []) as MemberLoginRow[]
  // İstek listesi düşerse rozetler yok sayılır; kart yine çizilir.
  const requested = ((requests.data ?? []) as { profile_id: string }[]).map((r) => r.profile_id)

  return (
    <Section
      title="Giriş bilgileri"
      description="Öğrenciye ve veliye kullanıcı adı + 6 haneli PIN verin; giriş ekranından (/login) girerler. PIN'ini unutan size giriş ekranından istek gönderir."
    >
      <StudentLoginControls
        studentId={studentId}
        studentName={studentName}
        student={rows.find((r) => r.role === 'student') ?? null}
        parents={rows.filter((r) => r.role === 'parent')}
        requested={requested}
      />
    </Section>
  )
}
