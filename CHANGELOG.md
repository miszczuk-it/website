# Changelog

## MVP-IMPL-001 — 2026-08-02

- dodano odrębny workspace `apps/app` dla `app.miszczuk.it`,
- dodano formularz, status, wynik i kontrolki Human in the Loop,
- dodano klienta Platform API, bezpieczne mapowanie błędów i konfigurację przez zmienne środowiskowe,
- formularz pozostaje domyślnie wyłączony do czasu implementacji API,
- zachowano niezależny build i routing publicznej strony `miszczuk.it`.

Wszystkie istotne zmiany będą dokumentowane w tym pliku zgodnie z Semantic Versioning.

## Unreleased

- Przebudowano stronę główną na osobiste portfolio projektowe: profil zawodowy, kompetencje,
  projekty IoT Road Monitor, KSC/NIS2 i AI Platform oraz nawigację sekcyjną.
- Wydzielenie aplikacji WWW z repozytorium mieszającego frontend i platformę AI.
- Dodano podstronę `/road-monitor` (projekt IoT Road Monitor): aktualne warunki, historia
  pogodowa 24h/7 dni z wykresami, uczciwy status sekcji ruchu drogowego („w przygotowaniu"),
  minimalny router oparty o `pathname` (bez nowej zależności routingu).
- M5.7: dodano status urządzenia ESP (badge ONLINE/OFFLINE, odpytywany niezależnie co ok. 60s z
  osobnego, nieprzepuszczanego przez cache endpointu), historię LOCAL/WeatherAPI/DELTA dla
  temperatury, wilgotności i ciśnienia oraz osobny wykres historii światła (LOCAL only); usunięto
  mylący, nieodświeżający się tekst „x min temu” z ostatniej aktualizacji — pozostał wyłącznie
  bezwzględny znacznik czasu.
- M5.8: usunięto nieaktualne komunikaty sugerujące, że ESP32 dopiero czeka na wdrożenie (czujnik
  środowiskowy działa produkcyjnie); status sekcji ruchu drogowego pozostaje jednoznacznie
  „Radar: w przygotowaniu”, oddzielony od statusu ESP32. Dodano wykres słupkowy „Transmisje ESP” —
  liczbę poprawnie przyjętych transmisji telemetrycznych na godzinę (ostatnie 24h, źródło: live
  PostgreSQL `telemetry_raw`, bez udziału Databricks), z zerowanymi (nie pomijanymi) godzinami bez
  transmisji, wyróżnieniem bieżącej niepełnej godziny i tabelą danych dla dostępności.
