# Yedekten geri yükleme — runbook

**Bu belge olay anında okunur.** O yüzden kısa, sıralı ve kopyala-çalıştır biçiminde. Gerekçeler en sonda.

**Yedek nerede:** `DgknCtn/coaching-yedek` deposunun **Releases** bölümü. Her gece 03:00'te (TRT) bir release: `yedek-YYYY-MM-DD`, içinde tek dosya `yedek-YYYY-MM-DD.dump.gpg`.
**Parola:** `YEDEK_GPG_PAROLA` (GitHub secret + parola yöneticisi). **Bu parola olmadan yedek açılamaz.**
**Saklama:** 30 gün. 31 gün önceki bir veri kaybı geri alınamaz.

---

## 1. Yedeği indir ve aç

```bash
# Release'ten indir (gh CLI ile)
gh release download yedek-2026-09-27 --repo DgknCtn/coaching-yedek

# Şifreyi çöz — parola sorulacak
gpg --decrypt --output yedek.dump yedek-2026-09-27.dump.gpg

# İçeriği gör: hangi tablolar, veri var mı
pg_restore -l yedek.dump | grep -c 'TABLE DATA public'   # 50+ olmalı
pg_restore -l yedek.dump | grep 'TABLE DATA auth users'  # hesaplar burada
```

## 2. AYRI bir projeye yükle — üretimin üzerine ASLA

```bash
# Yeni bir Supabase projesi açılır, bağlantı dizesi alınır (pooler, 5432)
HEDEF='postgresql://postgres.<yeni-ref>:<sifre>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'

pg_restore --dbname="$HEDEF" \
  --no-owner \
  --clean --if-exists \
  --verbose \
  yedek.dump
```

`--no-owner` **burada** kullanılıyor (dökümde kullanılmadı): yeni projede rol adları aynı ama sahiplik `supabase_admin`'e ait nesnelerde çakışır. Yetkiler (`GRANT`) dökümde duruyor ve geri yüklenir — kritik olan o.

Hatalar normaldir: `extension "pgcrypto" already exists`, `role "supabase_admin" does not exist` gibi satırlar Supabase'in kendi kurduğu nesnelerden gelir. **Ama `ERROR` satırlarını okumadan geçme:** `public` şemadaki bir tabloya ait hata, o tablonun geri yüklenmemiş olduğu anlamına gelir.

## 3. Doğrula — "veri yerinde" yetmez

```bash
# Tablo ve satır sayıları
psql "$HEDEF" -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'"      # 54
psql "$HEDEF" -c "SELECT count(*) FROM students"
psql "$HEDEF" -c "SELECT count(*) FROM auth.users"                                # 0 OLMAMALI

# RLS ve yetkiler — asıl kontrol burada
psql "$HEDEF" -c "SELECT count(*) FROM pg_policies WHERE schemaname='public'"      # ~99
psql "$HEDEF" -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'"  # ~166
psql "$HEDEF" -c "SELECT has_function_privilege('anon','public.my_workspace_ids(text[])','EXECUTE')"  # true OLMALI
```

Son satır tek başına en değerli kontrol: `false` dönerse geri yüklenen sistemde **oturumsuz her sorgu 42501 verir** — giriş, davet ve sağlık kontrolü dahil. Bu, `108`'in kapattığı kusurun aynısı ve hiçbir ekranı bozmadan aylarca sürebiliyor.

Ardından üç test yeni projeye karşı koşulur:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<yeni-ref>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<yeni-anon-key> \
ALLOW_LIVE_RLS_TESTS=1 \
  npx vitest run tests/anon-endpoint-probe.test.ts tests/tenant-isolation.test.ts tests/cross-tenant.test.ts
