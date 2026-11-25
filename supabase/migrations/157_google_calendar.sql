-- ============================================================
-- 157 — Google Calendar → İz (tek yönlü okuma)
--
-- Belge: Iz_Calendar_Entegrasyonu_WhatsApp_Ayri_Katman_23_Kasim_2026.
--
-- Calendar PLANLANAN zamanın kaynağıdır, İz GERÇEKLEŞEN hizmetin kaydı.
-- İz Calendar'a hiç yazmaz. Calendar'dan gelen her örnek (tekrarlayan
-- serinin her tarihi ayrı) en fazla BİR İz oturumuna bağlanır.
--
-- SINIRLAR (belgenin kabul senaryoları):
--   - Saati geçen ders ASLA kendiliğinden "yapıldı" olmaz; tahakkuk
--     yalnız öğretmenin işlemiyle (sync_session_accrual, 141) doğar.
--   - Calendar'da iptal/silinen ders İz'de SİLİNMEZ; işaretlenir ve
--     öğretmenden sonuç bekler.
--   - Sonucu girilmiş oturumun zamanı Calendar değişse de değişmez.
--   - Eşleşme güvenli değilse oturum açılmaz; etkinlik "eşleşmeyen"
--     olarak öğretmene sorulur. Başlıktan tahmin yok (TS: lib/calendar/match).
--   - Seriye bağlanan hizmetin oturumlarını artık Calendar üretir;
--     generate_service_sessions bağlantı tarihinden sonrasını üretmez.
--
-- GÜVENLİK: refresh token uygulamada AES-256-GCM ile şifrelenir ve
-- calendar_secrets'ta durur — RLS açık, politika YOK: tablo doğrudan
-- okunamaz. Anahtar (CALENDAR_TOKEN_KEY) yalnız sunucuda.
--
-- ÇAĞIRAN KİM? (lib/supabase/service.ts kuralı: servis istemcisi yalnız
-- oturumsuz uçlarda.) Öğretmenin tetiklediği her şey KENDİ oturumuyla
-- çalışır; yalnız günlük yedek iş (CRON_SECRET) service_role kullanır.
-- Bu yüzden fonksiyonlar iki çağıranı kabul eder: bağlantının SAHİBİ
-- (owner/teacher rolüyle) ya da service_role — _calendar_caller_ok.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Bağlantı ve gizli anahtar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email   TEXT,
  calendar_ids   TEXT[] NOT NULL DEFAULT ARRAY['primary']::TEXT[],
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reauth', 'revoked')),
  last_synced_at TIMESTAMPTZ,
  last_error     TEXT CHECK (last_error IS NULL OR length(last_error) <= 500),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, profile_id)
);

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

-- Öğretmen yalnız KENDİ bağlantısını okur; yazma sunucuda (service_role).
DROP POLICY IF EXISTS calendar_connections_select_own ON public.calendar_connections;
CREATE POLICY calendar_connections_select_own ON public.calendar_connections
  FOR SELECT TO authenticated USING (profile_id = (SELECT public.current_profile_id()));

CREATE TABLE IF NOT EXISTS public.calendar_secrets (
  connection_id      UUID PRIMARY KEY REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  refresh_token_enc  TEXT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS açık, politika YOK: authenticated/anon hiçbir satırı göremez.
ALTER TABLE public.calendar_secrets ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 2) Seri eşleşmesi (bir kez seçilir) ve etkinlik bağları
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_series_matches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id  UUID NOT NULL REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  -- Tekrarlayan seride recurringEventId; tekil etkinlikte etkinlik id'si.
  series_key     TEXT NOT NULL,
  student_id     UUID REFERENCES public.students(id) ON DELETE CASCADE,
  service_id     UUID REFERENCES public.student_services(id) ON DELETE CASCADE,
  ignored        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, series_key),
  CHECK (ignored OR (student_id IS NOT NULL AND service_id IS NOT NULL))
);

ALTER TABLE public.calendar_series_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_series_matches_select ON public.calendar_series_matches;
CREATE POLICY calendar_series_matches_select ON public.calendar_series_matches
  FOR SELECT TO authenticated USING (
    calendar_series_matches.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text]))
  );

