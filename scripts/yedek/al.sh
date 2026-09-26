#!/usr/bin/env bash
#
# GECE YEDEĞİ — DÖKÜM AL, ŞİFRELE, GERİ AÇILABİLDİĞİNİ DOĞRULA
#
# ============================================================
# NEDEN BU BETİK VAR
#
# Proje Supabase Free planda ve Free planda OTOMATİK YEDEK YOK. Yani
# veritabanı bugün kaybedilse (yanlış silme, bozuk migration, hesap
# sorunu, 7 günlük hareketsizlikte askıya alınma) geri dönülecek nokta
# yoktu: RTO ve RPO sonsuzdu. `operations.md` §4 bu riski yazıyor.
#
# Dış denetim bunu göremezdi: şema, yetkiler ve performans yerinde;
# eksik olan bir plan özelliğiydi.
#
# ============================================================
# KURAL: SESSİZCE BAŞARISIZ OLAN YEDEK, OLMAYAN YEDEKTEN KÖTÜDÜR
#
# Çünkü var sanılır. Bu yüzden betik altı ayrı denetimden geçiyor ve
# HERHANGİ biri tutmazsa hata verip duruyor. Bu turda üç kez görüldü ki
# bir arıza hiçbir ekranı bozmadan aylarca sürebiliyor (hız sınırı iki
# ay çalışmadı, anon sorguları iki ay patladı, lisans kapısı RLS'ten
# düşmüştü). Yedek, bu sınıfın en pahalı hâli olurdu.
#
# ============================================================
# ROL SEÇİMİ ÖNEMLİ — `iz_readonly` KULLANILAMAZ
#
# Ölçüldü: `iz_readonly` rolünde `rolbypassrls = false`. O rolle alınan
# döküm, RLS politikaları satırları süzdüğü için SESSİZCE EKSİK olur —
# hata vermez, yalnız az veri taşır. Döküm `postgres` rolüyle alınır
# (`rolbypassrls = true`).
#
# ============================================================
# BAĞLANTI: POOLER, DOĞRUDAN HOST DEĞİL
#
# Supabase'in doğrudan veritabanı hostu IPv6; GitHub koşucularında IPv6
# yok. Bu yüzden pooler kullanılıyor ve PORT 5432 (session modu) şart —
# 6543 (transaction modu) `pg_dump` ile çalışmaz.
#
# ============================================================
# KULLANIM
#
#   YEDEK_DB_URL='postgresql://postgres.<ref>:<sifre>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres' \
#   YEDEK_GPG_PAROLA='...' \
#   bash scripts/yedek/al.sh
#
# Çıktı: <cikti-dizini>/yedek-YYYY-MM-DD.dump.gpg
# Seçimlik: YEDEK_CIKTI_DIZINI (varsayılan ./yedek-cikti)
# ============================================================

# `pipefail` şart: `pg_dump | gpg` zincirinde pg_dump patlarsa gpg
# başarılı dönebilir ve boş bir dosya "başarılı yedek" sayılır.
set -euo pipefail

# ============================================================
# SIR LOGLANMAZ
#
# `set -x` KULLANILMIYOR. Bu betik public bir depoda, public Actions
# loglarıyla koşuyor: izleme açık olsaydı bağlantı dizesi (şifre dahil)
# ve GPG parolası loglara düşerdi.
# ============================================================

hata() {
  echo "YEDEK BAŞARISIZ: $*" >&2
  exit 1
}

# ------------------------------------------------------------
# 0) Ortam ve araç denetimi
# ------------------------------------------------------------
: "${YEDEK_DB_URL:?YEDEK_DB_URL tanımlı değil}"
: "${YEDEK_GPG_PAROLA:?YEDEK_GPG_PAROLA tanımlı değil}"

CIKTI_DIZINI="${YEDEK_CIKTI_DIZINI:-./yedek-cikti}"
GUN="$(date -u +%Y-%m-%d)"
DOKUM="${CIKTI_DIZINI}/yedek-${GUN}.dump"
SIFRELI="${DOKUM}.gpg"

