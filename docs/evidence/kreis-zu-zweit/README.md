# Der Kreis zu zweit

Drei Aufnahmen aus `harness/orisoStage.tsx`, in einem echten Browser
geschossen (Chromium, 960x640, 1x). Was sie zeigen:

| Platte                                | Inhalt                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-before-kreis-zu-zweit.png`        | Vorher: `packShapes` mit zwei Formen. Der Otter verdeckt den Fuchs zu 31,2 % — gemessen, nicht geschätzt, siehe die Tabelle in `src/oriso/layout.test.ts`. |
| `01-after-kreis-zu-zweit.png`         | Nachher: `pairShapes` teilt dasselbe Rechteck wie die Felder und setzt in jede Hälfte die eigene Form der Person. Nichts überdeckt sich.                   |
| `02-after-kreis-zu-zweit-spricht.png` | Nachher, mit Sprecherin: 1,6× größer — das Sprech-Gewicht des Hains, nicht die 2,6 der Felder, mit denen die Zuhörerin auf ein Viertel geschrumpft wäre.   |

Die beiden Nachher-Platten sind nach der Neigungs-Korrektur neu geschossen:
`OrisoFace` dreht jede Form um bis zu ±11°, und ein Quadrat bei 11° ist 17 %
breiter als seine Box. Die Formen sind deshalb etwas kleiner als in der ersten
Fassung — gemessen über alle Paare aus 120 Namen, vorher bis zu 23px
Überlappung trotz nicht überlappender Boxen.

Der Anlass: eine Bildschirmfreigabe nimmt einem Zweiergespräch das
Einzelgespräch-Layout weg, und der Kreis ist dann das, was die Leiste
anbietet. Der Fall ist also nicht zu umgehen.

Was die Bilder **nicht** zeigen: es ist kein laufender Anruf. Kein LiveKit,
kein Matrix, kein `Grid` — also weder die Federanimation noch das Ziehen der
Formen. Dafür ist der Testplan am Pull Request da.

Drei, fünf und sechs Personen überdecken sich weiterhin um 12 bis 18 %. Das
ist die Packung des Prototyps und wartet auf eine eigene Entscheidung;
`layout.test.ts` hält alle vier Zahlen mit `fails` fest.