CREATE TABLE IF NOT EXISTS public.calendar_event_links (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id      UUID NOT NULL REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  calendar_id        TEXT NOT NULL,
  google_event_id    TEXT NOT NULL,
  recurring_event_id TEXT,
  series_key         TEXT NOT NULL,
  original_start     TIMESTAMPTZ,
  start_at           TIMESTAMPTZ,
  end_at             TIMESTAMPTZ,
  event_status       TEXT NOT NULL DEFAULT 'confirmed',
  -- Yalnız eşleştirme ekranı için; eşleşmeyenler 30 gün sonra temizlenir.
  title              TEXT CHECK (title IS NULL OR length(title) <= 300),
  attendee_emails    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  meet_url           TEXT CHECK (meet_url IS NULL OR length(meet_url) <= 500),
  student_id         UUID REFERENCES public.students(id) ON DELETE SET NULL,
  service_id         UUID REFERENCES public.student_services(id) ON DELETE SET NULL,
  session_id         UUID REFERENCES public.service_sessions(id) ON DELETE SET NULL,
  match_state        TEXT NOT NULL DEFAULT 'unmatched' CHECK (match_state IN ('matched', 'unmatched', 'ignored')),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, calendar_id, google_event_id)
);

-- Bir İz oturumu en fazla bir Calendar örneğine bağlanır (tekrarsızlık).
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_event_links_session
  ON public.calendar_event_links (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_event_links_unmatched
  ON public.calendar_event_links (workspace_id, match_state, start_at);

ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_event_links_select ON public.calendar_event_links;
CREATE POLICY calendar_event_links_select ON public.calendar_event_links
  FOR SELECT TO authenticated USING (
    calendar_event_links.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text]))
  );


-- ------------------------------------------------------------
-- 3) Oturum ve hizmet alanları
-- ------------------------------------------------------------
-- Kısıt adı 140'taki ile AYNI olmalı (service_sessions_source_chk); farklı
-- ad verilseydi eski kısıt kalır ve 'calendar' değerini reddederdi.
ALTER TABLE public.service_sessions DROP CONSTRAINT IF EXISTS service_sessions_source_chk;
ALTER TABLE public.service_sessions
  ADD CONSTRAINT service_sessions_source_chk
  CHECK (source IN ('takvim', 'elle', 'telafi', 'calendar'));

ALTER TABLE public.service_sessions
  ADD COLUMN IF NOT EXISTS calendar_state TEXT;
ALTER TABLE public.service_sessions DROP CONSTRAINT IF EXISTS service_sessions_calendar_state_check;
ALTER TABLE public.service_sessions
  ADD CONSTRAINT service_sessions_calendar_state_check
  CHECK (calendar_state IS NULL OR calendar_state IN ('cancelled_in_calendar', 'missing_in_calendar'));

-- Seriye bağlanan hizmette bu tarihten sonrasını Calendar üretir.
ALTER TABLE public.student_services
  ADD COLUMN IF NOT EXISTS calendar_linked_from DATE;


-- ------------------------------------------------------------
-- 3b) Yetki yardımcısı: bağlantı sahibi ya da service_role
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._calendar_caller_ok(p_conn public.calendar_connections)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(auth.role(), '') = 'service_role'
      OR (
        p_conn.profile_id = public.current_profile_id()
        AND public.has_workspace_role(p_conn.workspace_id, ARRAY['owner', 'teacher'])
      );
$fn$;

