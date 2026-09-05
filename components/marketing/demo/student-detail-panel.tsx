import { StatusBadge } from '@/components/shared/status-badge'
import { ProgressBar } from '@/components/shared/progress-bar'
import { demoRelative } from '@/lib/demo-data'
import type { DemoStudent } from './demo-students'

// ÖĞRENCİ DETAYI — demo tablosunda bir satıra basınca açılan panel.
//
// ============================================================
// NEDEN VAR
//
// Demo "öğrenci listesi" gösteriyordu ama ziyaretçinin sorusu
// "öğrencimi nasıl takip edeceğim". Liste o soruyu cevaplamıyor;
// cevap, bir öğrencinin neden geride kaldığını görebilmekte.
//
// Zeynep'e basınca gecikmiş görevlerin, kitabın nerede kaldığının ve
// koç notunun aynı anda görünmesi, ürünün asıl işini tek ekranda
// anlatıyor — özellik listesinden çok daha hızlı.
//
// SUNUCU BİLEŞENİ: yalnız prop alıp çiziyor. Durum (hangi öğrenci
// seçili) üstteki TeacherDemo'da tutuluyor; bu bileşenin istemciye
// inmesi gerekmiyor.
// ============================================================

export function StudentDetailPanel({ student }: { student: DemoStudent }) {
  const weekPercent = Math.round((student.doneTasks / student.totalTasks) * 100)

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-base font-semibold tracking-tight">{student.name}</h3>
        <span className="text-sm text-muted-foreground">
          {student.grade} · {student.exam}
        </span>
        <StatusBadge status={student.status} />
        <span className="ml-auto text-xs text-muted-foreground">
          Son aktivite: {demoRelative(student.lastActiveDays)}
        </span>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bu hafta
          </p>
          <p className="mt-2 text-sm tabular-nums">
            {student.doneTasks} / {student.totalTasks} görev tamamlandı
          </p>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar
              value={weekPercent}
              label={`${student.name} haftalık ilerleme`}
              tone={student.status === 'red' ? 'destructive' : 'primary'}
              className="flex-1"
            />
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
              {weekPercent}%
            </span>
          </div>

          <p className="mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Koç notu
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{student.note}</p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Açık görevler
          </p>
          {student.tasks.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Bekleyen görev yok — hepsi zamanında tamamlandı.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {student.tasks.map((task) => (
                <li key={task.name} className="flex items-start gap-2 text-sm">
                  {/* Renk tek başına anlam taşımıyor: teslim tarihi her
                      satırda yazılı, nokta yalnız tarama hızı için. */}
                  <span
                    aria-hidden
                    className={
                      task.tone === 'red'
                        ? 'mt-1.5 size-2 shrink-0 rounded-full bg-destructive'
                        : 'mt-1.5 size-2 shrink-0 rounded-full bg-warning'
                    }
                  />
                  <span className="min-w-0">
                    {task.name}
                    <span className="block text-xs text-muted-foreground">
                      Teslim: {task.due}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Kitap ilerlemesi
          </p>
          <ul className="mt-2 space-y-3">
            {student.bookProgress.map((book) => {
              const pct = Math.round((book.done / book.total) * 100)
              return (
                <li key={book.title}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{book.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {book.done} / {book.total} · {pct}%
                    </span>
                  </div>
                  <ProgressBar
                    value={pct}
                    label={`${book.title} ilerlemesi`}
                    className="mt-1.5"
                  />
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