```

| Test | Neyi kanıtlar |
|---|---|
| `anon-endpoint-probe` | 38 tablo + 11 RLS yardımcısı çalışıyor — **yetkiler geldi** |
| `tenant-isolation` | Kapalı olması gereken 16 view ve 16 tablo kapalı |
| `cross-tenant` | İki kiracı birbirinin verisini göremiyor (iki test hesabı gerekir) |

## 4. Ölç ve yaz

| Ölçü | Anlamı | Değer |
|---|---|---|
| **RTO** | 1. adımın başından 3. adımın sonuna kadar geçen süre | `______` |
| **RPO** | Olay anı ile kullanılan yedeğin alınma anı arasındaki fark | `______` |

Bu iki sayı ölçülmeden tatbikat tamamlanmış sayılmaz. Bugünkü tasarımda **RPO en kötü durumda 24 saattir** (gece yedeği; gün içi bir noktaya dönmek mümkün değil, o PITR gerektirir ve PITR Pro planın ek özelliği).

## 5. Üretime dönüş

Geri yükleme doğrulandıktan sonra iki yol var ve seçim **veri kaybının boyutuna** bağlıdır:

- **Yeni projeyi üretim yapmak:** Vercel'deki `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` yeni projeye çevrilir, `SUPABASE_SERVICE_ROLE_KEY` ve `YEDEK_DB_URL` de güncellenir. Eski projedeki yedek işi yeni projeyi yedeklemeye başlar — **bu adım atlanırsa yeni üretim yedeksiz kalır.**
- **Eski projeye seçmeli geri alma:** yalnız kaybedilen tablo(lar) taşınır (`pg_restore --table=...`). Daha az kesinti, ama ilişkisel tutarlılık elle kontrol edilmeli.

---

## Tatbikat — yılda en az bir kez

**Denenmemiş yedek, yedek değildir.** İlk tatbikat: **2026 Aralık ilk haftası**. Yukarıdaki 1–4 adımları koşulur, RTO/RPO yazılır, bu belge güncellenir.

Tatbikatta en sık atlanan şey 3. adımın ikinci yarısıdır: veri sayıları doğru çıktığı için "yedek sağlam" denip yetkilere bakılmaması. Bu depoda yetki kusurunun ne kadar sessiz olabildiği ölçülerek görüldü — `anon-endpoint-probe` testi tam bu yüzden listede.

## KVKK notu

30 gün saklama, **silinmesi gereken kişisel verinin yedeklerde 30 gün daha yaşadığı** anlamına gelir. Bir kullanıcı silme talebi geldiğinde:

- Canlı veritabanından silinir (`deletion_requests` akışı).
- Yedeklerden **silinmez** — şifreli dökümü açıp düzenlemek yedeğin bütünlüğünü bozar.
- Talep tarihinden 30 gün sonra o kişiye ait veri hiçbir yedekte kalmaz, çünkü o günün yedeği artık silinmiştir.

Gizlilik metninde giriş kayıtları için 90 günlük temizlik yazıyor (`093`); yedek penceresi 30 gün olduğu için onunla çelişmiyor.

## Neden bu tasarım

| Karar | Gerekçe |
|---|---|
| Yedek **private** ayrı depoda | Kod deposu public; public depoda Actions çıktılarını herkes indirebilir. Öğrenci, veli ve finans verisi açık internete konamaz |
| **Şifreli** (AES-256) | Private depo da yeterli güvence değil: sızan bir token ya da yanlış bir izin ayarı, açık dökümü doğrudan okunabilir kılar |
| **Release varlığı**, commit değil | Günlük 5 MB'lık dosyayı commit etmek geçmişi yılda ~1,8 GB şişirir ve silmek geçmişi küçültmez |
| Dökümde **yetkiler var** (`--no-owner` yok) | Yetkisi eksik bir yedek, geri yüklendiğinde "veri yerinde" diye onaylanıp izinleri bozuk kalır |
| `auth` şeması dahil | Hesapsız bir yedekle geri yüklenen sisteme kimse giriş yapamaz |
| Betikte **altı denetim** | Sessizce başarısız olan yedek, olmayan yedekten kötüdür — çünkü var sanılır. Denetimlerin kendisi `scripts/yedek/denetim-testi.sh` ile kasten bozulmuş girdilerle sınanıyor |
| Başarısızlık = e-posta | GitHub başarısız zamanlanmış koşuyu depo sahibine bildirir; alarmın sahibi kendiliğinden belli (`operations.md` §2) |
