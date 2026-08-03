# MVP-IMPL-002A – Frontend/API sequence

## Happy path

```text
User submits form
  |
  +--> POST /api/projects
  |      returns projectId
  |
  +--> POST /api/projects/{projectId}/sessions
  |      returns sessionId, revision
  |
  +--> POST /api/sessions/{sessionId}/start
  |      expectedRevision from create response
  |
  +--> POST /api/sessions/{sessionId}/tasks
  |      returns taskId, revision
  |
  +--> POST /api/tasks/{taskId}/ready
         expectedRevision from create response
         returns Task status READY
```

## Correlation

Jeden `correlationId` jest generowany przed pierwszym wywołaniem i używany dla wszystkich kroków.

## Partial success

Frontend przechowuje w pamięci komponentu (React state):

- projectId,
- sessionId,
- taskId,
- bieżące revision,
- ostatni zakończony krok.

Ponowienie rozpoczyna się od pierwszego niezakończonego kroku.

**Zastrzeżenie (od `MVP-HARDEN-001`, niezależny audyt):** ochrona przed
utworzeniem drugiego Project po częściowym sukcesie działa wyłącznie w
ramach jednej, nieodświeżonej sesji aplikacji w przeglądarce. Stan powyżej
żyje tylko w pamięci komponentu React, nie w `localStorage` ani
`sessionStorage` — **nie przetrwa odświeżenia strony ani zamknięcia karty**.
Jeżeli użytkownik odświeży stronę po błędzie sieciowym w trakcie tworzenia
Session (Project już istnieje), a następnie ponownie wypełni formularz,
frontend dziś utworzy nowy, drugi Project — `createProject` nie przyjmuje
`idempotencyKey` (w przeciwieństwie do `startExecution`, gdzie backend
gwarantuje idempotencję niezależnie od stanu przeglądarki). Backendowa
idempotencja `createProject`, która usunie to ograniczenie, jest zakresem
`MVP-HARDEN-002` (odłożone świadomie, nie zaimplementowane jako półśrodek
w `MVP-HARDEN-001`).

## Koniec etapu

Stan końcowy:

`READY_FOR_EXECUTION`

Po jawnej akcji użytkownika:

```text
POST /api/tasks/{taskId}/executions
  |
  +--> BUILDING_CONTEXT
  |
  +--> GET /api/executions/{executionId}
         WAITING_FOR_LLM_GATEWAY
```

Start wymaga `idempotencyKey` i `expectedTaskRevision`. Klucz nie zmienia się
przy ponowieniu po niepewnym wyniku sieciowym, dzięki czemu UI nie tworzy
drugiego Execution. Polling wykonuje wyłącznie operacje GET.

`WAITING_FOR_LLM_GATEWAY` nie oznacza uruchomienia analizy LLM.
