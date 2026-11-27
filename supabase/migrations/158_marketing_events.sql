-- ============================================================
-- 158 — Pazarlama olayları (Feature Showcase PRD §14)
--
-- /ozellikler ve anasayfa önizlemesinin ölçümü. Vercel Hobby planında
-- özel olay yok; olaylar burada, anonim ve kısa ömürlü tutulur.
--
-- KİŞİSEL VERİ YOK: kullanıcı kimliği, IP, çerez kimliği, e-posta ya da
-- serbest metin YAZILMAZ. Alanlar beyaz listeli kısa tanımlayıcılardır
-- (lib/marketing/events.ts ile aynı liste). Saklama 180 gün; temizlik
-- günlük işte (app/api/cron/hatirlatmalar).
--
-- YAZMA YOLU: yalnız oturumsuz sunucu ucu app/api/m/route.ts, servis
-- istemcisiyle (lib/supabase/service.ts'teki "oturumsuz sunucu ucu"
-- istisnası). Tabloda RLS AÇIK ve HİÇ politika yok: anon ya da oturum
-- açmış kullanıcı doğrudan okuyamaz, yazamaz.
--
-- OKUMA: yalnız platform yöneticisi, admin_marketing_summary üzerinden.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.marketing_events (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event       TEXT NOT NULL CHECK (event IN (
                'features_page_view',
                'feature_category_view',
                'feature_detail_view',
                'feature_screenshot_click',
                'feature_demo_click',
                'feature_trial_click',
                'feature_pricing_view',
                'feature_faq_open',
                'feature_cta_click',
                'homepage_feature_preview_view',
                'homepage_features_cta_click',
                'trial_started_from_features'
              )),
  feature     TEXT CHECK (feature IS NULL OR feature ~ '^[a-z0-9-]{1,48}$'),
  category    TEXT CHECK (category IS NULL OR category ~ '^[a-z0-9-]{1,48}$'),
  page        TEXT CHECK (page IS NULL OR page IN ('home', 'features', 'register')),
  cta         TEXT CHECK (cta IS NULL OR cta ~ '^[a-z0-9-]{1,48}$'),
  device      TEXT CHECK (device IS NULL OR device IN ('mobile', 'tablet', 'desktop')),
  source      TEXT CHECK (source IS NULL OR source ~ '^[a-z0-9-]{1,48}$')
);

CREATE INDEX IF NOT EXISTS idx_marketing_events_created ON public.marketing_events (created_at);
CREATE INDEX IF NOT EXISTS idx_marketing_events_event_created ON public.marketing_events (event, created_at);

ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_events FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Yönetici özeti: olay sayıları, kategori ilgisi, CTA tıklamaları ve
-- kaynağa göre kayıtlar (auth.users üst verisindeki signup_source).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_marketing_summary(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_since TIMESTAMPTZ;
  v_days  INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 180);
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  v_since := NOW() - make_interval(days => v_days);

  RETURN jsonb_build_object(
    'days', v_days,
    'events', COALESCE((
      SELECT jsonb_object_agg(event, n) FROM (
        SELECT event, COUNT(*) AS n FROM public.marketing_events
        WHERE created_at >= v_since GROUP BY event
      ) t), '{}'::JSONB),
    'categories', COALESCE((
      SELECT jsonb_object_agg(category, n) FROM (
        SELECT category, COUNT(*) AS n FROM public.marketing_events
        WHERE created_at >= v_since AND event = 'feature_category_view' AND category IS NOT NULL
        GROUP BY category
      ) t), '{}'::JSONB),
    'ctas', COALESCE((
      SELECT jsonb_object_agg(cta, n) FROM (
        SELECT cta, COUNT(*) AS n FROM public.marketing_events
        WHERE created_at >= v_since AND cta IS NOT NULL
          AND event IN ('feature_trial_click', 'feature_demo_click', 'feature_cta_click', 'homepage_features_cta_click')
        GROUP BY cta
      ) t), '{}'::JSONB),
    'devices', COALESCE((
      SELECT jsonb_object_agg(device, n) FROM (
        SELECT device, COUNT(*) AS n FROM public.marketing_events
        WHERE created_at >= v_since AND event = 'features_page_view' AND device IS NOT NULL
        GROUP BY device
      ) t), '{}'::JSONB),
    'signups', COALESCE((
      SELECT jsonb_object_agg(src, n) FROM (
        SELECT COALESCE(u.raw_user_meta_data->>'signup_source', 'bilinmiyor') AS src, COUNT(*) AS n
        FROM auth.users u
        WHERE u.created_at >= v_since
          AND u.raw_user_meta_data->>'signup_intent' = 'teacher'
        GROUP BY 1
      ) t), '{}'::JSONB)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_marketing_summary(INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_marketing_summary(INTEGER) TO authenticated;
