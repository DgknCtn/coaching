import { demoLedger, ledgerBalance } from '../demo/tour-fixtures'
import { BrowserWindow } from './browser-window'

// FİNANS — öğrenci başına cari hesap: ders tahakkukları, tahsilat, bakiye.

const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

export function LedgerMock() {
  const rows = demoLedger()
  const balance = ledgerBalance(rows)
  return (
    <BrowserWindow
      title="Finans · Ayşe Y. cari hesabı"
      label="Öğrenci cari hesabı: yapılan derslerin tutarları, tahsilatlar ve kalan bakiye"
    >
      <div className="grid grid-cols-3 gap-px border-b bg-border text-center">
        {[
          { label: 'Yapılan ders', value: String(rows.filter(r => r.amount > 0).length) },
          { label: 'Tahsil edilen', value: tl.format(2400) },
          { label: 'Bakiye', value: tl.format(balance), tone: 'text-warning-foreground' },
        ].map(m => (
          <div key={m.label} className="bg-card px-2 py-3">
            <p className="text-[11px] text-muted-foreground">{m.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${m.tone ?? ''}`}>{m.value}</p>
          </div>
        ))}
      </div>
      <ul className="divide-y text-sm">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate">{r.label}</p>
              <p className="text-[11px] text-muted-foreground">{r.date}</p>
            </div>
            <span
              className={`shrink-0 tabular-nums ${r.amount < 0 ? 'text-success-foreground' : 'text-foreground'}`}
            >
              {r.amount < 0 ? '−' : '+'}
              {tl.format(Math.abs(r.amount))}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        Tutar yalnız siz dersi &quot;Yapıldı&quot; işaretleyince yazılır. Veli ödediğini panelden bildirir.
      </p>
    </BrowserWindow>
  )
}
