# PERF-02 — Anlık görüntü 01 (pencere başlangıcı)

**Alındığı an:** 26 Eylül 2026, 20:13 UTC
**Yöntem:** salt okunur SQL (`iz_readonly`). Hiçbir şey değiştirilmedi.
**Birikmiş pencere:** `stats_reset = 2026-07-24 08:28 UTC` → **64 gün 11 saat**

## Neden sıfırlama değil, fark

`pg_stat_reset()` panelde denendi ve reddedildi:

```
ERROR: 42501: permission denied for function pg_stat_reset
```

Canlıdan okunan sebep: `postgres` rolü superuser değil, `pg_stat_reset` üzerinde EXECUTE yetkisi yok ve `supabase_admin` rolünün **üyesi de değil**. Yani sıfırlama bu projede hiçbir bağlantıdan yapılamıyor.

Yerine iki anlık görüntünün farkı alınıyor. Bu, sıfırlamadan üstün: 64 günlük geçmiş silinmiyor, ölçüm yanlış kurulursa tekrar edilebilir.

## Ölçümü kirleten iki şey — kayda geçiyor

**1. Kendi test koşumlarımız.** Canlıya karşı koşan üç dosya (`anon-endpoint-probe`, `tenant-isolation`, `cross-tenant`) her sorguda RLS politikasını değerlendiriyor, yani `profiles` / `workspaces` / `workspace_members` sayaçlarını artırıyor. Kanıt, iki günlük sıçrama:

| Tablo | 24 Eylül | 26 Eylül | Fark |
|---|---|---|---|
| `workspaces` sıralı tarama | 203.068 | **408.571** | +205.503 |
| `profiles` sıralı tarama | 38.306 | **139.987** | +101.681 |

İki günde iki katına çıkan bir sayı, "62 günlük birikim" açıklamasıyla uyuşmuyor: demek ki bu tablolar **hâlâ yoğun taranıyor**. Ne kadarı testlerden, ne kadarı gerçek kullanımdan — bunu ayıran şey, testin koşulmadığı bir pencere. **Kural: 3 gün boyunca canlıya karşı test koşulmaz.**

**2. `111` bu anlık görüntüde henüz yoktu.** Aşağıdaki sayılar dört FK indeksi **oluşturulmadan önceki** hâl. İndeksler pencereden önce eklendiği için fark, indeksli durumu ölçecek; bu tablo da "öncesi" referansı olarak duruyor.

## Resmî pencere başlangıcı — 26 Eylül 2026, 20:35 UTC (111 sonrası)

`111` panelde uygulandı ve canlıdan teyit edildi; dört indeks yerinde, toplam **96 kB**:

| İndeks | Tablo | Kullanım | Boyut |
|---|---|---|---|
| `idx_curriculum_template_items_workspace` | curriculum_template_items | 0 | 16 kB |
| `idx_homework_items_book` | homework_items | 0 | 32 kB |
| `idx_homework_items_section` | homework_items | 0 | 32 kB |
| `idx_student_curriculum_items_workspace` | student_curriculum_items | 0 | 16 kB |

`idx_scan = 0` beklenen ve **ölçümün asıl sorusu bu**: üç gün sonra bu dördü sıfırda kalırsa 111'in iddiası (bu sorgu yolları sıcak) yanlıştı ve indeksler düşürülmeli — kullanılmayan indeks yalnız yazma maliyetidir.

Pencere başlangıcındaki karşılaştırma değerleri (20:35 UTC):

| Tablo | Satır | Sıralı tarama | İndeks taraması |
|---|---|---|---|
| workspaces | 7 | 408.638 | 20.479.358 |
| profiles | 21 | 140.523 | 24.682.646 |
| workspace_members | 28 | 10 | 22.603.503 |
| workspace_licenses | 2 | 26 | 18.304.768 |
| students | 26 | 9.873 | 1.907.462 |
| homework_items | 1.429 | 1.713 | 1.636.771 |
| test_completions | 1.154 | 1.517 | 2.015.131 |
| book_tests | 37.302 | 45 | 618.611 |
| books | 183 | 10.762 | 158.142 |
| student_curriculum_items | 379 | 1.326 | 105.447 |
| curriculum_template_items | 952 | 112 | 19.404 |

**Ölçüm tarihi: 29 Eylül 2026.** Aynı sorgular koşulur, fark alınır.

### PENCERE KİRLENDİ — 27 Eylül 2026, LOAD-01 koşumu

