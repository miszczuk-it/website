export function TrafficSection() {
  return (
    <section aria-labelledby="traffic-heading" className="mt-16 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="traffic-heading" className="text-2xl font-bold tracking-tight text-white">
          Pomiar ruchu drogowego
        </h2>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
          Radar: w przygotowaniu
        </span>
      </div>

      <p className="mt-4 max-w-2xl text-slate-300">
        Integracja urządzenia radarowego jest w przygotowaniu. Po uruchomieniu czujnika ta sekcja będzie prezentować
        natężenie ruchu i prędkość pojazdów w czasie rzeczywistym. Czujnik środowiskowy ESP32 (temperatura,
        wilgotność, ciśnienie, światło) działa już produkcyjnie — patrz sekcje powyżej.
      </p>
    </section>
  )
}
