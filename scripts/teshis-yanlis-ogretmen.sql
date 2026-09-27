-- YANLIŞLIKLA ÖĞRETMEN YAPILMIŞ HESAPLAR — YALNIZ OKUR.
--
-- 116'dan önce çalışma alanı olmayan HERKES otomatik öğretmen yapılıyordu.
-- Davet linkini kullanmadan /login'den Google ile giren bir öğrenci ya da
-- veli, kendi (boş) öğretmen alanıyla açılmış olabilir.
--
-- Bu sorgu şu hesapları listeler: kendi alanının SAHİBİ olan, ama e-postası
-- BAŞKA bir alanda öğrenci kaydında ya da bir davette geçen profiller.
-- Sonuç yalnız bir aday listesidir; hiçbir şey silinmez. Her satır elle
-- değerlendirilmeli (ör. aynı kişi gerçekten hem öğretmen hem veli olabilir).
--
-- Supabase SQL Editor'de çalıştırılır.

with sahipler as (
  select p.id as profile_id, lower(p.email) as email, p.full_name,
         wm.workspace_id as kendi_alani, w.name as alan_adi, w.created_at as alan_acilis
  from public.profiles p
  join public.workspace_members wm on wm.profile_id = p.id and wm.role = 'owner' and wm.status = 'active'
  join public.workspaces w on w.id = wm.workspace_id
),
ogrenci_izi as (
  select lower(s.email) as email, s.workspace_id, 'öğrenci kaydı' as iz
  from public.students s where s.email is not null
),
davet_izi as (
  select lower(i.invited_email) as email, i.workspace_id, 'davet (' || i.role || ', ' || i.status || ')' as iz
  from public.invitations i where i.invited_email is not null and i.role in ('student', 'parent')
)
select sh.email, sh.full_name, sh.alan_adi, sh.alan_acilis,
       iz.iz, iz.workspace_id as izin_alani,
       (select count(*) from public.students s2 where s2.workspace_id = sh.kendi_alani) as kendi_alanindaki_ogrenci
from sahipler sh
join (select * from ogrenci_izi union all select * from davet_izi) iz
  on iz.email = sh.email and iz.workspace_id <> sh.kendi_alani
order by sh.alan_acilis desc;