command -v pg_dump >/dev/null || hata 'pg_dump bulunamadı (postgresql-client kurulu mu?)'
command -v pg_restore >/dev/null || hata 'pg_restore bulunamadı'
command -v gpg >/dev/null || hata 'gpg bulunamadı'

# SÜRÜM DENETİMİ. Sunucu PostgreSQL 17.6; pg_dump'ın ana sürümü
# sunucudan KÜÇÜK olamaz. `ubuntu-latest` 16 ile geliyor ve bu denetim
# olmasa hata mesajı "server version mismatch" olarak en sonda,
# anlaşılmaz biçimde gelirdi.
ISTEMCI_SURUM="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
[ "${ISTEMCI_SURUM}" -ge 17 ] || hata "pg_dump sürümü ${ISTEMCI_SURUM}; sunucu 17 — 17+ istemci gerekiyor"

mkdir -p "${CIKTI_DIZINI}"

# ------------------------------------------------------------
# 1) DÖKÜM
#
# ŞEMALAR: public + auth + storage.
#   - public:  uygulamanın tamamı
#   - auth:    KULLANICI HESAPLARI. Bu şema olmadan geri yüklenen bir
#              veritabanına KİMSE GİRİŞ YAPAMAZ — veri yerinde görünür,
#              sistem kullanılamaz.
#   - storage: dosya üst verisi (bugün boş olabilir; ileride dolarsa
#              kapsam dışı kalmasın)
#
# `--no-owner` / `--no-privileges` KULLANILMIYOR.
# Bu turun dersi: bir yetki kusuru hiçbir ekranı bozmadan aylarca
# sürebiliyor (108, 109). Yetkileri taşımayan bir yedek, geri
# yüklendiğinde "veri yerinde" diye onaylanır ve izinleri bozuk kalır.
# GRANT'ler yedeğin parçasıdır.
#
# `-Fc` (custom, sıkıştırılmış): pg_restore ile seçmeli geri yükleme
# yapılabilir ve içeriği `pg_restore -l` ile DENETLENEBİLİR — düz SQL
# dökümünde bu denetimler grep'e kalırdı.
# ------------------------------------------------------------
echo "1/6 Döküm alınıyor (public + auth + storage)..."
pg_dump "${YEDEK_DB_URL}" \
  --format=custom \
  --compress=9 \
  --schema=public \
  --schema=auth \
  --schema=storage \
  --file="${DOKUM}" \
  || hata 'pg_dump başarısız (bağlantı dizesi ve pooler portu 5432 mi?)'

# ------------------------------------------------------------
# 2) BOYUT DENETİMİ
#
# 200 baytlık "başarılı" bir döküm, sessiz başarısızlığın en sinsi
# biçimi. Veritabanı 33 MB; sıkıştırılmış döküm birkaç MB olmalı.
# ------------------------------------------------------------
BOYUT="$(wc -c < "${DOKUM}" | tr -d ' ')"
echo "2/6 Boyut: $((BOYUT / 1024)) KB"
[ "${BOYUT}" -ge 1048576 ] || hata "döküm 1 MB'ın altında (${BOYUT} bayt) — eksik ya da boş"

# İçerik listesi bir kez üretilip üç denetimde kullanılıyor.
ICERIK="${CIKTI_DIZINI}/.icerik-${GUN}.txt"
pg_restore -l "${DOKUM}" > "${ICERIK}" || hata 'döküm okunamıyor — bozuk'

