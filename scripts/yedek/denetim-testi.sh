#!/usr/bin/env bash
#
# YEDEK BETİĞİNİN DENETİMLERİ GERÇEKTEN ÇALIŞIYOR MU
#
# ============================================================
# NEDEN BU TEST VAR
#
# `al.sh` altı denetim içeriyor ve hepsinin varlık sebebi aynı: sessizce
# başarısız olan bir yedek, olmayan yedekten kötüdür. Ama denetimlerin
# KENDİSİ de sessizce çalışmayabilir — bir `grep` deseni yanlış yazılsa
# ya da `set -e` bir yerde devre dışı kalsa, betik her gece "YEDEK
# HAZIR" yazıp çöp üretir.
#
# Bu turda üç kez görüldü: yeşil yanan bir kontrol, hiç olmayan bir
# kontroldan daha tehlikeli (hız sınırı iki ay "çalışıyor" göründü).
# Bu yüzden her denetim, KASTEN bozulmuş bir girdiyle kırmızıya
# düşürülüyor.
#
# ============================================================
# VERİTABANI GEREKTİRMEZ
#
# `pg_dump` ve `pg_restore` PATH'in başına konan taklitlerle
# değiştiriliyor. Böylece test hem canlıya dokunmuyor hem de
# PostgreSQL istemcisi kurulu olmayan makinede (geliştiricinin
# Windows'u) koşuyor. Ölçtüğü şey betiğin KARAR MANTIĞI — dökümün
# kendisi değil; onu canlı koşu doğruluyor.
#
# KULLANIM: bash scripts/yedek/denetim-testi.sh
# ============================================================

set -uo pipefail

BETIK="$(cd "$(dirname "$0")" && pwd)/al.sh"
GECICI="$(mktemp -d)"
trap 'rm -rf "${GECICI}"' EXIT

GECTI=0
KALDI=0

# ------------------------------------------------------------
# Taklit binary üreticisi.
#
# `pg_dump`: verilen bayt sayısında dosya yazar.
# `pg_restore`: `-l` çağrısında verilen içerik listesini basar.
# `gpg`: GERÇEĞİ kullanılır — şifreleme ve geri açma yolu taklit
#        edilseydi, testin en önemli iddiası (geri açılabiliyor)
#        ölçülmemiş olurdu.
# ------------------------------------------------------------
stub_kur() {
  local dizin="$1" bayt="$2" liste="$3" surum="${4:-17.6}"
  mkdir -p "${dizin}"

  cat > "${dizin}/pg_dump" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "--version" ]; then echo "pg_dump (PostgreSQL) ${surum}"; exit 0; fi
hedef=""
for arg in "\$@"; do case "\$arg" in --file=*) hedef="\${arg#--file=}";; esac; done
[ -n "\$hedef" ] || exit 1
head -c ${bayt} /dev/zero | tr '\\0' 'x' > "\$hedef"
STUB

  cat > "${dizin}/pg_restore" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "-l" ]; then cat "${liste}"; fi
exit 0
STUB

  chmod +x "${dizin}/pg_dump" "${dizin}/pg_restore"
}

# Gerçekçi bir içerik listesi üretir.
liste_yaz() {
  local dosya="$1" tablo_sayisi="$2" auth_var="$3"
  : > "${dosya}"
  for i in $(seq 1 "${tablo_sayisi}"); do
    echo "${i}; 0 0 TABLE DATA public tablo_${i} postgres" >> "${dosya}"
  done
  if [ "${auth_var}" = "evet" ]; then
    echo "900; 0 0 TABLE DATA auth users supabase_auth_admin" >> "${dosya}"
  fi
}

# Bir senaryo koşar ve beklenen sonucu doğrular.
#   sonuc: "basarili" | "hata"
#   desen: hata mesajında aranacak metin (yalnız "hata" için)
senaryo() {
  local ad="$1" sonuc="$2" desen="$3" bayt="$4" tablo="$5" auth="$6" surum="${7:-17.6}"

  local kok="${GECICI}/$(echo "${ad}" | tr -c 'a-zA-Z0-9' '_')"
  local stub="${kok}/bin" liste="${kok}/liste.txt" cikti="${kok}/cikti"
  mkdir -p "${kok}"
  liste_yaz "${liste}" "${tablo}" "${auth}"
  stub_kur "${stub}" "${bayt}" "${liste}" "${surum}"

  local log="${kok}/log.txt"
  set +e
  PATH="${stub}:${PATH}" \
  YEDEK_DB_URL='postgresql://taklit' \
  YEDEK_GPG_PAROLA='test-parolasi-12345' \
  YEDEK_CIKTI_DIZINI="${cikti}" \
    bash "${BETIK}" > "${log}" 2>&1
  local kod=$?
  set -e

  if [ "${sonuc}" = "basarili" ]; then
    if [ "${kod}" -eq 0 ]; then
      # Şifreli dosya gerçekten oluşmalı ve şifresiz döküm SİLİNMİŞ olmalı.
      if ls "${cikti}"/yedek-*.dump.gpg >/dev/null 2>&1 &&
         ! ls "${cikti}"/yedek-*.dump >/dev/null 2>&1; then
        echo "  GEÇTİ  ${ad}"
        GECTI=$((GECTI + 1))
      else
        echo "  KALDI  ${ad}: çıktı dosyaları beklendiği gibi değil"
        ls -la "${cikti}" >&2
        KALDI=$((KALDI + 1))
      fi
    else
      echo "  KALDI  ${ad}: hata verdi (kod ${kod})"
      sed 's/^/         /' "${log}" >&2
      KALDI=$((KALDI + 1))
    fi
    return
  fi

  if [ "${kod}" -eq 0 ]; then
    echo "  KALDI  ${ad}: BAŞARILI döndü — denetim çalışmıyor!"
    KALDI=$((KALDI + 1))
  elif grep -qF "${desen}" "${log}"; then
    echo "  GEÇTİ  ${ad}"
    GECTI=$((GECTI + 1))
  else
    echo "  KALDI  ${ad}: hata verdi ama beklenen mesaj değil (\"${desen}\")"
    sed 's/^/         /' "${log}" >&2
    KALDI=$((KALDI + 1))
  fi
}

echo "YEDEK DENETİMLERİ — kasten bozulmuş girdilerle"
echo

# 1) Mutlu yol. Diğer senaryoların anlamlı olması buna bağlı: bu
#    geçmezse hepsi "her şey hata veriyor" diye yeşil yanar.
senaryo 'saglam dokum sifrelenir ve geri acilir' basarili '' 2097152 54 evet

# 2) Boyut denetimi. 200 baytlık "başarılı" döküm.
senaryo 'kucuk dokum reddedilir' hata "1 MB'ın altında" 1024 54 evet

# 3) Tablo sayısı denetimi. RLS'i atlamayan bir rolle bağlanıldığında
#    görülecek tablo: az sayıda ve sessizce eksik.
senaryo 'eksik tablo reddedilir' hata 'public tablo verisi var' 2097152 10 evet

# 4) Hesap denetimi. Dökümde auth.users yok — geri yüklenen sisteme
#    kimse giriş yapamaz.
senaryo 'auth.users olmayan dokum reddedilir' hata 'auth.users YOK' 2097152 54 hayir

# 5) Sürüm denetimi. ubuntu-latest'in varsayılanı PG 16; sunucu 17.
senaryo 'eski pg_dump reddedilir' hata '17+ istemci gerekiyor' 2097152 54 evet 16.3

echo
echo "SONUÇ: ${GECTI} geçti, ${KALDI} kaldı"
[ "${KALDI}" -eq 0 ] || exit 1
