-- ============================================================
-- 131 — E-POSTA KAYDI VE BİLDİRİM TERCİHİ (SaaS planı A2)
--
-- Uygulama bugüne kadar kendi e-postasını hiç göndermiyordu: deneme
-- bitişi, lisans bitişi, ödeme makbuzu, destek yanıtı — hiçbiri
-- bildirilmiyordu. lib/email.ts (Resend) gönderimi yapar; bu tablo her
-- iletinin izini tutar ve AYNI hatırlatmanın iki kez gitmesini önler.
--
-- TEKİLLİK: dedupe_key yalnız 'pending' ve 'sent' satırlarda tekil
-- (kısmi indeks). Gönderim başarısızsa satır 'failed' olur ve anahtar
-- serbest kalır — ertesi çalışmada yeniden denenir. Anahtarın içinde
-- bitiş tarihi var: deneme uzatılırsa hatırlatma yeni tarih için yine gider.
--
-- KİŞİSEL VERİ: alıcı adresi tutuluyor (destekte "e-posta geldi mi"
-- sorusunun cevabı). İleti gövdesi TUTULMUYOR. 180 günden eski satırlar
-- hatırlatma cron'u tarafından siliniyor (app/api/cron/hatirlatmalar).
--
-- ERİŞİM: yalnız service_role (cron ve sunucu). RLS açık, politika yok.
--
-- BİLDİRİM TERCİHİ: profiles.email_notifications. Hizmet iletileri
-- (hatırlatma, ipucu) kapatılabilir; ödeme makbuzu ve güvenlik iletileri
-- (şifre sıfırlama — Supabase Auth) bu tercihten etkilenmez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL,
  dedupe_key   TEXT NOT NULL,
  recipient    TEXT NOT NULL,
  profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  provider_id  TEXT,
  error        TEXT CHECK (error IS NULL OR length(error) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_log_dedupe_live
  ON public.email_log (dedupe_key)
  WHERE status IN ('pending', 'sent');

CREATE INDEX IF NOT EXISTS idx_email_log_created ON public.email_log (created_at);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_log FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.email_notifications IS
  'Hizmet iletileri (hatırlatma, ipucu). Makbuz ve güvenlik iletileri etkilenmez. Kullanıcı kendi satırında değiştirir (profiles_update_own).';


DO $dogrula$
BEGIN
  IF has_table_privilege('authenticated', 'public.email_log', 'SELECT')
     OR has_table_privilege('anon', 'public.email_log', 'SELECT')
     OR has_table_privilege('authenticated', 'public.email_log', 'INSERT') THEN
    RAISE EXCEPTION '131 DOĞRULAMA: email_log istemciye açık.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_email_log_dedupe_live'
  ) THEN
    RAISE EXCEPTION '131 DOĞRULAMA: tekillik indeksi yok.';
  END IF;
  RAISE NOTICE '131: email_log hazır (yalnız service_role), profiles.email_notifications eklendi.';
END;
$dogrula$;

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.email_log;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS email_notifications;
