import Link from 'next/link'
import { ArrowRight, CalendarRange, Check } from 'lucide-react'
import { flowDeltaLabel, type FlowScopeSummary } from '@/lib/student-overview'
import { cn } from '@/lib/utils'

// AKADEMİK AKIŞ — 7 ders tek bakışta (R7 / Site Testi 02 §2).
//
// ============================================================
// NEDEN TEK DERS YETMİYORDU
//
// Kart daha önce tek bir dersin "şu an / yaklaşan" ikilisini gösterip
// diğerlerini sayıyordu: "AYT Matematik · +2 ders daha". Belgenin
// tespiti: *"Akademik Akış birden fazla dersi tek bakışta okutacak
// yapıda değil."* Öğretmenin sorusu "bu öğrenci HER derste nerede?" ve
// tek ders bu sorunun yedide birini cevaplıyordu.
//
// ============================================================
// BU KART DÜZENLEME YAPMAZ (§2)
//
// *"Genel Bakıştan düzenleme yapılmaz; 'Tüm akışı gör' ile Müfredat
// Akışına geçilir."* Konu sırası, tarih ve tamamlandı işareti orada
// yönetiliyor; burada yalnız fotoğraf var.
//
// ============================================================
// ÜÇLÜ: TAMAMLANAN → İŞLENİYOR → SIRADAKİ
//
// Belge her derste tam olarak bunu istiyor. "İşleniyor" öğretmenin
// tamamlamadığı ilk konudur — planlanan bitişin geçmesi bir konuyu
// tamamlamaz. Alt sinyal (planla uyumlu / geride / önde) ise ayrı bir
// eksen: biri öğretmenin kararı, diğeri takvimin.

export function AcademicFlowCard({
  studentId,
  scopes,
}: {
  studentId: string
  scopes: FlowScopeSummary[]
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="font-medium">Akademik Akış</h2>
            <p className="text-xs text-muted-foreground">
              Müfredat kapsamındaki güncel durum
            </p>
          </div>
        </div>
        <Link
          href={`/teacher/students/${studentId}/curriculum`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Tüm akışı gör <ArrowRight className="inline size-3.5" />
        </Link>
      </div>

      {scopes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Henüz müfredat akışı atanmadı.
        </p>
      ) : (
        // İKİ SÜTUN (§2: "2 sütunlu minimalist düzen kullanılır; 4 + 3
        // kart doğal yerleşimdir"). Dar ekranda tek sütuna iner.
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {scopes.map(s => (
            <ScopeRow key={s.scopeId} scope={s} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ScopeRow({ scope }: { scope: FlowScopeSummary }) {
  const delta = flowDeltaLabel(scope.weeksDelta)
  const behind = scope.weeksDelta !== null && scope.weeksDelta < 0

  return (
    <li className="rounded-md border px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{scope.scopeName}</p>
        {delta && (
          <span
            className={cn(
              'shrink-0 rounded border px-1.5 py-0.5 text-[11px]',
              behind
                ? 'border-warning-border bg-warning-subtle text-warning-foreground'
                : 'border-border text-muted-foreground'
            )}
          >
            {delta}
          </span>
        )}
      </div>

      {/* Tamamlanan konu ✓ ile, güncel konu belirgin, sıradaki nötr —
          belgenin "örnek görsel dil" tarifi. */}
      {scope.previous && (
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Check className="size-3 shrink-0 text-success-foreground" aria-hidden />
          {scope.previous.topicName}
        </p>
      )}
      <p className="truncate text-sm">
        {scope.current ? (
          <>
            <span className="text-muted-foreground">→ </span>
            {scope.current.topicName}
          </>
        ) : (
          <span className="text-muted-foreground">Tüm konular tamamlandı</span>
        )}
      </p>
      {scope.next && (
        <p className="truncate text-xs text-muted-foreground">
          Sonraki: {scope.next.topicName}
        </p>
      )}
    </li>
  )
}
