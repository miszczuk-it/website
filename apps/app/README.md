# app.miszczuk.it

Oddzielny frontend aplikacyjny AI Platform. Nie współdzieli buildu ani routingu
ze stroną informacyjną `miszczuk.it`.

## Konfiguracja

- `VITE_PLATFORM_API_URL` — publiczny prefiks Platform API, domyślnie `/api`;
- `VITE_PLATFORM_API_ENABLED` — aktywuje rzeczywiste wywołania formularza.

Plik `.env.example` pozostawia API wyłączone (`false`). Lokalne DEV i testy
integracyjne mogą jawnie ustawić `true`. Zmienne Vite są publiczną konfiguracją
bundla i nie mogą zawierać sekretów.

## Sekwencja

Formularz wykonuje po kolei:

1. `POST /api/projects`,
2. `POST /api/projects/{projectId}/sessions`,
3. `POST /api/sessions/{sessionId}/start`,
4. `POST /api/sessions/{sessionId}/tasks`,
5. `POST /api/tasks/{taskId}/ready`.

Jeden `correlationId` jest używany w całym przepływie. Każde wywołanie ma
odrębny `requestId`.

## Częściowy sukces i retry

Stan zachowuje utworzone identyfikatory oraz rewizje. Po błędzie UI pokazuje
nieukończony krok i identyfikator zgłoszenia. Jawne ponowienie zaczyna się od
pierwszego nieukończonego kroku; nie tworzy ponownie Project ani innych już
zapisanych obiektów.

Końcowy stan `READY_FOR_EXECUTION` oznacza wyłącznie gotowość Task. Execution,
LLM, Artifact Version i decyzje Human in the Loop nie są jeszcze dostępne.

## Walidacja

Z katalogu głównego repozytorium:

```bash
npm run lint
npm run test:app
npm run build:app
npm run build
```

Szczegółowy przebieg znajduje się w
[`docs/frontend-api-sequence.md`](docs/frontend-api-sequence.md).
