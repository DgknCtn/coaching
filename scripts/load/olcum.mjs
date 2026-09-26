// LOAD-01 · ÖLÇÜM TOPLAYICI
//
// ============================================================
// NEDEN AYRI BİR DOSYA
//
// Yük testinin değeri ürettiği yükte değil, ölçtüğü sayıda. Denetimin
// §9'u neyin ölçüleceğini tek tek yazıyor ve bu dosya o listenin
// birebir karşılığı: p50/p95/p99, HTTP hata oranı, **42501 ve 5xx ayrı
// ayrı**.
//
// AYRI SAYMAK ŞART. `operations.md` §2'nin kuralı: "Hata oranı bir
// kapasite göstergesi değildir." 42501 bir YETKİ kusurudur — yük
// azaltmakla ya da plan yükseltmekle geçmez. 5xx güvenilirlik, 429 hız
// sınırı, zaman aşımı kapasitedir. Hepsini tek bir "hata oranı"na
// katmak, yük testinin vereceği en yanlış cevaptır: "sistem %3 hata
// veriyor, plan yükseltelim."
// ============================================================

/** Yüzdelik — dizinin SIRALI olduğu varsayılır. */
function yuzdelik(sirali, p) {
  if (sirali.length === 0) return 0
  // En yakın sıra (nearest-rank): küçük örneklemlerde enterpolasyondan
  // daha dürüst, çünkü gerçekte ölçülmüş bir değeri döndürür.
  const sira = Math.ceil((p / 100) * sirali.length) - 1
  return sirali[Math.min(Math.max(sira, 0), sirali.length - 1)]
}

export function toplayiciOlustur() {
  /** @type {Map<string, {sureler: number[], sayac: Record<string, number>}>} */
  const adimlar = new Map()

  function adim(ad) {
    let kayit = adimlar.get(ad)
    if (!kayit) {
      kayit = { sureler: [], sayac: {} }
      adimlar.set(ad, kayit)
    }
    return kayit
  }

  function say(kayit, anahtar) {
    kayit.sayac[anahtar] = (kayit.sayac[anahtar] ?? 0) + 1
  }

  return {
    /**
     * Bir isteğin sonucunu kaydeder.
     *
     * SINIFLANDIRMA BURADA YAPILIR, raporda değil: ham sayıdan sonra
     * sınıf türetmek, elde yalnız "hata" kalmasına yol açar.
     */
    kaydet({ ad, sureMs, status, code }) {
      const kayit = adim(ad)
      kayit.sureler.push(sureMs)
      say(kayit, 'istek')

      if (code === '42501') {
        say(kayit, 'yetki_42501')
      } else if (status === 0) {
        // Ağ hatası / zaman aşımı: sunucu cevap vermedi.
        say(kayit, 'ulasilamadi')
      } else if (status === 429) {
        say(kayit, 'hiz_siniri_429')
      } else if (status >= 500) {
        say(kayit, 'sunucu_5xx')
      } else if (status >= 400) {
        say(kayit, 'istemci_4xx')
      } else {
        say(kayit, 'basarili')
      }
    },

    /** Adım bazında ve toplamda rapor. */
    rapor() {
      const satirlar = []
      const toplam = { istek: 0 }

      for (const [ad, kayit] of [...adimlar.entries()].sort()) {
        const sirali = [...kayit.sureler].sort((a, b) => a - b)
        satirlar.push({
          adim: ad,
          istek: kayit.sayac.istek ?? 0,
          basarili: kayit.sayac.basarili ?? 0,
          yetki_42501: kayit.sayac.yetki_42501 ?? 0,
          sunucu_5xx: kayit.sayac.sunucu_5xx ?? 0,
          istemci_4xx: kayit.sayac.istemci_4xx ?? 0,
          hiz_siniri_429: kayit.sayac.hiz_siniri_429 ?? 0,
          ulasilamadi: kayit.sayac.ulasilamadi ?? 0,
          p50: yuzdelik(sirali, 50),
          p95: yuzdelik(sirali, 95),
          p99: yuzdelik(sirali, 99),
        })

        for (const [anahtar, deger] of Object.entries(kayit.sayac)) {
          toplam[anahtar] = (toplam[anahtar] ?? 0) + deger
        }
      }

      const tumSureler = [...adimlar.values()]
        .flatMap(k => k.sureler)
        .sort((a, b) => a - b)

      return {
        satirlar,
        toplam: {
          ...toplam,
          p50: yuzdelik(tumSureler, 50),
          p95: yuzdelik(tumSureler, 95),
          p99: yuzdelik(tumSureler, 99),
        },
      }
    },
  }
}

/** Konsola tablo basar; CI çıktısında da okunur kalsın diye sade. */
export function raporYaz(etiket, rapor) {
  console.log(`\n=== ${etiket} ===`)
  console.table(rapor.satirlar)

  const t = rapor.toplam
  console.log(
    `TOPLAM  istek=${t.istek ?? 0}  başarılı=${t.basarili ?? 0}  ` +
      `p50=${t.p50}ms  p95=${t.p95}ms  p99=${t.p99}ms`
  )
  console.log(
    `HATALAR 42501=${t.yetki_42501 ?? 0} (YETKİ)  5xx=${t.sunucu_5xx ?? 0} (GÜVENİLİRLİK)  ` +
      `4xx=${t.istemci_4xx ?? 0}  429=${t.hiz_siniri_429 ?? 0}  ulaşılamadı=${t.ulasilamadi ?? 0}`
  )

  if ((t.yetki_42501 ?? 0) > 0) {
    console.log(
      'UYARI: 42501 GÖRÜLDÜ. Bu bir kapasite sorunu DEĞİLDİR ve plan ' +
        'yükseltmekle geçmez — yük altında bir RLS yardımcısı ' +
        'çağrılamıyor demektir. Kabul kapısı bu sayı 0 olmadan geçilemez.'
    )
  }
}
