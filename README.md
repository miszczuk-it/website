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

Repozytorium nie zawiera konfiguracji VPS ani danych deploymentowych. CI uruchamia
się automatycznie, ale produkcja nie publikuje się automatycznie po merge. Aby
opublikować stronę, wybierz **GitHub → Actions → Deploy Website → Run workflow**.
Workflow zawsze buduje aktualny `main`, wykonuje backup, a następnie smoke test;
w przypadku nieudanego smoke testu automatycznie przywraca backup.

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

Dashboard automatycznie sprawdza API co 5 minut. Polling jest wstrzymany, gdy karta jest ukryta;
po powrocie odświeżenie następuje tylko wtedy, gdy ostatni udany cykl jest już nieświeży. Dostępny
jest też przycisk ręcznego odświeżenia aktualnych warunków i wybranego zakresu historii.

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