# ------------------------------------------------------------
# 3) TABLO SAYISI DENETİMİ
#
# Bugün public şemada 54 tablo var. Eşik 50: tablo eklenmesi testi
# kırmaz, ama dökümün yarısının kaybolması kırar.
#
# NEDEN `TABLE DATA` ve `TABLE` DEĞİL: şema girdisi veri olmadan da
# yazılır. Ölçmek istediğimiz şey VERİNİN orada olması.
# ------------------------------------------------------------
TABLO="$(grep -c 'TABLE DATA public' "${ICERIK}" || true)"
echo "3/6 public veri girdisi: ${TABLO}"
[ "${TABLO}" -ge 50 ] || hata "dökümde yalnız ${TABLO} public tablo verisi var (50+ bekleniyor) — RLS'i atlamayan bir rolle mi bağlandı?"

# ------------------------------------------------------------
# 4) HESAP DENETİMİ — EN KOLAY GÖZDEN KAÇAN
#
# `auth.users` dökümde yoksa yedek işe yaramaz: geri yüklenen sistemde
# hiç kullanıcı olmaz. `postgres` rolünün auth şemasını okuyabildiği
# canlıdan doğrulanamadı (salt okunur rol o şemaya kapalı), bu yüzden
# denetim ÇALIŞMA ZAMANINDA yapılıyor.
# ------------------------------------------------------------
echo "4/6 Hesap tablosu denetleniyor..."
grep -q 'TABLE DATA auth users' "${ICERIK}" \
  || hata 'dökümde auth.users YOK — bu yedekle geri yüklenen sisteme kimse giriş yapamaz'

# ------------------------------------------------------------
# 5) ŞİFRELEME
#
# Yedek private bir depoda duracak, ama şifreleme yine de zorunlu:
# içeriği reşit olmayan öğrencilerin kişisel verisi, veli ödeme kaydı ve
# finans verisi. Tek bir yanlış izin ayarı ya da sızan bir token, açık
# bir dökümü doğrudan okunabilir kılardı. Şifreli döküm o senaryoda da
# okunamaz.
#
# Parola `--passphrase-file` ile boru üzerinden veriliyor: komut
# satırında yazılsa süreç listesinde görünürdü.
# ------------------------------------------------------------
echo "5/6 Şifreleniyor (AES-256)..."
printf '%s' "${YEDEK_GPG_PAROLA}" | gpg --batch --yes --quiet \
  --symmetric --cipher-algo AES256 \
  --passphrase-fd 0 \
  --output "${SIFRELI}" \
  "${DOKUM}" \
  || hata 'gpg şifreleme başarısız'

# ------------------------------------------------------------
# 6) GERİ AÇILABİLİRLİK DENETİMİ — EN KRİTİK ADIM
#
# "Denenmemiş yedek, yedek değildir" (operations.md §4). Bu denetim
# olmadan sistem 30 gün boyunca açılamayan dosyalar üretip her sabah
# yeşil görünebilirdi — ve bunu ancak gerçek bir olay anında
# öğrenirdik.
#
# Şifreli dosya geri çözülüyor ve pg_restore ile OKUNUYOR. Yalnız
# çözmek yetmez: çözülen şeyin geçerli bir döküm olduğu da görülmeli.
# ------------------------------------------------------------
echo "6/6 Geri açılabilirlik doğrulanıyor..."
KONTROL="${CIKTI_DIZINI}/.kontrol-${GUN}.dump"
printf '%s' "${YEDEK_GPG_PAROLA}" | gpg --batch --yes --quiet \
  --decrypt --passphrase-fd 0 \
  --output "${KONTROL}" \
  "${SIFRELI}" \
  || hata 'şifreli yedek GERİ AÇILAMADI'

pg_restore -l "${KONTROL}" > /dev/null \
  || hata 'geri açılan dosya geçerli bir döküm değil'

# Ara dosyalar silinir: şifresiz döküm diskte kalmamalı.
rm -f "${DOKUM}" "${KONTROL}" "${ICERIK}"

echo
echo "YEDEK HAZIR: ${SIFRELI} ($((BOYUT / 1024)) KB şifresiz, ${TABLO} tablo, auth.users içeriyor)"
echo "Geri yükleme: docs/production-readiness/yedek-geri-yukleme.md"