Pencere başladıktan **yarım saat sonra** yük testi koşuldu ve bu, farkın okunuşunu doğrudan etkiliyor. Gizlemek yerine yazıyoruz; ölçümün ne kadarının gerçek kullanım olduğu ancak bu bilinerek söylenebilir.

| Koşum | Eşzamanlı | Süre | Toplam istek |
|---|---|---|---|
| duman testi | 10 | 1,5 dk | ~1.600 |
| taban | 10 | 10 dk | 9.078 |
| normal | 40 | 15 dk | 37.622 |

**Toplam ~48.000 istek** ve her biri 10 adımlık bir tur içinde RLS politikalarını değerlendirdi. Yani `profiles`, `workspaces`, `workspace_members`, `workspace_licenses` sayaçlarındaki artışın **büyük kısmı bu koşumlardan** gelecek; `students`, `homework_items`, `test_completions`, `book_tests` ve `weekly_flows` da senaryonun doğrudan okuduğu tablolar.

**Sonuç olarak 29 Eylül farkı şu soruyu YANITLAMAZ:** "gerçek kullanımda üç günde ne oluyor?" Yanıtladığı soru şu: "yük testi + gerçek kullanım birlikte ne üretti?"

**Karar:** FK indeks triyajı (ADIM 4) yine yapılabilir — orada aranan şey *hangi kolonların tarandığı*, ve yük testi gerçek sorgu yollarını kullandığı için bu sinyal bozulmuyor, güçleniyor. Ama **tarama sayılarının mutlak değeri** kapasite planlaması için kullanılmayacak; onun için yük testinden arınmış ikinci bir pencere gerekir.

Alternatifi yoktu: yedek beklemek de pencereyi uzatmak da aynı üç günü tüketiyordu ve yük testi yedekten sonra koşulmak üzere sıraya konmuştu.

## 111 canlıda yoktu — ayrı bir bulgu

`baseline.md` migration `111`'i uygulanmış sayıyordu. 26 Eylül'de ölçüldü: dört indeksin **hiçbiri** canlıda yok (`public` şemasında 196 indeks var, bu dördü değil). `107`–`110` uygulanmış; yalnız `111` atlanmış.

111'in içinde kendini denetleyen bir `DO $verify$` bloğu var ve indeks oluşmazsa `RAISE EXCEPTION` atıyor — yani dosya koşulmuş olsaydı ya indeksler olurdu ya da hata görünürdü. Sessiz atlanmış.

**Sonucu:** PERF-01 "4 indeks eklendi" diye kapatılmıştı ama üretim o indekssiz çalışıyordu. `perf-02-yeniden-olcum.sql` ADIM 3'ün ("bu dört indeks kullanılıyor mu") cevaplanabilmesi de buna bağlıydı.

## Anlık görüntü (111 öncesi)

