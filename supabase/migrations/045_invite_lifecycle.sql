-- ============================================================
-- 045_invite_lifecycle
--
-- Davet sisteminin üç boşluğunu kapatır. İkisi güvenlik, biri veri
-- bütünlüğü.
--
-- 1) get_invitation_by_token PII SIZDIRIYORDU.
--
--    007'deki gövde filtresizdi: kullanılmış ya da süresi dolmuş bir link
--    bile öğrencinin TAM ADINI ve davetli e-postasını anonim çağırana
--    döndürüyordu.
--
--    024 bunu bilinçli olarak düzeltmedi ve gerekçesini yazdı: ekran dönen
--    `status` alanına bakıp "zaten kullanıldı" / "süresi doldu" mesajlarını
--    ayırt ediyor, filtre eklemek hepsini "Davet bulunamadı"ya çevirirdi.
--
--    Bu itiraz KARŞILANIYOR, göz ardı edilmiyor: `status`, `role` ve
--    `expires_at` HER ZAMAN döner — ekranın mesaj ayrımı bozulmaz. Yalnız
--    kimlik alanları (student_full_name, invited_email, student_id)
--    davet GERÇEKTEN kullanılabilir durumdayken dolu gelir. Ölü bir link
--    artık kimin daveti olduğunu söylemez.
--
-- 2) TEK AKTİF DAVET.
--
--    Tabloda (student_id, role) üzerinde kısıt yoktu; her "Davet Linki
--    Oluştur" tıklaması yeni bir pending satır üretiyor ve hepsi bağımsız
--    olarak geçerli kalıyordu. Yanlış kişiye giden bir linki, yenisini
--    üreterek geçersiz kılmak mümkün değildi.
--
--    Uygulama katmanı artık yeni davet açmadan önce eskisini 'revoked'
--    yapıyor (invite-actions.ts); buradaki partial unique index bunun
--    veritabanı düzeyindeki garantisi.
--
--    VERİ TEMİZLİĞİ: index'ten önce mevcut çoklu pending kayıtlar
--    temizlenir — her (student_id, role) çifti için EN YENİSİ kalır,
--    öncekiler 'revoked' olur. Kaybolan bir şey yok: o linkler zaten
--    kullanılmamış davetlerdi ve öğretmen yenisini üretebilir.
--
-- 3) 'revoked' STATÜSÜ ARTIK YAZILABİLİR.
--
--    Statü 001'den beri CHECK içinde ve /invite/[token] sayfasında mesajı
--    hazırdı, ama bu değeri yazan tek satır kod yoktu. Yazma işini
--    uygulama yapar (RLS zaten öğretmene UPDATE veriyor); burada yalnız
--    veri temizliği onu kullanır.
--
-- DEĞİŞMEYEN: accept_invitation'a dokunulmadı. Token üretimi, hash'i ve
-- 024'teki auth.uid()/e-posta kontrolleri aynen duruyor.
-- ============================================================

-- ------------------------------------------------------------
-- 1) get_invitation_by_token — kimlik alanları koşullu
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token_hash TEXT)
RETURNS TABLE (
  id                uuid,
  role              text,
  status            text,
  expires_at        timestamptz,
  invited_email     text,
  student_id        uuid,
  student_full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.role::text,
    i.status::text,
    i.expires_at,
    -- Kimlik alanları yalnız KULLANILABİLİR davette. Ekranın mesaj ayrımı
    -- status/expires_at üzerinden yürüdüğü için bozulmaz.
    CASE WHEN i.status = 'pending' AND i.expires_at > NOW()
         THEN i.invited_email END,
    CASE WHEN i.status = 'pending' AND i.expires_at > NOW()
         THEN i.student_id END,
    CASE WHEN i.status = 'pending' AND i.expires_at > NOW()
         THEN s.full_name END
  FROM public.invitations i
  LEFT JOIN public.students s ON s.id = i.student_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text)
  TO anon, authenticated;

-- ------------------------------------------------------------
-- 2) Mevcut çoklu pending davetleri temizle (index öncesi zorunlu)
-- ------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, role
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.invitations
  WHERE status = 'pending'
    AND student_id IS NOT NULL
)
UPDATE public.invitations i
SET status = 'revoked', updated_at = NOW()
FROM ranked r
WHERE i.id = r.id AND r.rn > 1;

-- ------------------------------------------------------------
-- 3) Tek aktif davet güvencesi
--
-- Yalnız öğrenciye bağlı davetleri kapsar: student_id NULL olan davet
-- türleri (ör. doğrudan öğretmen daveti) bu kuralın dışındadır.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invitation_pending_per_student_role
  ON public.invitations (student_id, role)
  WHERE status = 'pending' AND student_id IS NOT NULL;

-- ============================================================
-- ROLLBACK
--
--   DROP INDEX IF EXISTS public.uniq_invitation_pending_per_student_role;
--
--   -- get_invitation_by_token: 007_fix_invite_permissions.sql'deki
--   -- filtresiz gövdeyi geri yükler (PII sızıntısı geri gelir).
--
-- Geri alma, temizlikte 'revoked' yapılmış davetleri GERİ GETİRMEZ; o
-- linkler kalıcı olarak ölüdür. Öğretmen yeni davet üretebilir.
-- ============================================================
