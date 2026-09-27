-- ============================================================
-- 117 — PANEL SORGUSU PLANI SAKLANAN BİR FONKSİYONDA
--
-- ============================================================
-- ÖLÇÜM (115 sonrası, B öğretmeni, RLS dahil — baseline.md)
--
--   Execution 52 ms · Planning 18 ms
--
-- `teacher_student_operation_view` yedi alt view'ı birleştiriyor; her
-- PostgREST isteği onu SIFIRDAN planlıyor. Planlama, çalışmanın üçte biri
-- kadar. PostgREST view sorgusunu hazırlanmış ifade olarak saklamıyor.
--
-- DÜZELTME: aynı sorgu bir plpgsql fonksiyonunun içinde. plpgsql
-- `RETURN QUERY`'nin planını OTURUM boyunca saklar; beş çalıştırmadan
-- sonra parametreye bağlı olmayan genel plana geçer ve planlama bedeli
-- ödenmez. PostgREST bağlantıları kalıcı olduğu için kazanç her istekte.
--
-- ============================================================
-- GÜVENLİK DEĞİŞMİYOR
--
-- Fonksiyon SECURITY INVOKER: çağıranın rolüyle çalışır, view'ın
-- security_invoker=on ayarı ve alt tabloların RLS'i AYNEN uygulanır.
-- SECURITY DEFINER olsaydı RLS atlanır ve her öğretmen her kiracıyı
-- görürdü — ADIM 3 bunu denetliyor.
--
-- DÖNÜŞ TİPİ VIEW'IN SATIR TİPİ: view `DROP ... CASCADE` ile yeniden
-- kurulursa (097/103/106 böyle yaptı) bu fonksiyon da düşer ve yeniden
-- oluşturulmalıdır. Uygulama o durumda "alınamadı" gösterir (B01), boş
-- liste değil.
-- ============================================================

CREATE OR REPLACE FUNCTION public.teacher_operation_rows(p_workspace_id UUID)
RETURNS SETOF public.teacher_student_operation_view
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.teacher_student_operation_view v
  WHERE v.workspace_id = p_workspace_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.teacher_operation_rows(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.teacher_operation_rows(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.teacher_operation_rows(UUID) TO authenticated;

-- ------------------------------------------------------------
-- Doğrulama
-- ------------------------------------------------------------
DO $dogrula$
DECLARE
  v_fn OID := 'public.teacher_operation_rows(uuid)'::regprocedure;
  v_fark BIGINT;
  v_ws UUID;
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION '117 DOĞRULAMA: fonksiyon SECURITY DEFINER — RLS atlanır.';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '117 DOĞRULAMA: anon''a açık.';
  END IF;

  -- Eşdeğerlik: fonksiyon, view'ın aynı alan için döndürdüğünün aynısını
  -- döndürmeli (postgres rolüyle, tüm satırlar üzerinde bir alan örneği).
  SELECT workspace_id INTO v_ws FROM public.teacher_student_operation_view LIMIT 1;
  IF v_ws IS NOT NULL THEN
    SELECT count(*) INTO v_fark FROM (
      (SELECT * FROM public.teacher_student_operation_view WHERE workspace_id = v_ws
       EXCEPT ALL SELECT * FROM public.teacher_operation_rows(v_ws))
      UNION ALL
      (SELECT * FROM public.teacher_operation_rows(v_ws)
       EXCEPT ALL SELECT * FROM public.teacher_student_operation_view WHERE workspace_id = v_ws)
    ) s;
    IF v_fark <> 0 THEN
      RAISE EXCEPTION '117 DOĞRULAMA: fonksiyon view ile % satır farklı.', v_fark;
    END IF;
  END IF;

  RAISE NOTICE '117: fonksiyon SECURITY INVOKER, anon kapalı, view ile eşdeğer.';
END;
$dogrula$;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.teacher_operation_rows(UUID);
-- (Uygulama view'a dönmeli: app/(dashboard)/teacher/page.tsx ve students/page.tsx.)
