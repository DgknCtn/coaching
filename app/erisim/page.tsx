import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/shared/auth-shell'
import { buttonVariants } from '@/components/ui/button'
import { BLOCKED_MESSAGE, type BlockedReason } from '@/lib/plans'
import { contactMailto } from '@/lib/brand'
import { SignOutLink } from './sign-out-link'

// ERİŞİM ENGELLENDİ ekranı (Faz 4).
//
// NEDEN AYRI BİR SAYFA: askıya alınan ya da denemesi dolan bir çalışma
// alanı, RLS gereği kendi üyelerine bile GÖRÜNMEZ olur
// (workspaces_select_member → is_workspace_member, 051/052). Bu sayfa
// olmasaydı kullanıcı hiçbir açıklama görmeden /login'e düşer ve ne
// olduğunu anlamazdı — üstelik giriş bilgileri doğru olduğu için tekrar
// tekrar denerdi.
//
// Durum bilgisi RLS'i atlayan bir RPC'den gelir (get_workspace_access_state):
// fonksiyon yalnız ÇAĞIRANIN KENDİ üyeliklerine bakar ve kiracı verisi
// döndürmez — yalnız durum, plan ve tarih.
//
// DİL ROLE GÖRE DEĞİŞİR. Deneme süresinin dolması öğrenciyi ve veliyi de
// kilitliyor, oysa ödemeyle ilgileri yok; onlara "plan seçin" demek hem
// anlamsız hem kırıcı olurdu.

export const dynamic = 'force-dynamic'

interface AccessRow {
  workspace_id: string
  workspace_name: string
  role: string
  status: string
  plan: string
  trial_ends_at: string | null
  blocked_reason: string | null
}

export default async function AccessBlockedPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data } = await supabase.rpc('get_workspace_access_state')
  const rows = (data ?? []) as AccessRow[]

  // Engellenmemiş bir çalışma alanı varsa kullanıcının burada işi yok.
  if (rows.some(r => !r.blocked_reason)) redirect('/')

  // HİÇ ÜYELİK YOK — bu dal 068'e kadar `/`'a geri yönlendiriyordu ve
  // yönlendirme döngüsünün ikinci yarısıydı (rapor bulgusu 3): app/page.tsx
  // profil/üyelik bulamayınca buraya, burası da geri oraya gönderiyordu.
  //
  // Artık kullanıcı burada duruyor ve ne olduğunu okuyor. Çıkış düğmesi
  // ŞART: hesabı kurulamamış bir kullanıcının elindeki tek çıkış yolu o —
  // aksi halde tarayıcısını temizlemekten başka seçeneği kalmıyor.
  if (rows.length === 0) {
    return (
      <AuthShell
        title="Çalışma alanınız hazır değil"
        description={user.email ?? ""}
        footer={<SignOutLink />}
      >
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Hesabınız açıldı ama bir çalışma alanına bağlı değil. Bu genellikle
            kurulumun yarıda kalmasından ya da bir davetin henüz kabul
            edilmemiş olmasından kaynaklanır.
          </p>
          <p className="text-sm text-muted-foreground">
            Sizi davet eden öğretmenin bağlantısını yeniden açmayı deneyin. Kendi
            çalışma alanınızı kurmak istiyorsanız bizimle iletişime geçin.
          </p>
          <a
            href={contactMailto('Çalışma alanı kurulamadı')}
            className={buttonVariants({ className: 'w-full' })}
          >
            Bizimle iletişime geçin
          </a>
          <p className="text-xs text-muted-foreground">
            Hiçbir veriniz silinmedi.
          </p>
        </div>
      </AuthShell>
    )
  }

  const row = rows[0]
  const reason = row.blocked_reason as BlockedReason
  const message = BLOCKED_MESSAGE[reason] ?? BLOCKED_MESSAGE.suspended
  const isTeacher = row.role === 'owner' || row.role === 'teacher'

  return (
    <AuthShell
      title={message.title}
      description={row.workspace_name}
      footer={<SignOutLink />}
    >
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          {isTeacher ? message.teacher : message.other}
        </p>

        {/* İletişim yolu yalnız öğretmene gösterilir: öğrenciyi ve veliyi
            faturalama konuşmasına dahil etmek yanlış olur. */}
        {isTeacher && (
          <a
            href={contactMailto('Çalışma alanı erişimi')}
            className={buttonVariants({ className: 'w-full' })}
          >
            Bizimle iletişime geçin
          </a>
        )}

        <p className="text-xs text-muted-foreground">
          Hiçbir veriniz silinmedi. Erişim yeniden açıldığında her şey
          bıraktığınız yerde olacak.
        </p>
      </div>
    </AuthShell>
  )
}
