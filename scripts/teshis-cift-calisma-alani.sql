-- Çift bireysel çalışma alanı teşhisi (095/096 ile birlikte eklendi).
--
-- 096'daki tekillik indeksi, veride çift kayıt varken oluşmaz. Bu sorgu
-- çakışan sahipleri ve her alanın VERİ HACMİNİ yan yana verir; hangisinin
-- gerçek olduğuna ancak buna bakarak karar verilir. Boş olan (öğrenci,
-- kitap, dönem = 0) alan silinebilir; ikisinde de veri varsa silinmez,
-- taşınması gerekir.
--
-- Salt okuma. Silme komutu bilinçli olarak burada YOK.

SELECT
  p.email,
  w.id            AS workspace_id,
  w.name,
  w.created_at,
  (p.default_workspace_id = w.id) AS varsayilan,
  (SELECT count(*) FROM public.students          s WHERE s.workspace_id = w.id) AS ogrenci,
  (SELECT count(*) FROM public.books             b WHERE b.workspace_id = w.id) AS kitap,
  (SELECT count(*) FROM public.academic_terms    t WHERE t.workspace_id = w.id) AS donem,
  (SELECT count(*) FROM public.workspace_members m WHERE m.workspace_id = w.id) AS uyelik
FROM public.workspaces w
JOIN public.profiles p ON p.id = w.owner_profile_id
WHERE w.type = 'individual'
  AND COALESCE(w.is_library, FALSE) = FALSE
  AND w.owner_profile_id IN (
    SELECT owner_profile_id
    FROM public.workspaces
    WHERE type = 'individual' AND COALESCE(is_library, FALSE) = FALSE
    GROUP BY owner_profile_id
    HAVING count(*) > 1
  )
ORDER BY p.email, w.created_at;
