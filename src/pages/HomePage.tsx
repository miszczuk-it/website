import { useDocumentMeta } from '../lib/useDocumentMeta'
import { Link } from '../router'

type Project = {
  name: string
  status: string
  description: string
  flow?: string
  value: string
  technologies: string[]
  href: string
  external?: boolean
  linkLabel: string
}

const projects: Project[] = [
  {
    name: 'IoT Road Monitor',
    status: 'Projekt hobbystyczny',
    description: 'Hobbystyczny projekt rozwijany w miejscu, w którym odpoczywam. Łączę w nim ESP32 i czujniki z API, bazą danych, automatyzacją i analityką w Databricks, wykorzystując małą skalę do praktycznego testowania architektury i „dorosłych” technologii end-to-end.',
    flow: 'ESP32 → API → PostgreSQL → Databricks',
    value: 'Pokazuje moje podejście do architektury i technologii end-to-end w praktyce — na małą skalę, ale bez taryfy ulgowej.',
    technologies: ['ESP32', '.NET', 'PostgreSQL', 'n8n', 'Databricks', 'React'],
    href: '/road-monitor',
    linkLabel: 'Zobacz dashboard IoT Road Monitor',
  },
  {
    name: 'KSC / NIS2',
    status: 'Rozwijany produkt',
    description: 'Projekt aplikacji wspierającej organizacje w porządkowaniu wymagań cyberbezpieczeństwa i zgodności. Łączy katalog wymagań, ocenę spełnienia, dowody, kontrole i pracę z ryzykiem. Rozwijam go z myślą o praktycznym wykorzystaniu w organizacjach przygotowujących się do wymagań KSC i NIS2.',
    value: 'Pokazuje przełożenie wymagań regulacyjnych i wiedzy o cyberbezpieczeństwie na konkretne, używalne narzędzie.',
    technologies: ['Cybersecurity', 'NIS2', 'KSC', 'Compliance', 'Risk'],
    href: 'https://ksc.miszczuk.it',
    external: true,
    linkLabel: 'Zobacz aplikację KSC / NIS2',
  },
  {
    name: 'AI Platform',
    status: 'Projekt eksperymentalno-produktowy',
    description: 'Projekt platformy do pracy z wyspecjalizowanymi agentami AI wspierającymi zadania zespołów IT. Łączy role agentów, orkiestrację, integracje, automatyzację i audyt działań. Rozwijam go jako rozwiązanie z potencjałem do wykorzystania w rzeczywistych procesach operacyjnych i projektowych.',
    value: 'Pokazuje odpowiedzialne podejście do wdrażania AI w procesach organizacyjnych — z zachowaniem kontroli i audytu decyzji.',
    technologies: ['AI agents', 'LLM', 'Orchestration', 'Automation', 'Integration'],
    href: 'https://app.miszczuk.it',
    external: true,
    linkLabel: 'Zobacz AI Platform',
  },
]

const competencies: [string, string][] = [
  ['IT Strategy & Leadership', 'Łączenie celów organizacji z praktycznym planem rozwoju IT.'],
  ['Business Systems / ERP', 'Systemy biznesowe, ich stabilny rozwój i dopasowanie do procesów.'],
  ['Architecture & Integration', 'Projektowanie spójnych usług, danych i integracji między systemami.'],
  ['Cybersecurity / NIS2 / KSC', 'Zarządzanie wymaganiami, kontrolami i ryzykiem cybernetycznym.'],
  ['Data & Analytics', 'Dane jako podstawa decyzji operacyjnych i rozwoju produktów.'],
  ['Automation & AI', 'Automatyzacja powtarzalnej pracy i odpowiedzialne zastosowanie AI.'],
]

const experienceHighlights = [
  '25+ lat w środowisku produkcyjnym',
  '500+ użytkowników',
  'ERP · infrastruktura · cyberbezpieczeństwo · dane',
  'Od strategii do działającego rozwiązania',
]

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'h-6 w-6 text-sky-400/80',
}

