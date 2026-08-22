-- ============================================================
-- 025_perf_indexes
--
-- Denetimde çıkan eksik BİLEŞİK indeksler. Mevcut indeks seti beklenenden
-- iyi durumdaydı; eksik olanlar tam da uygulamanın en sık çalıştırdığı
-- filtre ikilileriydi ve tek kolonlu indeksler bu sorgularda yetersiz
-- kalıyordu (Postgres tek kolondan sonra kalan satırları eleyip filtrelemek
-- zorunda kalıyor).
--
-- Bu migration yalnızca ERİŞİM YOLU ekler: hiçbir sorgunun döndürdüğü
-- satırlar veya sırası değişmez.
-- ============================================================

-- lib/book-map.ts: açık ödev kayıtları
--   .in('student_book_assignment_id', ids).in('status', [...])
-- Mevcut idx_hi_sba yalnız ilk kolonu kapsıyordu.
CREATE INDEX IF NOT EXISTS idx_hi_sba_status
  ON public.homework_items (student_book_assignment_id, status);

-- app/(dashboard)/teacher/tasks/page.tsx: onay ve gecikme kuyrukları
--   .eq('workspace_id', ...).eq('status', 'pending_approval' | 'pending')
-- Mevcut idx_hi_workspace_batch (workspace_id, homework_batch_id) bu
-- sorguya yardımcı olmuyordu.
CREATE INDEX IF NOT EXISTS idx_hi_workspace_status
  ON public.homework_items (workspace_id, status);

-- lib/book-map.ts: onaylanmış tamamlamalar
--   .in('student_book_assignment_id', ids).eq('status', 'active')
CREATE INDEX IF NOT EXISTS idx_tc_sba_status
  ON public.test_completions (student_book_assignment_id, status);

-- lib/book-map.ts: tek aktif hedef (022)
--   .in('student_book_assignment_id', ids).eq('active', true)
-- uniq_active_student_book_target yalnız active=true satırları kapsayan
-- kısmi bir indeks; bu sorgu için yeterli olmayabiliyor.
CREATE INDEX IF NOT EXISTS idx_sbt_sba_active
  ON public.student_book_targets (student_book_assignment_id, active);

-- Kitap haritası: bölümün birimlerini sıraya dizmek. Sayfa takipli
-- kitapta bir bölüm 1000 satıra kadar çıkabildiği için (022) sıralamanın
-- indeksten gelmesi önemli.
CREATE INDEX IF NOT EXISTS idx_tests_section_order
  ON public.book_tests (section_id, order_index);

-- Öğrenci/veli kitap sayfası: izleme işaretleri (023). Tabloya benzersiz
-- indeks eklenmişti ama COALESCE ifadesi üzerinden olduğu için düz
-- assignment aramasında kullanılamıyor.
CREATE INDEX IF NOT EXISTS idx_vwm_sba
  ON public.video_watch_marks (student_book_assignment_id);