| Tablo | Satır | Sıralı tarama | İndeks taraması | Eklenen | Güncellenen | Silinen |
|---|---|---|---|---|---|---|
| academic_notes | 13 | 9 | 2.483 | 13 | 1 | 0 |
| academic_scopes | 46 | 11 | 8.057 | 46 | 0 | 0 |
| academic_terms | 3 | 8 | 13.370 | 3 | 4 | 0 |
| audit_events | 118 | 704 | 298 | 118 | 0 | 0 |
| auth_events | 41 | 75 | 81 | 65 | 1 | 24 |
| billing_orders | 6 | 587 | 1.864 | 6 | 11 | 0 |
| book_parts | 36 | 9 | 8.798 | 36 | 0 | 0 |
| book_section_topics | 160 | 36 | 11.255 | 172 | 0 | 12 |
| book_sections | 2.703 | 821 | 160.192 | 2.866 | 432 | 163 |
| book_tests | 37.302 | 45 | 618.611 | 38.047 | 0 | 745 |
| books | 183 | 10.762 | 158.140 | 183 | 204 | 0 |
| curriculum_template_items | 952 | 111 | 19.404 | 1.335 | 0 | 383 |
| curriculum_templates | 51 | 540 | 1.505 | 55 | 0 | 4 |
| deletion_requests | 0 | 4 | 7 | 0 | 0 | 0 |
| finance_lessons | 4 | 505 | 269 | 4 | 0 | 0 |
| finance_payments | 3 | 204 | 530 | 3 | 0 | 0 |
| group_sessions | 0 | 126 | 0 | 0 | 0 | 0 |
| homework_batches | 53 | 1.016 | 107.453 | 53 | 22 | 0 |
| homework_item_notes | 1 | 34 | 1.570 | 1 | 0 | 0 |
| homework_items | 1.429 | 1.711 | 1.635.294 | 1.429 | 1.240 | 0 |
| invitations | 23 | 371 | 392 | 23 | 22 | 0 |
| parent_payment_notices | 0 | 5 | 99 | 0 | 0 | 0 |
| parent_student_links | 7 | 10 | 128.287 | 8 | 0 | 0 |
| partner_commissions | 2 | 9 | 300 | 2 | 1 | 0 |
| partners | 3 | 65 | 182 | 3 | 0 | 0 |
| profiles | 21 | 139.987 | 24.682.646 | 21 | 30 | 1 |
| rate_limit_counters | 50 | 5 | 92 | 62 | 27 | 12 |
| rate_limit_salt | 1 | 1 | 294 | 1 | 0 | 0 |
| service_sessions | 32 | 85 | 1.941 | 37 | 2 | 5 |
| student_book_assignments | 100 | 2.666 | 62.077 | 103 | 60 | 0 |
| student_book_targets | 23 | 35 | 1.333 | 23 | 5 | 0 |
| student_check_in_schedules | 2 | 8 | 7.290 | 2 | 1 | 0 |
| student_check_ins | 4 | 5.729 | 6.440 | 4 | 2 | 0 |
| student_curriculum_items | 379 | 1.325 | 105.447 | 530 | 40 | 151 |
| student_day_notes | 3 | 35 | 1.698 | 3 | 2 | 0 |
| student_fees | 3 | 3 | 634 | 3 | 1 | 0 |
| student_groups | 0 | 79 | 115 | 0 | 0 | 0 |
| student_personal_items | 7 | 49 | 78 | 7 | 2 | 0 |
| student_services | 23 | 82 | 3.948 | 23 | 11 | 0 |
| student_topic_overrides | 1 | 8 | 1.221 | 1 | 0 | 0 |
| students | 26 | 9.850 | 1.907.380 | 26 | 15 | 0 |
| support_messages | 2 | 2 | 48 | 2 | 0 | 0 |
| support_tickets | 1 | 170 | 308 | 1 | 2 | 0 |
| test_completions | 1.154 | 1.517 | 2.015.131 | 1.154 | 160 | 0 |
| topic_contacts | 0 | 766 | 2 | 0 | 0 | 0 |
| topics | 1.254 | 26 | 250.960 | 1.254 | 0 | 0 |
| usage_counters | 23 | 3 | 52 | 23 | 26 | 0 |
| video_watch_marks | 0 | 172 | 15 | 0 | 0 | 0 |
| weekly_flows | 9 | 81 | 5.410 | 10 | 3 | 0 |
| weekly_plan_draft_items | 64 | 1.645 | 16.243 | 1.836 | 0 | 1.772 |
| weekly_plan_drafts | 13 | 2.079 | 1.010 | 55 | 633 | 42 |
| workspace_licenses | 2 | 26 | 18.304.402 | 4 | 4 | 0 |
| workspace_members | 28 | 10 | 22.603.173 | 30 | 2 | 2 |
| workspaces | 7 | 408.571 | 20.479.004 | 8 | 9 | 1 |

## Bu anlık görüntüden şimdiden okunan iki şey

**1. `workspaces` 7 satırlık bir tabloda 408.571 sıralı tarama aldı.** Bu bir indeks sorunu **değil**: 7 satırlık tabloda planlayıcı sıralı taramayı doğru olarak seçer, indeks eklemek işe yaramaz. Sayının söylediği şey başka — bu tablo **çok sık sorgulanıyor**. Kaynak `workspace_access_ok` / `has_workspace_role` zinciri, yani RLS politikalarının kendisi. Çözüm indekste değil, çağrı sayısında.

**2. `workspace_members` 28 satır, 22,6 milyon indeks taraması; `workspace_licenses` 2 satır, 18,3 milyon.** Aynı zincirin diğer halkaları. `092` bu çağrıları politika başına bir kez değerlendirilecek şekilde optimize etmişti; fark ölçümü o optimizasyonun bugünkü verimini gösterecek.

Üçü de PERF-01'in konusu değil — indeks eklenerek çözülmezler. Fark ölçümünün asıl sorusu bu: **üç günde bu sayılara ne ekleniyor?**
