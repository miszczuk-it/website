import { Link } from '../router'

export function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-400">miszczuk.it</span>
        <Link to="/road-monitor" className="text-sm text-slate-300 transition-colors hover:text-sky-400">
          IoT Road Monitor
        </Link>
      </nav>

      <div className="mx-auto flex min-h-[calc(100vh-88px)] max-w-6xl items-center px-6">
        <section>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-sky-400">miszczuk.it</p>

          <h1 className="max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
            Nowa wersja strony jest w przygotowaniu.
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-300">
            Projekt React, TypeScript, Vite i Tailwind CSS działa poprawnie. Obecna strona produkcyjna pozostaje bez
            zmian.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <span className="rounded-full border border-slate-700 px-4 py-2 text-sm">React</span>
            <span className="rounded-full border border-slate-700 px-4 py-2 text-sm">TypeScript</span>
            <span className="rounded-full border border-slate-700 px-4 py-2 text-sm">Vite</span>
            <span className="rounded-full border border-slate-700 px-4 py-2 text-sm">Tailwind CSS</span>
          </div>

          <div className="mt-10">
            <Link
              to="/road-monitor"
              className="inline-block rounded-full border border-sky-400/40 bg-sky-400/10 px-5 py-2.5 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-400/20"
            >
              Zobacz projekt: IoT Road Monitor →
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
