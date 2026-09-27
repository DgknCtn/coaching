'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { dbErrorToTr } from '@/lib/auth-errors'
import { firstIssue, uuidSchema } from '@/lib/validation'
import { generateToken, hashToken } from '@/lib/invite'
import { INVITE_TTL_MS } from '@/lib/invite-status'
import { logAudit } from '@/lib/audit'

/**
 * Veli daveti için isteğe bağlı e-posta.
 *
 * Zorunlu DEĞİL: öğretmen çoğu zaman velinin e-postasını bilmiyor. Girilirse
 * davet o adrese kilitlenir (accept_invitation, 024) ve linki başkası
 * kullanamaz. Girilmezse davet açık kalır — bu durumda tek koruma kısa
 * penceredir (aşağıya bakın).
 */
const inviteSchema = z.object({
  studentId: uuidSchema,
  role: z.enum(['student', 'parent']),
  email: z
    .string()
    .trim()
    .email('Geçerli bir e-posta girin.')
    .optional()
    .or(z.literal('')),
})

export async function createInviteAction(
  studentId: string,
  role: 'student' | 'parent',
  email?: string
) {
  const parsed = inviteSchema.safeParse({ studentId, role, email })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId, profile } = await getTeacherContext()
  const supabase = await createClient()

  // İsteğin geldiği host'u kullan — env var'a bağımlı değil, her ortamda doğru çalışır
  const headersList = await headers()
  const host = headersList.get('host') ?? 'localhost:3000'
  const proto = headersList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const appUrl = `${proto}://${host}`

  const { data: student } = await supabase
    .from('students')
    .select('id, email')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student) return { error: 'Öğrenci bulunamadı' }

  const invitedEmail =
    role === 'student' ? student.email : (parsed.data.email?.trim() || null)

  // E-POSTASIZ ÖĞRENCİYE LİNK KESİLMEZ (10a): bağsız bir öğrenci linki,
  // linki eline geçiren herkesin o öğrenci olarak katılması demekti.
  if (role === 'student' && !invitedEmail) {
    return {
      error:
        'Öğrencinin e-postası yok. Davet için öğrenci bilgilerine e-posta ekleyin (kullanıcı adı + PIN girişi açıksa onu da kullanabilirsiniz).',
    }
  }

  // ============================================================
  // Yeni davet, AYNI KİŞİYE giden eskisini ÖLDÜRÜR.
  //
  // Önceden her tıklama bağımsız geçerli bir link daha üretiyordu ve
  // yanlış kişiye giden bir linki geçersiz kılmanın yolu yoktu; "yeniden
  // gönder" eski linki öldürerek çalışıyor.
  //
  // KAPSAM 116'DA DARALDI:
  //   - öğrenci daveti : öğrencinin bekleyen öğrenci daveti iptal edilir.
  //   - veli daveti    : YALNIZ aynı e-postaya kesilmiş bekleyen veli
  //                      daveti. Önceden anneye link verilince babanınki
  //                      de ölüyordu. E-postasız veli davetleri birbirini
  //                      iptal etmez (hangisinin kime gittiği bilinmez).
  // Veritabanındaki tekillik index'leri (116) aynı kuralı zorunlu kılıyor.
  // ============================================================
  let revokeIds: string[] | null = null
  if (role === 'parent') {
    if (invitedEmail) {
      const { data: pendingParents, error: listError } = await supabase
        .from('invitations')
        .select('id, invited_email')
        .eq('workspace_id', workspaceId)
        .eq('student_id', studentId)
        .eq('role', 'parent')
        .eq('status', 'pending')
      if (listError) return { error: dbErrorToTr(listError.message) }
      // Karşılaştırma burada: `ilike` e-postadaki '_' karakterini joker
      // sayardı ve başka bir velinin davetini de iptal edebilirdi.
      revokeIds = (pendingParents ?? [])
        .filter((i) => (i.invited_email as string | null)?.toLowerCase() === invitedEmail.toLowerCase())
        .map((i) => i.id as string)
    } else {
      revokeIds = []
    }
  }

  const revokeQuery = supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('workspace_id', workspaceId)
    .eq('student_id', studentId)
    .eq('role', role)
    .eq('status', 'pending')
  const { error: revokeError } =
    revokeIds === null
      ? await revokeQuery
      : revokeIds.length > 0
        ? await revokeQuery.in('id', revokeIds)
        : { error: null }

  if (revokeError) return { error: dbErrorToTr(revokeError.message) }

  const token = generateToken()
  const tokenHash = await hashToken(token)
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS[role]).toISOString()

  const { error } = await supabase.from('invitations').insert({
    workspace_id: workspaceId,
    invited_email: invitedEmail,
    role,
    student_id: studentId,
    parent_student_link_id: null,
    token_hash: tokenHash,
    expires_at: expiresAt,
    status: 'pending',
    // Bekleyen davetler listesinde "kim gönderdi" için. Kolon 001'den beri
    // vardı ama hiç doldurulmuyordu.
    created_by_profile_id: profile.id,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  // Davet, başka bir kişiye öğrenci verisine erişim veren bir eylem;
  // kimin ne zaman verdiği kayda geçmeli.
  await logAudit(supabase, {
    workspaceId,
    action: 'invite.create',
    entityType: 'student',
    entityId: studentId,
    detail: { role, bound: !!invitedEmail, expiresAt },
  })

  revalidatePath(`/teacher/students/${studentId}`)
  return { link: `${appUrl}/invite/${token}`, expiresAt, bound: !!invitedEmail }
}

/**
 * Daveti iptal eder.
 *
 * 'revoked' statüsü 001'den beri CHECK içindeydi ve /invite/[token] sayfası
 * mesajını gösterecek şekilde yazılmıştı, ama bu değeri yazan hiçbir kod
 * yoktu — yanlış kişiye giden link süresi dolana kadar açık kalıyordu.
 *
 * Yalnız 'pending' davet iptal edilir: kabul edilmiş bir daveti iptal etmek
 * kurulmuş bağlantıyı koparmaz, o iş veli bağlantısını kaldırmaktır.
 */
export async function revokeInviteAction(studentId: string, invitationId: string) {
  const parsed = z
    .object({ studentId: uuidSchema, invitationId: uuidSchema })
    .safeParse({ studentId, invitationId })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', parsed.data.invitationId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'invite.revoke',
    entityType: 'invitation',
    entityId: parsed.data.invitationId,
  })

  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}
