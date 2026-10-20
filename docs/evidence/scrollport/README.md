# Unten im gescrollten Anruf

Ab neun Personen hören die Felder auf, sich zu teilen: sie bekommen eine feste
Größe, brechen um und `.inRoom` scrollt. Zwei Review-Funde fragen dasselbe —
was ist unten noch richtig, wenn es für den ersten Bildschirm gebaut wurde?

Geschossen mit `node scripts/measureScrollport.mjs` (Chromium, 2x), einmal bei
900x620 und einmal bei 390x640 (`-phone`), mit vierzehn Feldern; das letzte
spricht, damit man seinen Halo sieht. Das Skript baut die echte Kette —
`.inRoom` > `.scrollingGrid` > das Layout-Wurzelelement mit den Slots als
Flusskindern — aus den **ausgelieferten** Regelkörpern, die es aus den
Stylesheets liest. Die Vorher-Spalte setzt nur die beiden ersetzten
Deklarationen zurück, im selben Browser auf derselben Seite.

| Platte                      | Inhalt                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `01-before-top*.png`        | Vorher, ganz oben. Unauffällig — der Teich liegt hinter der Bühne.                                                                     |
| `02-before-max-scroll*.png` | Vorher, ganz unten. Der Teich ist mitgescrollt: 325 px nackter Hintergrund am Desktop, am Handy 1844 px — dort ist er vollständig weg. |
| `01-after-top*.png`         | Nachher, ganz oben. Identisch zum Vorher: `position: fixed` ändert den ersten Bildschirm nicht.                                        |
| `02-after-max-scroll*.png`  | Nachher, ganz unten. Der Teich steht bei jedem Scrollstand von 0 bis 620 bzw. 640.                                                     |

Gemessen, nicht geschätzt (`backdropTop`/`backdropBottom` relativ zum
Scrollport, bei maximalem Scroll):

| Fenster | vorher        | nachher |
| ------- | ------------- | ------- |
| 900x620 | -325 … 295    | 0 … 620 |
| 390x640 | -1844 … -1204 | 0 … 640 |

**Der zweite Fund hat sich nicht bestätigt.** Das Review liest
`block-size: 100%` am Blatt so, dass die umgebrochenen Reihen hinter dem Falz
aus dem Inhaltskasten fallen und die Halo-Polsterung am Falz hängen bleibt.
In Chromium passiert das nicht: `.scrollingGrid` ist ein Flex-Item, dessen
automatische Mindestgröße sein Inhalt ist, es wächst also mit, und die
Prozentangabe löst gegen die gewachsene Höhe auf. In beiden Spalten liegt die
Halo-Polsterung auf den Pixel genau hinter der letzten Reihe
(`roomAfterLastRow: 0`, `lastRowBelowSheet: -28`). Geändert ist es trotzdem,
zu `min-block-size: 100%`: die Regel soll selbst sagen „mindestens ein
Bildschirm, und so viel mehr, wie die Reihen brauchen", statt sich darauf zu
verlassen, dass oben niemand ein `min-height: 0` ergänzt — der übliche
Flexbox-Handgriff, nach dem die geschnittene Fassung ausgeliefert würde.

Was die Bilder **nicht** zeigen: es ist kein laufender Anruf, sondern die
Kette aus echten Regeln mit Platzhalter-Feldern. Kein LiveKit, kein Matrix,
kein `Grid`. Live zu prüfen ist das im Testplan am Pull Request.