REVOKE ALL ON FUNCTION public._calendar_caller_ok(public.calendar_connections) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 4) generate_service_sessions — Calendar'a bağlı hizmeti atlar
--
-- 140 gövdesi + tek koşul: calendar_linked_from'dan sonraki günler
-- üretilmez (esnek ritimdeki atlamayla aynı desen). İz ve Calendar aynı
-- dersi iki kez açamaz.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_service_sessions(
  p_student_id UUID,
  p_year       INTEGER,
  p_month      INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_created      INTEGER := 0;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Geçersiz ay';
  END IF;

  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Geçersiz yıl';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_slotlar (
    service_id   UUID,
    workspace_id UUID,
    student_id   UUID,
    group_id     UUID,
    duration     SMALLINT,
    planned_at   TIMESTAMPTZ
  ) ON COMMIT DROP;

  DELETE FROM tmp_slotlar WHERE true;

  INSERT INTO tmp_slotlar
  SELECT
    s.id,
    s.workspace_id,
    s.student_id,
    s.group_id,
    s.planned_duration_minutes,
    ((g.gun + slot.saat) AT TIME ZONE 'Europe/Istanbul')
  FROM public.student_services s
  CROSS JOIN LATERAL (
    VALUES (s.weekday, s.start_time),
           (s.weekday_2, s.start_time_2)
  ) AS slot(gun_no, saat)
  JOIN (
    SELECT d::DATE AS gun
    FROM generate_series(
      make_date(p_year, p_month, 1),
      (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::DATE,
      INTERVAL '1 day'
    ) AS d
  ) g ON EXTRACT(ISODOW FROM g.gun) = slot.gun_no
  WHERE s.student_id = p_student_id
    AND s.status = 'active'
    AND s.cadence <> 'esnek'
    AND slot.gun_no IS NOT NULL
    AND slot.saat IS NOT NULL
    AND g.gun >= s.start_date
    -- 157: Calendar'a bağlı hizmetin programı Calendar'dan gelir.
    AND (s.calendar_linked_from IS NULL OR g.gun < s.calendar_linked_from);

  INSERT INTO public.group_sessions (
    workspace_id, group_id, planned_at, current_planned_at, duration_minutes, status
  )
  SELECT DISTINCT workspace_id, group_id, planned_at, planned_at, duration, 'planlandi'
  FROM tmp_slotlar
  WHERE group_id IS NOT NULL
  ON CONFLICT (group_id, planned_at) DO NOTHING;

  WITH eklenen AS (
    INSERT INTO public.service_sessions (
      workspace_id, student_id, service_id, planned_at, current_planned_at,
      duration_minutes, status, group_session_id, source
    )
    SELECT
      t.workspace_id, t.student_id, t.service_id, t.planned_at,
      COALESCE(gs.current_planned_at, t.planned_at),
      t.duration, 'planlandi', gs.id, 'takvim'
    FROM tmp_slotlar t
    LEFT JOIN public.group_sessions gs
      ON gs.group_id = t.group_id AND gs.planned_at = t.planned_at
    ON CONFLICT (service_id, planned_at) WHERE makeup_of_session_id IS NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_created FROM eklenen;

  UPDATE public.service_sessions ss
  SET group_session_id = gs.id
  FROM tmp_slotlar t
  JOIN public.group_sessions gs
    ON gs.group_id = t.group_id AND gs.planned_at = t.planned_at
  WHERE ss.service_id = t.service_id
    AND ss.planned_at = t.planned_at
    AND ss.makeup_of_session_id IS NULL
    AND ss.group_session_id IS NULL;

  RETURN v_created;
END;
$fn$;

REVOKE ALL ON FUNCTION public.generate_service_sessions(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_service_sessions(UUID, INTEGER, INTEGER) TO authenticated;


-- ------------------------------------------------------------
-- 5) apply_calendar_event — Calendar örneği → İz oturumu (TEK KAPI)
--
-- Eşleştirme (öğrenci + hizmet) uygulamada yapılır ve buraya hazır
-- gelir; null ise etkinlik "eşleşmeyen" kalır. Fonksiyon idempotenttir:
-- aynı örnek kaç kez gelirse gelsin tek bağ, tek oturum.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_calendar_event(
  p_connection_id UUID,
  p_event         JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_conn       public.calendar_connections%ROWTYPE;
  v_link       public.calendar_event_links%ROWTYPE;
  v_session    public.service_sessions%ROWTYPE;
  v_service    public.student_services%ROWTYPE;
  v_status     TEXT := COALESCE(p_event->>'status', 'confirmed');
  v_start      TIMESTAMPTZ := (p_event->>'start')::TIMESTAMPTZ;
  v_end        TIMESTAMPTZ := (p_event->>'end')::TIMESTAMPTZ;
  v_original   TIMESTAMPTZ := COALESCE((p_event->>'original_start')::TIMESTAMPTZ, (p_event->>'start')::TIMESTAMPTZ);
  v_student    UUID := NULLIF(p_event->>'student_id', '')::UUID;
  v_service_id UUID := NULLIF(p_event->>'service_id', '')::UUID;
  v_ignored    BOOLEAN := COALESCE((p_event->>'ignored')::BOOLEAN, FALSE);
  v_minutes    SMALLINT;
  v_action     TEXT := 'none';
BEGIN
  SELECT * INTO v_conn FROM public.calendar_connections WHERE id = p_connection_id;
  IF v_conn.id IS NULL OR v_conn.status = 'revoked' THEN
    RAISE EXCEPTION 'Calendar bağlantısı bulunamadı';
  END IF;
  IF NOT public._calendar_caller_ok(v_conn) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Bağ: (bağlantı, takvim, örnek) başına TEK satır.
  INSERT INTO public.calendar_event_links (
    workspace_id, connection_id, calendar_id, google_event_id, recurring_event_id, series_key,
    original_start, start_at, end_at, event_status, title, attendee_emails, meet_url, last_seen_at
  ) VALUES (
    v_conn.workspace_id, v_conn.id, p_event->>'calendar_id', p_event->>'event_id',
    NULLIF(p_event->>'recurring_event_id', ''), p_event->>'series_key',
    v_original, v_start, v_end, v_status, left(p_event->>'title', 300),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_event->'attendees', '[]'::JSONB))), ARRAY[]::TEXT[]),
    left(NULLIF(p_event->>'meet_url', ''), 500), NOW()
  )
  ON CONFLICT (connection_id, calendar_id, google_event_id) DO UPDATE
    SET recurring_event_id = EXCLUDED.recurring_event_id,
        series_key = EXCLUDED.series_key,
        original_start = EXCLUDED.original_start,
        start_at = COALESCE(EXCLUDED.start_at, calendar_event_links.start_at),
        end_at = COALESCE(EXCLUDED.end_at, calendar_event_links.end_at),
        event_status = EXCLUDED.event_status,
        title = COALESCE(EXCLUDED.title, calendar_event_links.title),
        attendee_emails = EXCLUDED.attendee_emails,
        meet_url = COALESCE(EXCLUDED.meet_url, calendar_event_links.meet_url),
        last_seen_at = NOW(),
        updated_at = NOW()
  RETURNING * INTO v_link;

  -- İPTAL / SİLME: oturum silinmez, öğretmenden sonuç bekler.
  IF v_status = 'cancelled' THEN
    IF v_link.session_id IS NOT NULL THEN
      UPDATE public.service_sessions
         SET calendar_state = 'cancelled_in_calendar', updated_at = NOW()
       WHERE id = v_link.session_id AND status = 'planlandi';
      v_action := 'cancelled';
    END IF;
    RETURN jsonb_build_object('link_id', v_link.id, 'session_id', v_link.session_id, 'action', v_action);
  END IF;

  IF v_ignored THEN
    UPDATE public.calendar_event_links SET match_state = 'ignored' WHERE id = v_link.id;
    RETURN jsonb_build_object('link_id', v_link.id, 'action', 'ignored');
  END IF;

  -- Güvenli eşleşme yoksa oturum AÇILMAZ.
  IF v_student IS NULL OR v_service_id IS NULL OR v_start IS NULL THEN
    UPDATE public.calendar_event_links
       SET match_state = CASE WHEN session_id IS NULL THEN 'unmatched' ELSE match_state END
     WHERE id = v_link.id;
    RETURN jsonb_build_object('link_id', v_link.id, 'session_id', v_link.session_id, 'action', 'unmatched');
  END IF;

  SELECT * INTO v_service FROM public.student_services
   WHERE id = v_service_id AND student_id = v_student AND workspace_id = v_conn.workspace_id;
  IF v_service.id IS NULL OR v_service.participation <> 'birebir' THEN
    RAISE EXCEPTION 'Eşleşen hizmet bu öğrenciye ait değil ya da birebir değil';
  END IF;

  v_minutes := LEAST(GREATEST(COALESCE(EXTRACT(EPOCH FROM (v_end - v_start))::INT / 60, v_service.planned_duration_minutes), 5), 600);

  IF v_link.session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.service_sessions WHERE id = v_link.session_id;
  END IF;

  -- Benimseme: aynı güne düşen, sonucu girilmemiş, bağsız İz oturumu.
  IF v_session.id IS NULL THEN
    SELECT ss.* INTO v_session
    FROM public.service_sessions ss
    WHERE ss.service_id = v_service_id
      AND ss.status = 'planlandi'
      AND ss.makeup_of_session_id IS NULL
      AND (COALESCE(ss.current_planned_at, ss.planned_at) AT TIME ZONE 'Europe/Istanbul')::DATE
          = (v_original AT TIME ZONE 'Europe/Istanbul')::DATE
      AND NOT EXISTS (SELECT 1 FROM public.calendar_event_links l WHERE l.session_id = ss.id)
    ORDER BY ss.planned_at
    LIMIT 1;
    IF v_session.id IS NOT NULL THEN
      UPDATE public.service_sessions
         SET source = 'calendar', calendar_state = NULL, updated_at = NOW()
       WHERE id = v_session.id;
      v_action := 'adopted';
    END IF;
  END IF;

  IF v_session.id IS NULL THEN
    INSERT INTO public.service_sessions (
      workspace_id, student_id, service_id, planned_at, current_planned_at,
      duration_minutes, status, source
    ) VALUES (
      v_conn.workspace_id, v_student, v_service_id, v_original, v_start,
      v_minutes, 'planlandi', 'calendar'
    )
    ON CONFLICT (service_id, planned_at) WHERE makeup_of_session_id IS NULL DO NOTHING
    RETURNING * INTO v_session;

    IF v_session.id IS NULL THEN
      SELECT * INTO v_session FROM public.service_sessions
       WHERE service_id = v_service_id AND planned_at = v_original AND makeup_of_session_id IS NULL;
      v_action := 'adopted';
    ELSE
      v_action := 'created';
    END IF;
  END IF;

  -- Plan değişikliği yalnız SONUCU GİRİLMEMİŞ oturuma yansır; ilk plan
  -- (planned_at) korunur, taşıma geçmişe yazılır (140'taki erteleme modeli).
  IF v_session.status = 'planlandi' THEN
    IF v_session.student_id <> v_student OR v_session.service_id <> v_service_id THEN
      UPDATE public.service_sessions
         SET student_id = v_student, service_id = v_service_id, updated_at = NOW()
       WHERE id = v_session.id;
    END IF;
    IF COALESCE(v_session.current_planned_at, v_session.planned_at) IS DISTINCT FROM v_start THEN
      INSERT INTO public.session_plan_history (
        workspace_id, session_id, old_planned_at, new_planned_at, note
      ) VALUES (
        v_conn.workspace_id, v_session.id, COALESCE(v_session.current_planned_at, v_session.planned_at), v_start,
        'Google Calendar''da taşındı'
      );
      UPDATE public.service_sessions
         SET current_planned_at = v_start, updated_at = NOW()
       WHERE id = v_session.id;
      IF v_action = 'none' THEN v_action := 'moved'; END IF;
    END IF;
    UPDATE public.service_sessions
       SET calendar_state = NULL,
           duration_minutes = COALESCE(duration_minutes, v_minutes),
           source = CASE WHEN source = 'takvim' THEN 'calendar' ELSE source END
     WHERE id = v_session.id AND (calendar_state IS NOT NULL OR source = 'takvim' OR duration_minutes IS NULL);
  END IF;

  UPDATE public.calendar_event_links
     SET session_id = v_session.id,
         student_id = v_student,
         service_id = v_service_id,
         match_state = 'matched',
         updated_at = NOW()
   WHERE id = v_link.id;

  -- Seri eşleşmesi hizmetin programını Calendar'a devreder (tekil
  -- etkinlik devretmez: ek ders düzenli programı durdurmaz).
  IF v_link.recurring_event_id IS NOT NULL THEN
    UPDATE public.student_services
       SET calendar_linked_from = LEAST(
             COALESCE(calendar_linked_from, (v_original AT TIME ZONE 'Europe/Istanbul')::DATE),
             (v_original AT TIME ZONE 'Europe/Istanbul')::DATE
           )
     WHERE id = v_service_id;
  END IF;

  RETURN jsonb_build_object('link_id', v_link.id, 'session_id', v_session.id, 'action', v_action);
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_calendar_event(UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_calendar_event(UUID, JSONB) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 6) mark_calendar_missing — pencerede artık görünmeyenler
--
-- Eşitleme başladıktan sonra görülmeyen bağlı örnek ya da bağlı hizmetin
-- Calendar karşılığı olmayan planlı İz oturumu "Calendar'da karşılığı
-- yok" olur. SİLİNMEZ; öğretmen karar verir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_calendar_missing(
  p_connection_id UUID,
  p_sync_started  TIMESTAMPTZ,
  p_window_start  TIMESTAMPTZ,
  p_window_end    TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_conn  public.calendar_connections%ROWTYPE;
  v_count INTEGER := 0;
  v_more  INTEGER := 0;
