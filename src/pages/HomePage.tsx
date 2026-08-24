import { useDocumentMeta } from '../lib/useDocumentMeta'
import { Link } from '../router'

const projects = [
  {
    name: 'IoT Road Monitor',
    status: 'Aktywny projekt',
    goal: 'System do zbierania i analizy danych środowiskowych przy drodze, z przygotowaniem pod dane o ruchu.',
    solution: 'ESP32, API i baza danych łączą monitoring terenowy z automatyzacją oraz analityką w Databricks.',
    flow: 'ESP32 → API → PostgreSQL → Databricks',
    technologies: ['ESP32', '.NET', 'PostgreSQL', 'n8n', 'Databricks', 'React'],
    href: '/road-monitor',
    linkLabel: 'Zobacz dashboard IoT Road Monitor',
  },
  {
    name: 'KSC / NIS2',
    status: 'W rozwoju',
    goal: 'Aplikacja wspierająca organizacje w przygotowaniu do wymagań cyberbezpieczeństwa i zgodności.',
    solution: 'Porządkuje wymagania, ocenę zgodności, dowody oraz pracę z kontrolami i ryzykiem cybernetycznym.',
    technologies: ['Cybersecurity', 'NIS2', 'KSC', 'Compliance', 'Risk'],
  },
  {
    name: 'AI Platform',
    status: 'W rozwoju',
    goal: 'Platforma wykorzystująca wyspecjalizowanych agentów AI do wspierania procesów zespołów IT.',
    solution: 'Łączy role agentów, orkiestrację, integracje i automatyzację przepływów z możliwością audytu działań.',
    technologies: ['AI agents', 'LLM', 'Orchestration', 'Automation', 'Integration'],
  },
]

const competencies = [
  ['IT Strategy & Leadership', 'Łączenie celów organizacji z praktycznym planem rozwoju IT.'],
  ['Business Systems / ERP', 'Systemy biznesowe, ich stabilny rozwój i dopasowanie do procesów.'],
  ['Architecture & Integration', 'Projektowanie spójnych usług, danych i integracji między systemami.'],
  ['Cybersecurity / NIS2 / KSC', 'Zarządzanie wymaganiami, kontrolami i ryzykiem cybernetycznym.'],
  ['Data & Analytics', 'Dane jako podstawa decyzji operacyjnych i rozwoju produktów.'],
  ['Automation & AI', 'Automatyzacja powtarzalnej pracy i odpowiedzialne zastosowanie AI.'],
]

const technologies = ['.NET', 'PostgreSQL', 'Docker', 'GitHub Actions', 'React', 'TypeScript', 'n8n', 'Databricks', 'ESP32', 'Microsoft 365 / Azure']

function SectionHeading({ eyebrow, id, title, description }: { eyebrow: string; id?: string; title: string; description?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-lg leading-8 text-slate-300">{description}</p>}
    </div>
  )
}

function TechnologyBadge({ children }: { children: string }) {
  return <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-300">{children}</span>
}

