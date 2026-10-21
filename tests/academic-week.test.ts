import { describe, expect, it } from 'vitest'
import { academicWeekNumber, academicWeekLabel } from '@/lib/weekly-flow'
import { shiftWeek, isoWeekKeyOfDate } from '@/lib/iso-week'

// ============================================================
// AKADEMİK HAFTA NUMARASI (M1.0-04, T04-02)
//
// NEDEN BU TEST VAR
//
// Canlı kullanım testi belgesi şu örneği veriyor: "1. Hafta ders +
// takip, 2. Hafta yalnız ders, 3. HAFTA PLAN YOK, 4. Hafta ders +
// takip." Bu, numaralandırmanın Haftalık Akış'ın o hafta açık/kapalı
// olmasına BAĞLI OLMADIĞINI, ilk takip başlangıcından itibaren
// KESİNTİSİZ ilerleyen bir takvim-haftası sayacı olduğunu kanıtlıyor —
// boş bir haftada akış kapalı olsa bile numara kaybolmuyor. Bu test
// takımının çekirdek senaryosu tam olarak bu örneği modelliyor.
//
// Önceki (elenen) tasarım `weekly_flows` satırlarının zaman aralığı
// örtüşmesine bakıyordu ve örtüşme yoksa numarayı gizliyordu — bu,
// yukarıdaki "3. Hafta plan yok" örneğiyle doğrudan çelişirdi. Bu
// yüzden tasarım basit bir "ilk akıştan beri kaç takvim haftası
// geçti" sayacına indirgendi (plan dosyasındaki düzeltme notu).
// ============================================================

describe('academicWeekNumber · PDF örneği birebir', () => {
  it('1. Hafta ders + takip, 2. Hafta yalnız ders, 3. Hafta plan yok, 4. Hafta ders + takip', () => {
    // İlk akış Pazartesi 2026-09-14 09:00'da açıldı (örnek).
    const firstFlowStartedAt = '2026-09-14T06:00:00.000Z' // Istanbul 09:00

    const week1 = isoWeekKeyOfDate('2026-09-14')
    const week2 = shiftWeek(week1, 1)
    const week3 = shiftWeek(week1, 2) // boş hafta — akış bu hafta hiç açılmamış/kapalı olabilir
    const week4 = shiftWeek(week1, 3)

    // 3. haftada weekly_flows'ta o haftaya denk gelen bir satır OLMASA
    // BİLE (örn. akış kapalı, yeni bir tane açılmadı) numara hesabı
    // yalnız firstFlowStartedAt + hedef hafta farkından geliyor —
    // weekly_flows'un o an ne durumda olduğuyla hiç ilgilenmiyor.
    expect(academicWeekNumber(firstFlowStartedAt, week1)).toBe(1)
    expect(academicWeekNumber(firstFlowStartedAt, week2)).toBe(2)
    expect(academicWeekNumber(firstFlowStartedAt, week3)).toBe(3) // "3. Hafta plan yok" — numara YİNE var
    expect(academicWeekNumber(firstFlowStartedAt, week4)).toBe(4)
  })
})

describe('academicWeekNumber · sınır durumları', () => {
  const firstFlowStartedAt = '2026-09-14T06:00:00.000Z'
  const firstWeek = isoWeekKeyOfDate('2026-09-14')

  it('takip başlamadan ÖNCEKİ hafta null döner — numara gösterilmez', () => {
    const before = shiftWeek(firstWeek, -1)
    expect(academicWeekNumber(firstFlowStartedAt, before)).toBeNull()
  })

  it('ilk akışın açıldığı haftanın kendisi her zaman 1', () => {
    expect(academicWeekNumber(firstFlowStartedAt, firstWeek)).toBe(1)
  })

  it('uzak gelecekteki bir hafta da doğru sayılır (öğretmen ileri gezinebilir)', () => {
    const farFuture = shiftWeek(firstWeek, 51)
    expect(academicWeekNumber(firstFlowStartedAt, farFuture)).toBe(52)
  })

  it('Date nesnesi de string ISO kadar kabul edilir', () => {
    expect(academicWeekNumber(new Date(firstFlowStartedAt), firstWeek)).toBe(1)
  })

  it('geçersiz tarih null döner, çökmez', () => {
    expect(academicWeekNumber('gecersiz-tarih', firstWeek)).toBeNull()
  })

  it('ilk akış hafta ortasında (Çarşamba) açılsa bile aynı haftanın Pazartesi-bazlı anahtarına 1 verir', () => {
    // Haftalık Akış öğretmenin "Haftalık Takibi Başlat" dediği ANDA
    // açılıyor — haftanın herhangi bir günü olabilir. Hafta numarası
    // yine de o ISO haftanın (Pazartesi başlangıçlı) 1. haftası olmalı.
    const wednesday = '2026-09-16T10:00:00.000Z' // aynı hafta, Çarşamba
    expect(academicWeekNumber(wednesday, firstWeek)).toBe(1)
  })
})

describe('academicWeekLabel', () => {
  it('"N. Hafta · tarih aralığı" biçimini üretir', () => {
    expect(academicWeekLabel(3, '2026-W41')).toBe('3. Hafta · 5–11 Ekim 2026')
  })

  it('weekDateRangeLabel ile aynı tarih biçimini kullanır (ay sınırı)', () => {
    expect(academicWeekLabel(7, '2026-W40')).toBe('7. Hafta · 28 Eylül – 4 Ekim 2026')
  })

  it('weekLabel ile KARIŞTIRILMAZ — takvim hafta numarası değil, verilen numara basılır', () => {
    // '2026-W41' takvimde 41. hafta ama burada akademik sayı 3 veriliyor
    // ve çıktı 3'ü basıyor, 41'i değil — iki kavram birbirine karışmıyor.
    const label = academicWeekLabel(3, '2026-W41')
    expect(label.startsWith('3. Hafta')).toBe(true)
    expect(label).not.toContain('41. Hafta')
  })
})
