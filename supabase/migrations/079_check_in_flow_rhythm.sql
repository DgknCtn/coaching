-- ============================================================
-- 079_check_in_flow_rhythm
--
-- R7 / Site Testi 05 · kabul #10:
--   "Durum Bildirimleri aktif Haftalık Akış'a bağlı çalışmalı;
--    sabit 3 günlük periyot tek mantık olmamalı."
--
-- ============================================================
-- SORUN: İKİ SAAT, BİRBİRİNDEN HABERSİZ
-- ============================================================
-- 016 bildirimi tek bir sabite bağlıyor: son bildirimden
-- `interval_days` (varsayılan 3) gün sonra bir tane daha istenir. Bu
-- saat haftadan hiç haberdar değil:
--
--   * İki günlük bir akışta 3 gün SONRA sorulan bildirim, hafta zaten
--     kapandıktan sonra gelir — geç kalmış bir soru.
--   * On günlük bir akışta 3 günde bir sorulan bildirim, haftanın
--     ritmiyle değil takvimle konuşur.
--   * Öğrenci beş gündür hiç teslim yapmamışsa ve son bildirimi dün
--     verdiyse sistem sessiz kalır; oysa asıl sorulacak an tam orasıdır.
--
-- 077 bu kuralı TypeScript'te zaten yazmıştı (`checkInDue`,
-- lib/weekly-flow.ts) — iki tetikleyici, ikisi de yeterli: akışın
-- ortası geçtiyse (RİTİM) ya da teslim sessizliği eşiği aşıldıysa
-- (HAREKET). Ama fonksiyon hiçbir yerden çağrılmıyordu; bildirimi
-- üreten `ensure_student_check_ins` hâlâ yalnız sabiti biliyordu.
--
-- ============================================================
-- ÇÖZÜM: EN ERKEN TETİKLEYİCİ KAZANIR
-- ============================================================
-- `due_at` artık üç adaydan EN ERKENİ:
--
--   1. anchor + interval_days   — 016'nın sabiti. TABAN olarak KALIYOR:
--      akışı olmayan öğrencide tek ölçü budur ve akış varken de
--      bildirimlerin büsbütün durmasını engeller.
--   2. akışın ORTA NOKTASI      — ritim tetikleyicisi.
--   3. son teslim + 3 gün       — sessizlik tetikleyicisi.
--
-- LEAST NULL'ları yok sayar, bu yüzden adaylardan biri yoksa (akış yok,
-- hiç teslim yok) formül kendiliğinden sadeleşiyor.
--
-- NEDEN "EN ERKEN": belge iki tetikleyici için de *"ikisi de yeterli"*
-- diyor. Yeterli koşulların birleşimi, ilk gerçekleşenin zamanıdır.
--
-- HER ADAY anchor_at'ten SONRA OLMAK ZORUNDA. Aksi hâlde geçmişte
-- kalmış bir orta nokta ya da çok eski bir teslim, her sayfa
-- yüklenişinde "vakti geçmiş" bir bildirim doğururdu.
--
-- ============================================================
-- NEDEN YENİ SÜTUN (weekly_flow_id)
-- ============================================================
-- Bildirimin hangi haftaya ait olduğu TÜRETİLEMEZ: akışın kapanışı
-- sonradan taşınabiliyor (bkz. 077 · set_weekly_flow_due) ve o anda
-- tarih karşılaştırmasıyla bakan her sorgu bildirimi başka bir haftaya
-- kaydırırdı. 077'nin `homework_batches.weekly_flow_id` için verdiği
-- gerekçenin aynısı.
--
-- Nullable ve öyle kalmalı: akış kavramından önceki bütün bildirimleri
-- uydurma bir haftaya bağlamak, olmayan bir geçmişi kaydetmek olurdu.
--
-- ============================================================
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu)
-- ============================================================

-- ============================================================
-- 1) Bildirimin haftası
-- ============================================================
ALTER TABLE public.student_check_ins
  ADD COLUMN IF NOT EXISTS weekly_flow_id UUID
    REFERENCES public.weekly_flows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_check_ins_flow
  ON public.student_check_ins (weekly_flow_id)
  WHERE weekly_flow_id IS NOT NULL;

-- ============================================================
-- 2) ensure_student_check_ins — ritim + hareket + taban
-- ============================================================
--
-- 016'nın tembel materyalizasyon tasarımı korunuyor: cron yok, sayfa
-- yüklenirken çağrılır, idempotent (öğrenci başına tek 'pending' satır
-- kısmi tekil indeksle garanti).

CREATE OR REPLACE FUNCTION public.ensure_student_check_ins(
  p_workspace_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_created INT := 0;
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  WITH candidate AS (
    SELECT
      s.workspace_id,
      s.id AS student_id,
      sch.interval_days,
      f.id         AS flow_id,
      f.starts_at  AS flow_starts_at,
      f.due_at     AS flow_due_at,
      -- Ölçüm noktası: son CEVAPLANMIŞ bildirim, yoksa planın kurulduğu an.
      COALESCE(
        (SELECT MAX(ci.submitted_at)
           FROM public.student_check_ins ci
          WHERE ci.student_id = s.id AND ci.status = 'submitted'),
        sch.created_at
      ) AS anchor_at,
      -- Son teslim: ÖĞRENCİNİN gönderimi. İade edilen ('reverted')
      -- kayıt sayılmaz — geri alınmış bir iş "hareket" değildir.
      (SELECT MAX(tc.completed_at)
         FROM public.test_completions tc
        WHERE tc.student_id = s.id AND tc.status = 'active') AS last_delivery_at
    FROM public.students s
    JOIN public.student_check_in_schedules sch ON sch.student_id = s.id
    -- Aktif akış varsa ritim ondan gelir; yoksa LEFT JOIN NULL bırakır
    -- ve formül 016'nın sabitine iner.
    LEFT JOIN public.weekly_flows f
           ON f.student_id = s.id AND f.status = 'active'
    WHERE s.workspace_id = p_workspace_id
      AND s.status = 'active'
      AND sch.is_active
      AND NOT EXISTS (
        SELECT 1 FROM public.student_check_ins ci
         WHERE ci.student_id = s.id AND ci.status = 'pending'
      )
  ),
  scheduled AS (
    SELECT
      c.*,
      LEAST(
        -- 1) TABAN — 016'nın sabiti.
        c.anchor_at + (c.interval_days * INTERVAL '1 day'),

        -- 2) RİTİM — akışın orta noktası.
        (SELECT CASE
           WHEN c.flow_id IS NULL THEN NULL
           WHEN c.flow_starts_at + (c.flow_due_at - c.flow_starts_at) / 2 > c.anchor_at
             THEN c.flow_starts_at + (c.flow_due_at - c.flow_starts_at) / 2
           ELSE NULL
         END),

        -- 3) HAREKET — teslim sessizliği.
        -- PARITY-BEGIN silence_days
        (SELECT CASE
           WHEN c.last_delivery_at IS NULL THEN NULL
           WHEN c.last_delivery_at + (3 * INTERVAL '1 day') > c.anchor_at
             THEN c.last_delivery_at + (3 * INTERVAL '1 day')
           ELSE NULL
         END)
        -- PARITY-END silence_days
      ) AS due_at
    FROM candidate c
  )
  INSERT INTO public.student_check_ins (
    workspace_id, student_id, due_at, weekly_flow_id
  )
  SELECT workspace_id, student_id, due_at, flow_id
  FROM scheduled
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object('created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_student_check_ins(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_student_check_ins(UUID) TO authenticated;
