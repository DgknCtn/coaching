import { Section } from '@/components/shared/section'
import { createClient } from '@/lib/supabase/server'
import { studentLoginConfigured } from '@/lib/student-login'
import { StudentLoginControls } from './student-login-controls'
import type { MemberLoginRow } from './student-login-actions'

// GİRİŞ BİLGİLERİ KARTI (10a · 138) — öğrenci ve velileri için
// kullanıcı adı + PIN.
//
// Öğrenci bloğu: öğrencinin e-posta ya da Google ile hesabı varsa (ve
// kodlu girişi yoksa) çizilmez; iki giriş yolu karışmasın.
// Veliler bloğu: bağlı veliler listelenir; e-postayla katılmış veliye PIN
// üretilmez, yalnız "e-postayla giriyor" yazar. Yeni veli için PIN her
// zaman oluşturulabilir.

export async function StudentLoginSection({
  studentId,
  studentName,
  hasAccount,
  hasEmail,
}: {
  studentId: string
  studentName: string
  hasAccount: boolean
  hasEmail: boolean
}) {
  // Yapılandırılmamışsa (STUDENT_LOGIN_EMAIL_DOMAIN / SECRET yok) kart
  // hiç çizilmez: işe yaramayan bir "PIN oluştur" düğmesi göstermektense
  // öğretmen e-postalı davet yolunu kullanır.
  if (!studentLoginConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('student_member_logins', { p_student_id: studentId })
  // Migration uygulanmadıysa ya da okuma düştüyse kart gösterilmez; bu
  // bölüm isteğe bağlı bir giriş yolu, eksikliği başka bir şeyi yanıltmaz.
  if (error) return null
  const rows = (data ?? []) as MemberLoginRow[]

  const studentRow = rows.find((r) => r.role === 'student') ?? null
  const showStudent = !(hasAccount && !studentRow?.has_code)
  const parents = rows.filter((r) => r.role === 'parent')

  return (
    <Section
      title="Giriş bilgileri"
      description={
        hasEmail
          ? 'E-postası olan davet linkiyle de katılabilir. E-posta kullanmayan öğrenci ya da veliye kullanıcı adı + PIN verin; /giris adresinden girerler.'
          : 'Kullanıcı adı ve 6 haneli PIN oluşturup öğrenciye ya da veliye iletin; /giris adresinden girerler.'
      }
    >
      <StudentLoginControls
        studentId={studentId}
        studentName={studentName}
        student={showStudent ? studentRow : undefined}
        parents={parents}
      />
    </Section>
  )
}