BEGIN
  SELECT * INTO v_conn FROM public.calendar_connections WHERE id = p_connection_id;
  IF v_conn.id IS NULL THEN RETURN 0; END IF;
  IF NOT public._calendar_caller_ok(v_conn) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.service_sessions ss
     SET calendar_state = 'missing_in_calendar', updated_at = NOW()
    FROM public.calendar_event_links l
   WHERE l.connection_id = p_connection_id
     AND l.session_id = ss.id
     AND l.last_seen_at < p_sync_started
     AND l.start_at BETWEEN p_window_start AND p_window_end
     AND ss.status = 'planlandi'
     AND ss.calendar_state IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Bağlı hizmetin bağlantı tarihinden sonraki, Calendar'a bağlanmamış
  -- planlı oturumları (bağlantıdan önce İz'in ürettikleri).
  UPDATE public.service_sessions ss
     SET calendar_state = 'missing_in_calendar', updated_at = NOW()
    FROM public.student_services sv
   WHERE sv.id = ss.service_id
     AND sv.workspace_id = v_conn.workspace_id
     AND sv.calendar_linked_from IS NOT NULL
     AND (COALESCE(ss.current_planned_at, ss.planned_at) AT TIME ZONE 'Europe/Istanbul')::DATE >= sv.calendar_linked_from
     AND COALESCE(ss.current_planned_at, ss.planned_at) BETWEEN p_window_start AND p_window_end
     AND ss.status = 'planlandi'
     AND ss.calendar_state IS NULL
     AND ss.makeup_of_session_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.calendar_event_links l WHERE l.session_id = ss.id);
  GET DIAGNOSTICS v_more = ROW_COUNT;

  -- Eşleşmeyen eski etkinlik başlıkları 30 gün sonra temizlenir.
  DELETE FROM public.calendar_event_links
   WHERE connection_id = p_connection_id
     AND match_state <> 'matched'
     AND start_at < NOW() - INTERVAL '30 days';

  RETURN v_count + v_more;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_calendar_missing(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_calendar_missing(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 7) Bağlantı yönetimi (öğretmenin kendi oturumuyla)
-- ------------------------------------------------------------

-- Bağla / yeniden bağla: kendi bağlantısını ve ŞİFRELİ anahtarı yazar.
CREATE OR REPLACE FUNCTION public.save_calendar_connection(
  p_workspace_id      UUID,
  p_google_email      TEXT,
  p_refresh_token_enc TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile UUID := public.current_profile_id();
  v_id      UUID;
BEGIN
  IF v_profile IS NULL OR NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF COALESCE(p_refresh_token_enc, '') = '' THEN
    RAISE EXCEPTION 'Google bağlantı anahtarı alınamadı';
  END IF;

  INSERT INTO public.calendar_connections (workspace_id, profile_id, google_email, status, last_error)
  VALUES (p_workspace_id, v_profile, left(p_google_email, 320), 'active', NULL)
  ON CONFLICT (workspace_id, profile_id) DO UPDATE
    SET google_email = EXCLUDED.google_email, status = 'active', last_error = NULL, updated_at = NOW()
  RETURNING id INTO v_id;

  INSERT INTO public.calendar_secrets (connection_id, refresh_token_enc)
  VALUES (v_id, p_refresh_token_enc)
  ON CONFLICT (connection_id) DO UPDATE
    SET refresh_token_enc = EXCLUDED.refresh_token_enc, updated_at = NOW();

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_calendar_connection(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_calendar_connection(UUID, TEXT, TEXT) TO authenticated;

-- Şifreli anahtar YALNIZ bağlantı sahibine ya da service_role'e döner.
-- Çözme anahtarı sunucuda olduğu için şifreli metin tek başına işe yaramaz.
CREATE OR REPLACE FUNCTION public.get_calendar_secret(p_connection_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_conn public.calendar_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_conn FROM public.calendar_connections WHERE id = p_connection_id;
  IF v_conn.id IS NULL OR NOT public._calendar_caller_ok(v_conn) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  RETURN (SELECT refresh_token_enc FROM public.calendar_secrets WHERE connection_id = p_connection_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_calendar_secret(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_calendar_secret(UUID) TO authenticated, service_role;

-- Eşitleme sonucu / takvim seçimi.
CREATE OR REPLACE FUNCTION public.set_calendar_connection_state(
  p_connection_id UUID,
  p_status        TEXT DEFAULT NULL,
  p_error         TEXT DEFAULT NULL,
  p_synced        BOOLEAN DEFAULT FALSE,
  p_calendar_ids  TEXT[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_conn public.calendar_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_conn FROM public.calendar_connections WHERE id = p_connection_id;
  IF v_conn.id IS NULL OR NOT public._calendar_caller_ok(v_conn) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'needs_reauth', 'revoked') THEN
    RAISE EXCEPTION 'Geçersiz durum';
  END IF;
  IF p_calendar_ids IS NOT NULL AND (array_length(p_calendar_ids, 1) IS NULL OR array_length(p_calendar_ids, 1) > 10) THEN
    RAISE EXCEPTION 'En az bir, en fazla on takvim seçilebilir';
  END IF;

  UPDATE public.calendar_connections
     SET status = COALESCE(p_status, status),
         last_error = CASE WHEN p_synced THEN left(p_error, 500) ELSE COALESCE(left(p_error, 500), last_error) END,
         last_synced_at = CASE WHEN p_synced THEN NOW() ELSE last_synced_at END,
         calendar_ids = COALESCE(p_calendar_ids, calendar_ids),
         updated_at = NOW()
   WHERE id = p_connection_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_calendar_connection_state(UUID, TEXT, TEXT, BOOLEAN, TEXT[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_calendar_connection_state(UUID, TEXT, TEXT, BOOLEAN, TEXT[]) TO authenticated, service_role;

-- Bağlantıyı kopar: anahtar ve bağlar silinir; İz OTURUMLARI KALIR.
-- Calendar'a devredilmiş hizmetlerin programı İz'e geri döner.
CREATE OR REPLACE FUNCTION public.delete_calendar_connection(p_connection_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_conn public.calendar_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_conn FROM public.calendar_connections WHERE id = p_connection_id;
  IF v_conn.id IS NULL THEN RETURN; END IF;
  IF NOT public._calendar_caller_ok(v_conn) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.student_services
     SET calendar_linked_from = NULL
   WHERE id IN (
     SELECT service_id FROM public.calendar_series_matches
     WHERE connection_id = p_connection_id AND service_id IS NOT NULL
   );

  UPDATE public.service_sessions ss
     SET calendar_state = NULL
    FROM public.calendar_event_links l
   WHERE l.connection_id = p_connection_id AND l.session_id = ss.id AND ss.calendar_state IS NOT NULL;

  DELETE FROM public.calendar_connections WHERE id = p_connection_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_calendar_connection(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_calendar_connection(UUID) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 8) Eşleşmeyen etkinliği bir kez eşle / yok say
--
-- p_whole_series: seri anahtarına kaydedilir (serinin tüm tarihleri);
-- değilse yalnız bu örnek ('event:' + örnek id). Kayıttan sonra bu örnek
-- hemen uygulanır; serinin diğer tarihleri bir sonraki eşitlemede gelir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_calendar_match(
  p_link_id      UUID,
  p_student_id   UUID,
  p_service_id   UUID,
  p_ignored      BOOLEAN DEFAULT FALSE,
  p_whole_series BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_link public.calendar_event_links%ROWTYPE;
  v_conn public.calendar_connections%ROWTYPE;
  v_key  TEXT;
BEGIN
  SELECT * INTO v_link FROM public.calendar_event_links WHERE id = p_link_id;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Etkinlik bulunamadı'; END IF;
  SELECT * INTO v_conn FROM public.calendar_connections WHERE id = v_link.connection_id;
  IF NOT public._calendar_caller_ok(v_conn) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT p_ignored AND NOT EXISTS (
    SELECT 1 FROM public.student_services sv
    WHERE sv.id = p_service_id AND sv.student_id = p_student_id
      AND sv.workspace_id = v_conn.workspace_id AND sv.participation = 'birebir'
  ) THEN
    RAISE EXCEPTION 'Hizmet bu öğrenciye ait değil ya da birebir değil';
  END IF;

  v_key := CASE WHEN p_whole_series THEN v_link.series_key ELSE 'event:' || v_link.google_event_id END;

  INSERT INTO public.calendar_series_matches (
    workspace_id, connection_id, series_key, student_id, service_id, ignored, created_by_profile_id
  ) VALUES (
    v_conn.workspace_id, v_conn.id, v_key,
    CASE WHEN p_ignored THEN NULL ELSE p_student_id END,
    CASE WHEN p_ignored THEN NULL ELSE p_service_id END,
    p_ignored, public.current_profile_id()
  )
  ON CONFLICT (connection_id, series_key) DO UPDATE
    SET student_id = EXCLUDED.student_id, service_id = EXCLUDED.service_id, ignored = EXCLUDED.ignored;

  RETURN public.apply_calendar_event(v_conn.id, jsonb_build_object(
    'calendar_id', v_link.calendar_id,
    'event_id', v_link.google_event_id,
    'recurring_event_id', v_link.recurring_event_id,
    'series_key', v_link.series_key,
    'original_start', v_link.original_start,
    'start', v_link.start_at,
    'end', v_link.end_at,
    'status', v_link.event_status,
    'title', v_link.title,
    'attendees', to_jsonb(v_link.attendee_emails),
    'meet_url', v_link.meet_url,
    'student_id', CASE WHEN p_ignored THEN NULL ELSE p_student_id END,
    'service_id', CASE WHEN p_ignored THEN NULL ELSE p_service_id END,
    'ignored', p_ignored
  ));
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_calendar_match(UUID, UUID, UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_calendar_match(UUID, UUID, UUID, BOOLEAN, BOOLEAN) TO authenticated;

-- Hizmetin Calendar bağını kaldır: program İz'e döner; seri eşleşmeleri
-- silinir (bir sonraki eşitlemede o seri yeniden "eşleşmeyen" olur).
CREATE OR REPLACE FUNCTION public.unlink_service_calendar(p_service_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.student_services WHERE id = p_service_id;
  IF v_ws IS NULL OR NOT public.has_workspace_role(v_ws, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.student_services SET calendar_linked_from = NULL WHERE id = p_service_id;
  DELETE FROM public.calendar_series_matches WHERE service_id = p_service_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.unlink_service_calendar(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unlink_service_calendar(UUID) TO authenticated;


-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.unlink_service_calendar(UUID);
--   DROP FUNCTION IF EXISTS public.set_calendar_match(UUID, UUID, UUID, BOOLEAN, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.delete_calendar_connection(UUID);
--   DROP FUNCTION IF EXISTS public.set_calendar_connection_state(UUID, TEXT, TEXT, BOOLEAN, TEXT[]);
--   DROP FUNCTION IF EXISTS public.get_calendar_secret(UUID);
--   DROP FUNCTION IF EXISTS public.save_calendar_connection(UUID, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public._calendar_caller_ok(public.calendar_connections);
--   DROP FUNCTION IF EXISTS public.mark_calendar_missing(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS public.apply_calendar_event(UUID, JSONB);
--   -- generate_service_sessions: 140 tanımını yeniden çalıştırın.
--   ALTER TABLE public.student_services DROP COLUMN IF EXISTS calendar_linked_from;
--   ALTER TABLE public.service_sessions DROP CONSTRAINT IF EXISTS service_sessions_calendar_state_check;
--   ALTER TABLE public.service_sessions DROP COLUMN IF EXISTS calendar_state;
--   -- service_sessions_source_chk: 140'taki ('takvim','elle','telafi') hâline döndürün.
--   DROP TABLE IF EXISTS public.calendar_event_links;
--   DROP TABLE IF EXISTS public.calendar_series_matches;
--   DROP TABLE IF EXISTS public.calendar_secrets;
--   DROP TABLE IF EXISTS public.calendar_connections;
-- ============================================================
