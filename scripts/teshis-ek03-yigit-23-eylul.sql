-- EK-03 · YİĞİT 23 / 26 EYLÜL — YALNIZ OKUR.
--
-- Soru: 23 Eylül dersi "Tüm hareketler"de neden yok? Tahakkuk hiç açılmadı
-- mı, başka tarihe mi yazıldı, modele mi dahil, fiyat mı yoktu?
-- Hiçbir şey değiştirmez. Supabase SQL Editor'de çalıştırılır.
-- Öğrenci adı farklı yazılmışsa aşağıdaki ILIKE kalıbını düzeltin.

with ogr as (
  select id, workspace_id, full_name from public.students where full_name ilike 'Yiğit%'
)
select
  ogr.full_name,
  ss.id                                             as oturum_id,
  (ss.planned_at at time zone 'Europe/Istanbul')    as plan,
  (ss.actual_at  at time zone 'Europe/Istanbul')    as gerceklesme,
  ss.status, ss.attended, ss.unit_count, ss.is_extra, ss.makeup_of_session_id,
  sv.kind as hizmet, sv.finance_link, sv.status as hizmet_durumu,
  public.finance_model_at(ss.student_id,
    (coalesce(ss.actual_at, ss.current_planned_at, ss.planned_at) at time zone 'Europe/Istanbul')::date) as o_gunku_model,
  public.price_at(ss.student_id, 'ders_basi',
    (coalesce(ss.actual_at, ss.current_planned_at, ss.planned_at) at time zone 'Europe/Istanbul')::date) as ders_basi_fiyat,
  public.price_at(ss.student_id, 'ek_ders',
    (coalesce(ss.actual_at, ss.current_planned_at, ss.planned_at) at time zone 'Europe/Istanbul')::date) as ek_ders_fiyat,
  fl.id as tahakkuk_id, fl.lesson_date, fl.kind as tahakkuk_turu, fl.unit_count as tahakkuk_birim,
  fl.unit_price_kurus / 100.0 as tahakkuk_tl
from ogr
join public.service_sessions ss on ss.student_id = ogr.id
left join public.student_services sv on sv.id = ss.service_id
left join public.finance_lessons fl on fl.service_session_id = ss.id
where (ss.planned_at at time zone 'Europe/Istanbul')::date between date '2026-09-20' and date '2026-09-30'
   or (ss.actual_at  at time zone 'Europe/Istanbul')::date between date '2026-09-20' and date '2026-09-30'
order by ss.planned_at;

-- Eylül ve sonrası tüm tahakkuk + tahsilat (ödeme hangi ayı kapatıyor?):
-- select 'tahakkuk' as tur, fl.lesson_date as tarih, fl.kind, fl.unit_price_kurus/100.0 as tl, fl.service_session_id
-- from public.finance_lessons fl join public.students s on s.id = fl.student_id
-- where s.full_name ilike 'Yiğit%' and fl.lesson_date >= '2026-09-01'
-- union all
-- select 'tahsilat', p.paid_on, p.applies_to_month::text, p.amount_kurus/100.0, null
-- from public.finance_payments p join public.students s on s.id = p.student_id
-- where s.full_name ilike 'Yiğit%' and p.paid_on >= '2026-09-01'
-- order by 2;