export function HomePage() {
  useDocumentMeta(
    'Andrzej Miszczuk — IT Leadership, Architecture & Technology',
    'Profesjonalne portfolio Andrzeja Miszczuka: IT leadership, architektura, transformacja cyfrowa, cyberbezpieczeństwo, dane i AI.',
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800/80 bg-slate-950/95">
        <nav aria-label="Główna nawigacja" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6 py-5">
          <a href="#top" className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-400 transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">
            miszczuk.it
          </a>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300 sm:gap-x-6">
            <a href="#about" className="transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">O mnie</a>
            <a href="#projects" className="transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Projekty</a>
            <a href="#skills" className="transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Kompetencje</a>
            <a href="#contact" className="transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Kontakt</a>
            <Link to="/road-monitor" className="rounded-full border border-sky-400/40 px-3 py-1.5 font-medium text-sky-300 transition-colors hover:bg-sky-400/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Road Monitor</Link>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="border-b border-slate-800/80">
          <div className="mx-auto flex min-h-[calc(100vh-77px)] max-w-6xl items-center px-6 py-24 md:py-32">
            <div className="max-w-4xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">IT Leadership · Digital Transformation · Architecture</p>
              <h1 className="mt-6 text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">Andrzej Miszczuk</h1>
              <p className="mt-7 max-w-3xl text-xl leading-9 text-slate-200 md:text-2xl">Łączę zarządzanie IT z praktycznym podejściem do architektury, automatyzacji, cyberbezpieczeństwa, danych i AI.</p>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">Buduję rozwiązania, które wspierają organizacje w bezpiecznej zmianie technologicznej — od strategii i systemów biznesowych po działające produkty demonstracyjne.</p>
              <div className="mt-10 flex flex-wrap gap-4">
                <a href="#projects" className="rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Poznaj projekty <span aria-hidden="true">→</span></a>
                <a href="#contact" className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-sky-400/60 hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Kontakt</a>
              </div>
            </div>
          </div>
        </section>

        <section id="about" aria-labelledby="about-heading" className="scroll-mt-8 mx-auto max-w-6xl px-6 py-20 md:py-28">
          <SectionHeading eyebrow="O mnie" id="about-heading" title="Technologia z perspektywą organizacji" />
          <div className="mt-8 max-w-3xl space-y-5 text-lg leading-8 text-slate-300">
            <p>Pracuję na styku zarządzania IT, strategii i architektury. Skupiam się na rozwiązaniach, które są zrozumiałe dla biznesu, możliwe do utrzymania i przygotowane na zmianę.</p>
            <p>Obszary mojej pracy obejmują systemy biznesowe i ERP, infrastrukturę oraz cloud, integracje i automatyzację, cyberbezpieczeństwo — w tym NIS2 i KSC — a także dane i AI jako narzędzia wspierające procesy.</p>
          </div>
        </section>

        <section id="projects" aria-labelledby="projects-heading" className="scroll-mt-8 border-y border-slate-800/80 bg-slate-900/30">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <SectionHeading eyebrow="Wybrane projekty" id="projects-heading" title="Od architektury do działającego rozwiązania" description="Krótkie przykłady projektów rozwijanych jako praktyczne odpowiedzi na realne potrzeby technologiczne i organizacyjne." />
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {projects.map((project) => (
                <article key={project.name} className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-950/70 p-6 transition-transform motion-reduce:transition-none sm:p-7 lg:hover:-translate-y-1">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-bold tracking-tight text-white">{project.name}</h3>
                    <span className="shrink-0 rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-xs font-semibold text-sky-300">{project.status}</span>
                  </div>
                  <p className="mt-6 leading-7 text-slate-300">{project.goal}</p>
                  <p className="mt-4 leading-7 text-slate-400">{project.solution}</p>
                  {project.flow && <p className="mt-5 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 font-mono text-xs leading-5 text-sky-200">{project.flow}</p>}
                  <ul aria-label={`Technologie: ${project.name}`} className="mt-6 flex flex-wrap gap-2">
                    {project.technologies.map((technology) => <li key={technology}><TechnologyBadge>{technology}</TechnologyBadge></li>)}
                  </ul>
                  {project.href && <div className="mt-8"><Link to={project.href} className="font-semibold text-sky-300 transition-colors hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">{project.linkLabel} <span aria-hidden="true">→</span></Link></div>}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="skills" aria-labelledby="skills-heading" className="scroll-mt-8 mx-auto max-w-6xl px-6 py-20 md:py-28">
          <SectionHeading eyebrow="Obszary kompetencji" id="skills-heading" title="Technologia jako element dobrze prowadzonej zmiany" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {competencies.map(([title, description]) => (
              <article key={title} className="rounded-xl border border-slate-800 bg-slate-900/35 p-5">
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-2 leading-6 text-slate-400">{description}</p>
              </article>
            ))}
          </div>
          <div className="mt-16 border-t border-slate-800 pt-10">
            <h3 className="text-xl font-bold tracking-tight text-white">Technologie używane w projektach</h3>
            <ul className="mt-5 flex flex-wrap gap-3">
              {technologies.map((technology) => <li key={technology}><TechnologyBadge>{technology}</TechnologyBadge></li>)}
            </ul>
          </div>
        </section>

        <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-8 border-t border-slate-800/80 bg-slate-900/30">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">Kontakt</p>
              <h2 id="contact-heading" className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">Porozmawiajmy</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">Więcej o działającym projekcie IoT Road Monitor znajduje się na publicznym dashboardzie.</p>
              <div className="mt-8"><Link to="/road-monitor" className="inline-block rounded-full border border-sky-400/40 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-400/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Otwórz IoT Road Monitor <span aria-hidden="true">→</span></Link></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 px-6 py-8 text-center text-sm text-slate-500">© {new Date().getFullYear()} Andrzej Miszczuk</footer>
    </div>
  )
}
