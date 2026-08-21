# miszczuk.it — website

Publiczny kod nowej wersji serwisu miszczuk.it.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- npm

## Uruchomienie

```bash
npm ci
npm run dev
```

## Weryfikacja

```bash
npm run lint
npm run build
```

Repozytorium nie zawiera konfiguracji VPS ani danych deploymentowych. Publikacja produkcyjna jest wykonywana przez osobny, prywatny proces.

## Aplikacja `app.miszczuk.it`

Frontend aplikacyjny jest odrębnym workspace w [`apps/app`](apps/app). Ma
własny build, konfigurację środowiskową i testy. Nie jest częścią routingu ani
buildu publicznej strony `miszczuk.it`.

```bash
npm run dev:app
npm run test:app
npm run build:app
```

Adres Platform API jest konfigurowany przez `VITE_PLATFORM_API_URL`. Formularz
pozostaje domyślnie wyłączony przez `VITE_PLATFORM_API_ENABLED=false`, dopóki
odpowiednie API nie zostanie zaimplementowane.

## `/road-monitor`

Podstrona portfolio dla projektu [IoT Road Monitor](https://github.com/miszczuk-it/iot-road-monitor)
(`src/pages/RoadMonitorPage.tsx`), część głównego workspace `miszczuk.it` — bez osobnego routera:
routing jest realizowany przez minimalny `src/router.tsx` oparty o `pathname` +
`history.pushState` (biblioteka routingu nie była tu wcześniej obecna, a jedna dodatkowa trasa
nie uzasadniała wprowadzenia `react-router`).

Dane (aktualne warunki + historia pogodowa 24h/7 dni) pochodzą wyłącznie z publicznego IoT
backendu, nigdy bezpośrednio z Databricks — patrz `src/lib/dashboardApi.ts`. Adres API
konfigurowany jest przez `VITE_IOT_API_URL` (domyślnie `https://api.miszczuk.it` w kodzie, gdy
zmienna nie jest ustawiona); do developmentu wskaż lokalny backend przez `.env` (patrz
`.env.example`). To publiczny base URL, nie sekret.

Sekcja ruchu drogowego celowo pokazuje tylko status „w przygotowaniu” — telemetry ma obecnie za
mało danych, by prezentować rzeczywisty pomiar (patrz `docs/dashboard/README.md` w repo
`iot-road-monitor`). Brak biblioteki wykresów w repo — trzy wykresy historii pogodowej
(`src/components/dashboard/LineChart.tsx`) to zwykłe inline SVG, bez nowej zależności.
