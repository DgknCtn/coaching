import { Section } from '@/components/shared/section'
import { createClient } from '@/lib/supabase/server'
import { studentLoginConfigured } from '@/lib/student-login'
import { StudentLoginControls } from './student-login-controls'

// E-POSTASIZ GİRİŞ KARTI (10a).
//
// Öğrencinin e-posta ya da Google ile hesabı varsa (ve kodlu girişi
// yoksa) hiç çizilmez: iki giriş yolu karışmasın. Kodlu giriş varsa
// kullanıcı adı, durum ve PIN yenileme/kapatma burada.

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
  const { data, error } = await supabase.rpc('student_login_code_info', { p_student_id: studentId })
  // Migration uygulanmadıysa ya da okuma düştüyse kart gösterilmez; bu
  // bölüm isteğe bağlı bir giriş yolu, eksikliği başka bir şeyi yanıltmaz.
  if (error) return null
  const info = ((data ?? []) as { username: string; active: boolean; locked: boolean }[])[0] ?? null

  if (hasAccount && !info) return null

  return (
    <Section
      title="E-postasız giriş"
      description={
        hasEmail
          ? 'Öğrencinin e-postası var; davet linki de kullanılabilir. E-postasını kullanmıyorsa kullanıcı adı + PIN verin.'
          : 'Öğrencinin e-postası yok. Kullanıcı adı ve 6 haneli PIN oluşturup öğrenciye iletin; /giris/ogrenci adresinden girer.'
      }
    >
      <StudentLoginControls studentId={studentId} studentName={studentName} info={info} />
    </Section>
  )
}
