-- ============================================================
-- 054_usage_telemetry  —  Faz 4
--
-- KULLANIM TELEMETRİSİ: hangi özellik ne kadar kullanılıyor?
--
-- SORUN: bu soru bugüne kadar yanıtsızdı. Yol haritası ve fiyatlandırma
-- sezgiyle çiziliyordu; "koruma havuzunu kimse kullanmıyor" ya da "toplu
-- içe aktarma en çok istenen şey" gibi iddiaların hiçbir dayanağı yoktu.
--
-- ============================================================
-- NEDEN ÜÇÜNCÜ TARAF ANALİTİK DEĞİL
--
-- Bu ürün reşit olmayan öğrencilerin akademik verisini işliyor ve gizlilik
-- metni "reklam ya da üçüncü taraf takip çerezi kullanılmaz" diye taahhüt
-- veriyor. Bir analitik SDK'sı eklemek o taahhüdü bozar ve KVKK
-- aydınlatma metnini yeniden yazmayı gerektirir. Sayaç kendi
-- veritabanımızda durur.
--
-- NEDEN OLAY DEĞİL SAYAÇ
--
-- Her tıklamayı satır olarak yazmak, kısa sürede en büyük tablo hâline
-- gelir ve kişisel veriye dönüşür (kim, ne zaman, hangi öğrenciyle).
-- Burada tutulan şey GÜNLÜK ÖZET: "bu çalışma alanında bugün Koruma
-- Havuzu 3 kez açıldı". Kim açtığı YAZILMAZ — kullanıcı bazlı davranış
-- takibi bu ürünün işi değil.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.usage_counters (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- 'protection_pool.view', 'homework.publish', 'book.subsection_add' gibi.
  feature      TEXT NOT NULL CHECK (length(btrim(feature)) > 0),
  -- Gün bazında toplanır; saat ayrıntısı ürün kararı için gerekmiyor.
  day          DATE NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, feature, day)
);

CREATE INDEX IF NOT EXISTS idx_usage_feature_day
  ON public.usage_counters (feature, day DESC);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- Kiracı KENDİ kullanımını görebilir (ileride "kullanım özeti" ekranı
-- için). Yazma yalnız aşağıdaki fonksiyondan.
DROP POLICY IF EXISTS usage_counters_select ON public.usage_counters;
CREATE POLICY usage_counters_select ON public.usage_counters
  FOR SELECT
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

REVOKE ALL ON public.usage_counters FROM anon;
GRANT SELECT ON public.usage_counters TO authenticated;

-- ------------------------------------------------------------
-- track_feature_usage
--
-- Tek atomik artırma. HİÇBİR ZAMAN HATA FIRLATMAZ: telemetri yazılamadı
-- diye kullanıcının işlemi durmamalı. Ölçüm, ölçtüğü şeyi bozmamalı.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_feature_usage(
  p_workspace_id UUID,
  p_feature      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Çağıranın bu çalışma alanına gerçekten erişimi olmalı; aksi hâlde
  -- rastgele bir workspace'in sayaçları şişirilebilirdi.
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.usage_counters (workspace_id, feature, day, count)
  VALUES (p_workspace_id, p_feature, CURRENT_DATE, 1)
  ON CONFLICT (workspace_id, feature, day)
  DO UPDATE SET count = public.usage_counters.count + 1;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'usage_counters yazılamadı (feature=%): %', p_feature, SQLERRM;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.track_feature_usage(UUID, TEXT) TO authenticated;

-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.track_feature_usage(UUID, TEXT);
--   DROP TABLE IF EXISTS public.usage_counters;
-- ============================================================
