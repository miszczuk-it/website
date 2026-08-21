# AGENTS.md

## Zakres

Repozytorium zawiera wyłącznie stronę miszczuk.it.

## Zasady

1. Nie modyfikuj infrastruktury ani `/opt/docker`.
2. Nie wykonuj deploymentu bez wyraźnej zgody. Nie wykonuj ręcznych zmian na
   produkcji; standardowa publikacja strony korzysta z zatwierdzonego workflow
   GitHub Actions **Deploy Website**. Uruchomienie produkcyjnego deploymentu
   nadal wymaga wyraźnej zgody użytkownika.
3. Nie dodawaj sekretów, hostów prywatnych ani danych klientów.
4. Zachowuj responsywność, dostępność i poprawne typowanie TypeScript.
5. Po większej zmianie wykonaj `npm run lint` oraz `npm run build`.
6. Nie dodawaj zależności bez uzasadnienia.
