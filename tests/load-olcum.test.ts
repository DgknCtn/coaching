import { describe, expect, it } from 'vitest'
// Koşumcu bilinçli olarak tipsiz .mjs: staging'de derleme adımı olmadan
// `node scripts/load/run.mjs` ile koşabilmeli.
import { toplayiciOlustur } from '../scripts/load/olcum.mjs'

// Koşumcu tipsiz olduğu için rapor şekli burada YAZILI. Bu bir zorunluluk
// değil, kasıt: sayaç adları ölçümün sözleşmesi ve o sözleşme bir yerde
// açıkça durmalı. `olcum.mjs`'te bir sayaç adı değişirse bu tip derlemede
// patlar; sessizce sıfır okunan bir sayaçtan iyidir.
interface Sayaclar {
  istek: number
  basarili?: number
  yetki_42501?: number
  sunucu_5xx?: number
  istemci_4xx?: number
  hiz_siniri_429?: number
  ulasilamadi?: number
  p50: number
  p95: number
  p99: number
}

interface Rapor {
  satirlar: (Sayaclar & { adim: string })[]
  toplam: Sayaclar
}

// LOAD-01 · ÖLÇÜM TOPLAYICISININ KENDİSİ DOĞRU MU
//
// ============================================================
// NEDEN BU TEST VAR
//
// Yük testi henüz koşulmadı (staging yok) ve koşulduğunda tek çıktısı
// bu toplayıcının ürettiği sayılar olacak. Yanlış sınıflandıran bir
// toplayıcı, yük testinin verebileceği en pahalı yanlış cevabı üretir:
// "%3 hata var, plan yükseltelim."
//
// `operations.md` §2'nin kuralı ölçümün içine gömülü: 42501 YETKİ
// kusurudur, 5xx GÜVENİLİRLİK, 429 hız sınırı, cevapsızlık kapasite.
// Bu test o ayrımın kodda gerçekten yapıldığını doğruluyor — koşumdan
// önce, çünkü koşum sırasında fark edilirse ölçüm baştan yapılır.
//
// Ağ yok, kimlik bilgisi yok: her koşuda çalışır, CI'da atlanmaz.
// ============================================================

describe('LOAD-01 · ölçüm sınıflandırması', () => {
  it('42501 yetki kusuru olarak ayrı sayılır, hata yığınına karışmaz', () => {
    const t = toplayiciOlustur()

    // 403 + 42501: durum kodu "yasak" ama SEBEP yetki kusuru. Sınıf
    // hata kodundan türetilmeli, durum kodundan değil.
    t.kaydet({ ad: 'a', sureMs: 10, status: 403, code: '42501' })
    t.kaydet({ ad: 'a', sureMs: 10, status: 200, code: null })

    const { toplam } = t.rapor() as Rapor
    expect(toplam.yetki_42501).toBe(1)
    expect(toplam.basarili).toBe(1)
    // 4xx yığınına DA sayılmamalı: iki yerde sayılan bir hata, hata
    // oranını şişirir ve kapasite kararını bozar.
    expect(toplam.istemci_4xx ?? 0).toBe(0)
  })

  it('5xx, 4xx, 429 ve cevapsızlık birbirinden ayrı', () => {
    const t = toplayiciOlustur()
    t.kaydet({ ad: 'a', sureMs: 1, status: 500, code: null })
    t.kaydet({ ad: 'a', sureMs: 1, status: 404, code: 'PGRST205' })
    t.kaydet({ ad: 'a', sureMs: 1, status: 429, code: null })
    t.kaydet({ ad: 'a', sureMs: 1, status: 0, code: null })

    const { toplam } = t.rapor() as Rapor
    expect(toplam.sunucu_5xx).toBe(1)
    expect(toplam.istemci_4xx).toBe(1)
    expect(toplam.hiz_siniri_429).toBe(1)
    expect(toplam.ulasilamadi).toBe(1)
    expect(toplam.istek).toBe(4)
  })

  it('yüzdelikler gerçekten ölçülmüş bir değeri döndürür', () => {
    const t = toplayiciOlustur()
    for (const ms of [10, 20, 30, 40, 50, 60, 70, 80, 90, 1000]) {
      t.kaydet({ ad: 'a', sureMs: ms, status: 200, code: null })
    }

    const { toplam } = t.rapor() as Rapor
    // En yakın sıra: enterpolasyon yok, yani p99 gerçekte görülmüş en
    // kötü değeri gösterir. Küçük örneklemde enterpolasyon, olmayan bir
    // gecikmeyi rapor etmek olurdu.
    expect(toplam.p50).toBe(50)
    expect(toplam.p95).toBe(1000)
    expect(toplam.p99).toBe(1000)
  })

  it('adımlar ayrı ayrı raporlanır — hangi sayfanın yavaşladığı görünür', () => {
    const t = toplayiciOlustur()
    t.kaydet({ ad: '09_finans', sureMs: 900, status: 200, code: null })
    t.kaydet({ ad: '03_panel', sureMs: 100, status: 200, code: null })

    const { satirlar } = t.rapor() as Rapor
    expect(satirlar.map(s => s.adim)).toEqual(['03_panel', '09_finans'])
    expect(satirlar[1].p95).toBe(900)
  })

  it('hiç istek yoksa sıfır döner, patlamaz', () => {
    // Koşum kimlik doğrulamada patlarsa rapor yine basılır; o anda
    // yüzdelik hesabı çökerse gerçek hata mesajı kaybolur.
    const { toplam, satirlar } = toplayiciOlustur().rapor() as Rapor
    expect(satirlar).toHaveLength(0)
    expect(toplam.p95).toBe(0)
  })
})
