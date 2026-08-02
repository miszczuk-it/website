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

Frontend przechowuje:

- projectId,
- sessionId,
- taskId,
- bieżące revision,
- ostatni zakończony krok.

Ponowienie rozpoczyna się od pierwszego niezakończonego kroku.

Frontend nie tworzy automatycznie nowego Project po częściowym sukcesie.

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
