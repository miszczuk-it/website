function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6">
        <section>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-sky-400">
            miszczuk.it
          </p>

          <h1 className="max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
            Nowa wersja strony jest w przygotowaniu.
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-300">
            Projekt React, TypeScript, Vite i Tailwind CSS działa poprawnie.
            Obecna strona produkcyjna pozostaje bez zmian.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <span className="rounded-full border border-slate-700 px-4 py-2 text-sm">
              React
            </span>

            <span className="rounded-full border border-slate-700 px-4 py-2 text-sm">
              TypeScript
            </span>

            <span className="rounded-full border border-slate-700 px-4 py-2 text-sm">
              Vite
            </span>

            <span className="rounded-full border border-slate-700 px-4 py-2 text-sm">
              Tailwind CSS
            </span>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
