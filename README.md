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
