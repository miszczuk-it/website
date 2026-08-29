# app.miszczuk.it

Oddzielny frontend aplikacyjny AI Platform. Nie współdzieli buildu ani routingu
ze stroną informacyjną `miszczuk.it`.

## Konfiguracja

- `VITE_PLATFORM_API_URL` — publiczny prefiks Platform API, domyślnie `/api`;
- `VITE_PLATFORM_API_ENABLED` — aktywuje rzeczywiste wywołania formularza.
- `VITE_APP_ENV` — jawne oznaczenie środowiska, na przykład `DEV`.
- `VITE_DEV_API_PROXY_TARGET` — tylko dla `vite dev` (nie dotyczy `vite build`):
  adres lokalnego backendu (`docker-compose.dev.yml`, domyślnie
  `http://localhost:8080`), do którego `vite dev` proxy'uje `/api`. Backend
  DEV Mock Auth ustawia ciasteczko `SameSite=Lax` i akceptuje CORS tylko z
  własnego originu — bez proxy, wywołania z `vite dev` (inny port) nie
  przenosiłyby tego ciasteczka.

## Adapter VS1 (Frontend Real API Integration)

`VerticalSliceWorkspace` (`src/components/VerticalSliceWorkspace.tsx`) korzysta
z `Vs1Service` (`src/lib/vs1-service.ts`), który ma dwie implementacje wybierane
przez `VITE_PLATFORM_API_ENABLED` (bez zmiany UI):

- `createMockVs1Service()` — makieta w pamięci, do testów/dev bez backendu;
- `createRealVs1Service(baseUrl)` — realny adapter zbudowany na
  `PlatformApiClient` (`src/lib/platform-api.ts`): AUTH (dev-login/me/logout),
  Session list/create/detail, Question/Answer (`revision` jako
  `expectedRevision`), Artifact Version, Approval. Źródłem prawdy jest zawsze
  backend (`GET /api/sessions/{id}` po Approval, zgodnie z `GAP-010`).

Realny adapter odzyskuje Artifact z canonical, read-only
`GET /api/executions/{id}/artifact`, a następnie odczytuje jego wersje.
Nie używa mapy `executionId -> artifactId` w pamięci jako źródła prawdy,
więc przeładowanie strony nie gubi Artifact ani jego wersji.

Obraz wdrożeniowy buduje `apps/app/Dockerfile`. Konfiguracja DEV ustawia API na
`/api`, włącza wywołania Platform API i wyświetla etykietę „Środowisko DEV”.
Kontener słucha wyłącznie w sieci Docker na porcie 8080; nie publikuje portu
hosta.

Plik `.env.example` pozostawia API wyłączone (`false`). Lokalne DEV i testy
integracyjne mogą jawnie ustawić `true`. Zmienne Vite są publiczną konfiguracją
bundla i nie mogą zawierać sekretów.

## Owner UX Follow-up (GAP-017): usuwanie, koszt, historia feedbacku, podgląd

Rozszerzenie `Vs1Service`/`AnalysisList`/`AnalysisDetail` o cztery
funkcje zgłoszone przez Ownera po realnym DEV teście:

- **Usuwanie analizy** — menu „⋯” przy pozycji na liście, potwierdzenie
  przez współdzielony `ConfirmDialog` (`src/components/ConfirmDialog.tsx`,
  natywny `<dialog>`, pierwszy tego typu wzorzec w repo), następnie
  `Vs1Service.archiveSession()` → `POST /api/sessions/{id}/archive`
  (soft-delete po stronie backendu — historia/audyt/koszt zachowane).
  Widoczne tylko gdy `identity.permissions` zawiera
  `session.archive_own`/`session.archive_any`.
- **Koszt** — `AnalysisDetail` renderuje `analysisTotalCostUsd`,
  `stageCostUsd` i per-rewizja `costUsd` bezpośrednio z
  `GET /api/sessions/{id}/workflow` (`formatUsd()` w
  `src/lib/workflow-labels.ts`; `null`/`undefined` → „—”, nigdy
  `$NaN`/`undefined`). Frontend nie liczy kosztu z tokenów lokalnie.
- **Powód rewizji w historii** — `revisionReason` z tej samej odpowiedzi,
  z odznaką „Poprawa bieżącego etapu” lub „Powrót do wcześniejszego
  etapu” (`revisionKindOf()`/`REVISION_KIND_LABELS`, na podstawie
  `returnToStageSourceArtifactId`).
- **Read-only podgląd** — przycisk „Podgląd” przy każdej wersji w
  historii woła `Vs1Service.getArtifactPreview(artifactId)` (reużywa
  istniejące `GET /api/artifacts/{id}` + `.../versions`, zero nowego
  endpointu) i renderuje treść bez żadnych akcji mutujących, z „← Wróć
  do aktualnego etapu”.

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

Stan `READY_FOR_EXECUTION` udostępnia jawny przycisk uruchomienia. Frontend
wysyła `POST /api/tasks/{taskId}/executions` z zapamiętanym kluczem idempotencji
i rewizją Task, zapisuje `executionId`, a następnie wyłącznie odczytowo odpytuje
`GET /api/executions/{executionId}`.

UI prezentuje `BUILDING_CONTEXT` i `WAITING_FOR_LLM_GATEWAY`. Ten ostatni stan
oznacza przygotowany kontekst, ale nie oznacza wywołania LLM. Artifact Version i
decyzje Human in the Loop nie są jeszcze dostępne.

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
