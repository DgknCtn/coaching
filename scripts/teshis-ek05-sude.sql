-- EK-05 · SUDE KÜTÜPHANEDEN KİTAP EKLEYEMİYOR — YALNIZ OKUR.
--
-- Kütüphane alanı var mı, içinde kaç yayında kitap var, Sude'nin rolü ne,
-- Sude daha önce kütüphaneden kitap almış mı? Hiçbir şey değiştirmez.
-- Supabase SQL Editor'de çalıştırılır. Ad farklıysa ILIKE kalıbını düzeltin.

select 'kütüphane alanı' as kontrol, w.id::text as deger, w.name as ayrinti
from public.workspaces w where w.is_library
union all
select 'kütüphanede yayında kitap', count(*)::text, null
from public.books b join public.workspaces w on w.id = b.workspace_id
where w.is_library and b.status = 'active' and b.library_status = 'approved'
union all
select 'onay bekleyen öneri', count(*)::text, null
from public.books b where b.library_status = 'pending'
union all
select 'Sude üyeliği', wm.role || ' · ' || wm.status, w.name
from public.profiles p
join public.workspace_members wm on wm.profile_id = p.id
join public.workspaces w on w.id = wm.workspace_id
where p.full_name ilike 'Sude%'
union all
select 'Sude havuzu (aktif kitap)', count(*)::text, w.name
from public.profiles p
join public.workspace_members wm on wm.profile_id = p.id and wm.role in ('owner', 'teacher')
join public.workspaces w on w.id = wm.workspace_id
join public.books b on b.workspace_id = w.id and b.status <> 'archived'
where p.full_name ilike 'Sude%'
group by w.name
union all
select 'Sude kütüphaneden aldığı', count(*)::text, w.name
from public.profiles p
join public.workspace_members wm on wm.profile_id = p.id and wm.role in ('owner', 'teacher')
join public.workspaces w on w.id = wm.workspace_id
join public.books b on b.workspace_id = w.id and b.library_source_book_id is not null
where p.full_name ilike 'Sude%'
group by w.name;
