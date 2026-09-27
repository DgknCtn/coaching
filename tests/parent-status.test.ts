import { describe, expect, it } from 'vitest'
import { parentStatusBanner } from '@/lib/parent-status'

// VELİ EKRANI ÜST ÖZETİ (PRD · B01, B08)
//
// NEDEN BU TEST VAR: bu karar eskiden sayfanın gövdesinde iki satırdı
// ve ödev sorgusu düştüğünde veliye "Her şey yolunda" gösteriyordu.
// Hata sessizce 0'a dönüşüyor, 0 da "gecikme yok" okunuyordu.
//
// Bu dosyanın en önemli iddiası tek: **bilinmeyen durumdan olumlu özet
// üretilmez.** Diğer testler o iddianın komşuları.

describe('parentStatusBanner · bilinmeyen durum', () => {
  it('ödev durumu alınamadıysa olumlu özet ÜRETMEZ — kitaplar gelmiş olsa bile', () => {
    // KUSURUN TAM TEKRARI: eski kodda bu girdi "Her şey yolunda" veriyordu.
    // Kitap verisi var (etkinlik var gibi görünüyor), ödev sorgusu düşmüş
    // (gecikme 0 gibi görünüyordu).
    expect(parentStatusBanner(null, 5)).toEqual({ kind: 'unknown' })
  })

  it('ödev durumu alınamadıysa gecikme uyarısı da vermez', () => {
    // "Bilinmiyor" iki yönde de geçerli: olmayan bir gecikmeyi iddia
    // etmek de yalandır.
    const sonuc = parentStatusBanner(null, null)
    expect(sonuc.kind).toBe('unknown')
    expect(sonuc.kind).not.toBe('overdue')
  })

  it('kitap sayısı bilinmiyor ve ödev grubu yoksa olumlu özet göstermez', () => {
    // Ödev durumu biliniyor (grup yok), ama etkinlik bilinmiyor. "Gecikmiş
    // çalışma görünmüyor" demek için ortada görünen bir çalışma olmalı.
    expect(parentStatusBanner({ overdue: 0, open: 0, total: 0 }, null)).toEqual({ kind: 'none' })
  })
})

describe('parentStatusBanner · bilinen durum', () => {
  it('gecikme varsa sayısıyla uyarır', () => {
    expect(parentStatusBanner({ overdue: 2, open: 3, total: 5 }, 4)).toEqual({
      kind: 'overdue',
      count: 2,
    })
  })

  it('gecikme uyarısı kitap verisi gelmese de verilir', () => {
    // Gecikme sayısı biliniyorsa, kitap sorgusunun düşmesi onu
    // geçersiz kılmaz — ikisi bağımsız bilgi.
    expect(parentStatusBanner({ overdue: 1, open: 1, total: 1 }, null)).toEqual({
      kind: 'overdue',
      count: 1,
    })
  })

  it('gecikme yok ve ödev grubu varsa olumlu özet verir', () => {
    expect(parentStatusBanner({ overdue: 0, open: 2, total: 4 }, 0)).toEqual({
      kind: 'noOverdue',
      open: 2,
    })
  })

  it('ödev grubu yok ama kitap varsa olumlu özet verir', () => {
    expect(parentStatusBanner({ overdue: 0, open: 0, total: 0 }, 3)).toEqual({
      kind: 'noOverdue',
      open: 0,
    })
  })

  it('hiç etkinlik yoksa hiçbir şey söylemez', () => {
    // Boş bir hesapta "gecikme yok" demek teknik olarak doğru ama
    // anlamsız bir güvence olur.
    expect(parentStatusBanner({ overdue: 0, open: 0, total: 0 }, 0)).toEqual({ kind: 'none' })
  })
})