const competencyIcons = [
  <svg key="strategy" {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9l-2 4-4 2 2-4 4-2Z" />
  </svg>,
  <svg key="erp" {...iconProps}>
    <polygon points="12 3 4 7.5 12 12 20 7.5 12 3" />
    <polyline points="4 12 12 16.5 20 12" />
    <polyline points="4 16.5 12 21 20 16.5" />
  </svg>,
  <svg key="architecture" {...iconProps}>
    <circle cx="5" cy="6" r="2" />
    <circle cx="19" cy="6" r="2" />
    <circle cx="12" cy="19" r="2" />
    <line x1="6.5" y1="7.2" x2="10.7" y2="17.3" />
    <line x1="17.5" y1="7.2" x2="13.3" y2="17.3" />
    <line x1="7" y1="6" x2="17" y2="6" />
  </svg>,
  <svg key="security" {...iconProps}>
    <path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" />
    <path d="M9 12.5 11 14.5 15 10" />
  </svg>,
  <svg key="data" {...iconProps}>
    <line x1="5" y1="19" x2="5" y2="13" />
    <line x1="10.5" y1="19" x2="10.5" y2="7" />
    <line x1="16" y1="19" x2="16" y2="10" />
    <line x1="21" y1="19" x2="3" y2="19" />
  </svg>,
  <svg key="automation" {...iconProps}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
  </svg>,
]

const technologyGroups: [string, string][] = [
  ['Enterprise', 'ERP · Microsoft 365 · Azure'],
  ['Data & Automation', 'Databricks · PostgreSQL · n8n'],
  ['Engineering', '.NET · React · TypeScript · Docker · GitHub'],
  ['IoT', 'ESP32'],
]

function SectionHeading({ eyebrow, id, title, description }: { eyebrow: string; id?: string; title: string; description?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-lg leading-8 text-slate-300">{description}</p>}
    </div>
  )
}

function ProjectLink({ project }: { project: Project }) {
  const linkClassName = 'font-semibold text-sky-300 transition-colors hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300'

  if (project.external) {
    return (
      <a href={project.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {project.linkLabel} <span aria-hidden="true">→</span>
        <span className="sr-only"> (otwiera się w nowej karcie)</span>
      </a>
    )
  }

  return (
    <Link to={project.href} className={linkClassName}>
      {project.linkLabel} <span aria-hidden="true">→</span>
    </Link>
  )
}

export function HomePage() {
  useDocumentMeta(
    'Andrzej Miszczuk — IT Leadership, architektura i technologia',
    'Andrzej Miszczuk: zarządzanie IT, strategia, architektura, cyberbezpieczeństwo, dane i AI w praktyce organizacyjnej.',
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800/80 bg-slate-950/95">
        <nav aria-label="Główna nawigacja" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6 py-5">
          <a href="#top" className="shrink-0 rounded-sm transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">
            <img src="/images/miszczuk-logo.png" alt="miszczuk.it" className="h-8 w-auto sm:h-9" />
          </a>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300 sm:gap-x-6">
            <a href="#about" className="transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">O mnie</a>
            <a href="#skills" className="transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Kompetencje</a>
            <a href="#projects" className="transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Projekty</a>
            <a href="#contact" className="transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Kontakt</a>
          </div>
        </nav>
      </header>

      <main id="top">
        <section
          className="relative border-b border-slate-800/80 bg-slate-950 bg-[url('/images/industrial-digital-transformation-hero.png')] bg-cover bg-right bg-no-repeat lg:min-h-screen"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-r from-slate-950/70 from-0% via-slate-950/40 via-45% to-transparent to-70% lg:from-slate-950/55 lg:from-0% lg:via-slate-950/15 lg:via-35% lg:to-transparent lg:to-60%"
          />
          <div className="relative mx-auto flex min-h-[calc(100vh-77px)] max-w-6xl items-center px-6 py-24 lg:min-h-screen lg:py-32">
            <div className="max-w-md lg:max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">IT Leadership · Digital Transformation · Architecture</p>
              <h1 className="mt-6 text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">Andrzej Miszczuk</h1>
              <p className="mt-7 text-xl leading-9 text-slate-200 md:text-2xl">Łączę strategię IT, systemy biznesowe i technologię z potrzebami organizacji.</p>
              <p className="mt-5 text-lg leading-8 text-slate-400">Doświadczenie w środowisku produkcyjnym — od ERP i infrastruktury po architekturę, cyberbezpieczeństwo, dane, automatyzację i AI.</p>
              <div className="mt-10 flex flex-wrap gap-4">
                <a href="#about" className="rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Poznaj moje doświadczenie <span aria-hidden="true">→</span></a>
                <a href="#contact" className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-sky-400/60 hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Kontakt</a>
              </div>
            </div>
          </div>
        </section>

        <section id="about" aria-labelledby="about-heading" className="scroll-mt-8 mx-auto max-w-6xl px-6 py-20 md:py-28">
          <SectionHeading eyebrow="Doświadczenie" id="about-heading" title="Technologia z perspektywy organizacji" />
          <div className="mt-8 max-w-3xl space-y-5 text-lg leading-8 text-slate-300">
            <p>Pracuję na styku zarządzania IT, strategii i architektury. Skupiam się na rozwiązaniach, które wspierają organizację, są możliwe do utrzymania i przygotowane na zmianę.</p>
            <p>Obszary mojej pracy obejmują systemy biznesowe i ERP, infrastrukturę oraz cloud, integracje i automatyzację, cyberbezpieczeństwo — w tym NIS2 i KSC — a także dane i AI jako narzędzia wspierające procesy.</p>
          </div>
          <ul className="mt-12 grid gap-6 border-t border-slate-800 pt-8 sm:grid-cols-2 lg:grid-cols-4">
            {experienceHighlights.map((highlight) => (
              <li key={highlight} className="text-sm font-medium leading-6 text-slate-200">{highlight}</li>
            ))}
          </ul>
        </section>

        <section id="skills" aria-labelledby="skills-heading" className="scroll-mt-8 border-y border-slate-800/80 bg-slate-900/30">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <SectionHeading eyebrow="Kompetencje" id="skills-heading" title="Technologia jako element dobrze prowadzonej zmiany" />
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {competencies.map(([title, description], index) => (
                <article key={title} className="rounded-xl border border-slate-800 bg-slate-950/60 p-6">
                  {competencyIcons[index]}
                  <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-2 leading-6 text-slate-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="projects" aria-labelledby="projects-heading" className="scroll-mt-8 mx-auto max-w-6xl px-6 py-20 md:py-28">
          <SectionHeading eyebrow="Wybrane projekty" id="projects-heading" title="Od architektury do działającego rozwiązania" description="Projekty jako dowód praktycznej kompetencji technologicznej — przejścia od koncepcji i architektury do działającego rozwiązania." />
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {projects.map((project) => (
              <article key={project.name} className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-6 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-400/80">{project.status}</p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">{project.name}</h3>
                <p className="mt-6 leading-7 text-slate-300">{project.description}</p>
                {project.flow && <p className="mt-5 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 font-mono text-xs leading-5 text-sky-200">{project.flow}</p>}
                <p className="mt-4 leading-7 text-slate-400">{project.value}</p>
                <p className="mt-6 text-sm text-slate-500">{project.technologies.join(' · ')}</p>
                <div className="mt-auto pt-8">
                  <ProjectLink project={project} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="technology-heading" className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Technology landscape</p>
          <h2 id="technology-heading" className="mt-2 text-xl font-semibold text-slate-300">Technologie, na których opieram rozwiązania</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {technologyGroups.map(([group, items]) => (
              <div key={group}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{items}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-8 border-t border-slate-800/80 bg-slate-900/30">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">Kontakt</p>
              <h2 id="contact-heading" className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">Porozmawiajmy</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">Interesują mnie role i projekty związane z zarządzaniem IT, transformacją cyfrową, systemami biznesowymi, architekturą i rozwojem organizacji poprzez technologię.</p>
              <div className="mt-8 flex flex-wrap items-center gap-6">
                <a href="mailto:kontakt@miszczuk.it" className="inline-block rounded-full border border-sky-400/40 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-400/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">Napisz do mnie <span aria-hidden="true">→</span></a>
                <a href="mailto:kontakt@miszczuk.it" className="text-sm font-medium text-slate-400 transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">kontakt@miszczuk.it</a>
                <a href="https://www.linkedin.com/in/andrzej-miszczuk-b9927761/" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-400 transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">LinkedIn</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 px-6 py-8 text-center text-sm text-slate-500">© {new Date().getFullYear()} Andrzej Miszczuk</footer>
    </div>
  )
}
