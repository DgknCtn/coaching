import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/shared/auth-shell'
import { buttonVariants } from '@/components/ui/button'
import { BLOCKED_MESSAGE, type BlockedReason } from '@/lib/plans'
import { contactMailto } from '@/lib/brand'

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
  if (rows.length === 0 || rows.some(r => !r.blocked_reason)) redirect('/')

  const row = rows[0]
  const reason = row.blocked_reason as BlockedReason
  const message = BLOCKED_MESSAGE[reason] ?? BLOCKED_MESSAGE.suspended
  const isTeacher = row.role === 'owner' || row.role === 'teacher'

  return (
    <AuthShell
      title={message.title}
      description={row.workspace_name}
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Farklı bir hesapla{' '}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            giriş yapabilirsiniz
          </Link>
        </p>
      }
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
