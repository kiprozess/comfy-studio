# Comfy Hackathon

Next.js-Projekt mit App Router, TypeScript, Tailwind CSS und ESLint.
Die Sidebar enthält Styling-Kategorien, Outfit-Vorlagen und lokale Referenzbild-Uploads.
Der Arbeitsbereich enthält einen Personenbild-Upload mit Drag-and-drop und Vorschau.
Das mittlere Bildfeld hat auf dem Desktop eine feste, an die Bildschirmhöhe angepasste Größe im Format 3:4, sodass die Seite nach dem Upload nicht scrollt. Querformatige Bilder machen es breiter statt kleiner.
Das Info-Icon über dem Bild zeigt Dateiname und Originalauflösung in Pixeln.
Die gespeicherten Comfy-Farben sind bereits eingebunden. Die Typografie folgt comfy.org/hub: Labels und Buttons in Großbuchstaben mit Laufweite, 16-px-Radien. Statt Comfys lizenzpflichtiger Schrift PP Formula wird Inter verwendet, die comfy.org ebenfalls ausliefert.
Die Generierung nutzt GPT Image 2.5 Sunburst über Comfy Router.

## Lokal starten

Voraussetzung: Node.js ab 22.17 und npm. Dev- und Produktionsserver nutzen zusätzlich
die vertrauenswürdigen Systemzertifikate (`--use-system-ca`), damit die Comfy-Verbindung
auch hinter einem lokal vertrauenswürdigen HTTPS-Proxy funktioniert.

```sh
npm ci
npm run dev
```

Die App ist unter http://localhost:3000 erreichbar.

## Prüfen und bauen

```sh
npm run lint
npm test
npm run build
npm start
```

`npm start` startet den zuvor erstellten Produktionsbuild.

## Dateien

- `src/app/page.tsx`: Arbeitsbereich mit Personenbild-Upload.
- `src/app/layout.tsx`: Root-Layout und Metadaten.
- `src/app/globals.css`: Tailwind und globale Grundfarben.
- `src/components/sidebar.tsx`: Male/Female-Auswahl, Kategorien, Vorlagen und Reset.
- `src/components/sidebar.module.css`: Sidebar-Layout und Darstellung der Vorlagen.
- `src/components/photo-upload.tsx`: lokaler Bild-Upload, Vorschau und Dateiprüfung.
- `src/components/styling-provider.tsx`: gemeinsame Auswahl für Sidebar und Vorschau.
- `src/components/selected-items.tsx`: ausgewählte Styling-Elemente unter dem Personenbild.
- `src/components/flatlay-panel.tsx`: Teile-Auswahl und „Use as outfit“ im Flatlay-Modus.
- `src/components/history-panel.tsx`: rechte, aufklappbare Leiste „Last Generations“ mit laufenden und fertigen Generierungen.
- `src/lib/history-store.ts`: IndexedDB-Speicher für den Verlauf.
- `src/components/upscale-button.tsx`, `src/app/api/upscale/route.ts`, `src/lib/server/upscale-input.ts`, `src/lib/server/comfy-cloud.ts`: Upscaling.
- `src/components/choice-preview.tsx`: Vorschau für Outfit-Vorlagen, Uploads, Background und Pose.
- `public/images/outfit-presets.png`: generierte Outfit-Vorschaubilder.
- `design/comfy-colors.css`: aus Cinematic Studio extrahierte Farbtokens.
- `design/comfy-colors.md`: Quelle und Verwendungszwecke der Farben.
- `design/phosphor-icons-LICENSE.txt`: MIT-Lizenz der Kategorie-Icons (Phosphor Icons, Light) in `src/lib/styling-categories.ts`.

## Comfy Router einrichten

1. Einen Workspace-API-Key auf https://platform.comfy.org erstellen und Credits bereitstellen.
2. `.env.example` nach `.env.local` kopieren (eine leere lokale Datei ist bereits vorbereitet).
3. `COMFY_API_KEY` in `.env.local` eintragen. Niemals `NEXT_PUBLIC_` verwenden oder den Key committen.
4. Dev-Server bei Bedarf neu starten und die App neu laden.
5. Personenfoto hochladen, Outfit oder mindestens eine Kleidungsreferenz wählen und Generate klicken.

Ohne Key bleibt Generate deaktiviert. Der Browser erhält lediglich den Konfigurationsstatus.
Die Anbindung verwendet die dokumentierte HTTP-API ohne zusätzlichen SDK-Wrapper:
https://docs.comfy.org/development/comfy-router/models/openai/gpt-image-2-5-sunburst/code

## Drei Workflows: Try-on, Flatlay und Pose

Der Schalter oben in der Sidebar wechselt zwischen drei Modi. Jeder Modus behält sein eigenes Foto; Ergebnisse bleiben im Verlauf.

- **Try-on:** Personenfoto plus Kleidungsreferenzen ergibt die Person im neuen Outfit (siehe Generierungsablauf).
- **Flatlay:** Foto eines Models, das ein Outfit trägt. In der Sidebar wählt man „Complete outfit“ oder beliebige Teile (Outerwear, Tops, Bottoms, Socks, Shoes, Accessories). „Create flat lay“ erzeugt ein Produktfoto von oben auf reinweißem Hintergrund, das nur die gewählten Teile flach und ohne Person zeigt. Es nutzt dasselbe Modell (GPT Image 2.5 Sunburst) über `POST /api/flatlay` im 2:3-Hochformat (Größe siehe unten) mit `background: "opaque"`; Status und Ergebnis laufen über `GET /api/generate/[token]`.
- **Pose:** Foto einer Person in einer Pose. „Create pose“ erzeugt dieselbe Aufnahme mit einem mattschwarzen, gesichtslosen Mannequin statt der Person: gleicher Bildausschnitt, gleiche Perspektive, gleiche Haltung, auf hellem Studiohintergrund. Zeigt das Foto nur den Oberkörper, zeigt auch das Mannequin nur den Oberkörper. Das Format folgt dem Foto wie im Try-on (Auto, 2K, 4K). Das erste Mannequin aus `src/lib/poses.ts` geht nur als Stil-Referenz für Material, Farbe und Hintergrund mit. Route: `POST /api/pose`, Prompt in `src/lib/server/pose-input.ts`.
- **Save:** Nach einem Flatlay oder einer Pose speichert „Save“ das Bild dauerhaft im Browser (IndexedDB, Speicher `library`) als Kachel in seiner Kategorie; es übersteht einen Reload. Flatlays landen in der aktuellen Male/Female-Sammlung, Posen in beiden. Gespeicherte Kacheln zeigen beim Überfahren ein ×, das sie löscht. Reset lässt sie stehen. Über „+“ hochgeladene Kacheln gelten weiterhin nur für die Sitzung.
- **Use as …:** übernimmt ein fertiges Flatlay oder eine Pose in den Try-on-Modus und wählt es aus; ohne „Save“ nur für die Sitzung, nach „Save“ wird die gespeicherte Kachel ausgewählt. Bei Flatlays gilt: Wurde genau ein Teil extrahiert, landet es in dieser Kategorie (zum Beispiel nur Shoes unter Shoes); bei „Complete outfit“ oder mehreren Teilen unter Outfit. Maßgeblich sind die Teile, mit denen das Flatlay erzeugt wurde. Flatlays erscheinen im Verlauf mit Badge und den gewählten Teilen; ein Klick lädt sie im Flatlay-Modus zurück. Upscale und Download funktionieren wie bei Try-on.
- Der Prompt steht in `src/lib/server/flatlay-input.ts`, die Teile-Liste in `src/lib/flatlay.ts`.

## Qualität

Über dem Generate-Button wählt man die Qualitätsstufe von GPT Image 2.5 Sunburst: Low, Med, High, XHigh oder Max (Standard: High). Höhere Stufen dauern länger und kosten mehr Credits pro Bild. Try-on und Flatlay merken sich ihre Stufe getrennt. Der Server prüft den Wert (`src/lib/quality.ts`) und lehnt unbekannte Stufen ab; die DALL·E-Bezeichnungen `standard` und `hd` liest dieses Modell nicht und werden nicht angeboten. Die Stufe steht im Verlauf und wird beim Zurückladen übernommen.

## Ausgabegröße

Im Try-on wählt „Output size“ zwischen Auto, 2K und 4K. Auto schickt `size: "auto"`: Das Modell übernimmt das Seitenverhältnis des Fotos und wählt selbst rund 1,5 Megapixel. 2K und 4K berechnen eine feste Größe im Seitenverhältnis des Fotos (`src/lib/output-size.ts`): längste Kante 2048 bzw. 3840 px, Kanten durch 16 teilbar, höchstens 3840 × 2160 Pixel insgesamt. Ein 3:4-Foto ergibt so 1536 × 2048 (2K) bzw. 2480 × 3312 (4K). Die Comfy-Doku nennt für `size` keine Grenzen; ob Sunburst diese Größen annimmt, zeigt erst ein echter Lauf. Flatlays behalten in jeder Größe das feste 2:3-Hochformat: Standard 1024 × 1536, 2K 1360 × 2048, 4K 2336 × 3520. Try-on und Flatlay merken sich ihre Größe getrennt; sie steht im Verlauf und wird beim Zurückladen übernommen.

## Upscaling

- Unter einem fertigen Bild öffnet „Upscale“ die Auflösungsauswahl. Jeder Lauf kostet Comfy-Credits.
- Standard ist `wavespeed/ultimate-image-upscaler` über Comfy Router mit 2K, 4K oder 8K. Das Ergebnis wird als JPEG mit `enable_base64_output` angefordert; liefert Comfy stattdessen einen Link, lädt der Server das Bild einmal herunter und prüft es.
- Optional: `COMFY_UPSCALER=seedvr2` in `.env.local` (danach Dev-Server neu starten) führt den eigenen Workflow `src/lib/server/workflows/seedvr2-upscale.json` (SeedVR2, aus ComfyUI im API-Format exportiert) auf **Comfy Cloud** über die Comfy API v2 aus. Das braucht ein **bezahltes Comfy-Cloud-Abo**; ohne Abo lehnt Comfy Cloud den Job ab. Angeboten werden dann 2K (kürzere Kante 2048 px, längste höchstens 4096 px) und 4K (längste Kante 4096 px), mit Fortschritt in Prozent.
  - Ablauf: Das Bild wird als Asset hochgeladen (`POST /api/v2/assets`; `content_type` vor der Datei, `tags` als JSON-Array), in Knoten 9 (Load Image) eingesetzt, Auflösung und Seed werden in Knoten 2 gesetzt, dann startet `POST /api/v2/jobs`. Das Ergebnis kommt aus Knoten 5 (Save Image). Der API-Key wird nur an `cloud.comfy.org` gesendet.
  - Wird der Workflow in ComfyUI geändert, neu im API-Format exportieren und die Knoten-IDs in `src/lib/server/comfy-cloud.ts` prüfen.
- `POST /api/upscale` nimmt das generierte Bild als Data-URL (PNG, JPEG oder WebP, bis 40 Megapixel) und die Auflösung entgegen. Status und Ergebnis laufen wie bei der Generierung über `GET /api/generate/[token]`; das signierte Ticket enthält dafür das Modell.
- Ein Upscale erscheint als eigener Eintrag im Verlauf, mit Badge, Foto und Einstellungen der Ausgangsgenerierung. Bereits hochskalierte Bilder lassen sich nicht erneut hochskalieren.

## Generierungsablauf

- `GET /api/generate`: prüft, ob der Server-Key eingerichtet ist.
- `POST /api/generate`: nimmt Multipart-Dateien und Kategorien entgegen, validiert und normalisiert sie und startet einen Queue-Auftrag.
- `GET /api/generate/[token]`: fragt den Auftrag ab und liefert bei Erfolg das Ergebnis als Bilddaten.
- Der API-Key bleibt auf dem Server. Signierte, 24 Stunden gültige Job-Tickets begrenzen Statusabfragen auf Aufträge, die diese App gestartet hat. Sie sind vertrauliche Zugriffslinks.
- Das Originalbild steht an erster Stelle, danach folgen eindeutig nummerierte Referenzen. Outfit-Presets werden serverseitig aus dem Atlas ausgeschnitten. Hintergrundfarben werden als Anweisung ergänzt. Posen sind Mannequin-Fotos (`public/images/poses`, Liste in `src/lib/poses.ts`), die als Pose-Referenzbild mitgeschickt werden; das Modell übernimmt nur die Haltung, nicht das Aussehen der Puppe. Ein hochgeladenes Pose-Foto wird genauso behandelt. Weitere Posen: Bild ablegen und in `src/lib/poses.ts` hinten anhängen.
- AVIF wird wie die übrigen Formate vor der Weitergabe als JPEG normalisiert; EXIF-Metadaten werden entfernt. Die längste Kante wird auf 2048 px begrenzt.
- Pro Datei gelten 10 MB und 40 Megapixel, zusammen maximal 32 MB Upload. Animierte Dateien werden abgewiesen.
- Der Generate-Button verhindert parallele Klicks. Bei einem unklaren Submit-Fehler verwendet ein erneuter Versuch mit unveränderten Eingaben denselben Idempotency-Key. Nicht blind erneut generieren, wenn bereits ein Auftrag läuft.
- Der Job-Zugriff wird in `sessionStorage` gespeichert, bis der Auftrag abgeschlossen ist. Nach einem Reload wird sein Status erneut abgefragt. Die aktuelle Auswahl wird nicht gespeichert; Fotos und Referenzen vergangener Generierungen liegen im lokalen Verlauf. Nach unterbrochener Statusabfrage kann Check status denselben Auftrag weiterverfolgen.
- Der gelbe Reiter „Last Generations“ am rechten Rand öffnet den Verlauf der letzten 12 Generierungen dieser Sitzung: Ergebnis groß, Datum, Personenfoto und verwendete Styling-Elemente als Thumbnails. Laufende Aufträge zeigen ihren Status. Der Verlauf wird mit Ergebnisbild, Personenfoto und hochgeladenen Referenzen in IndexedDB dieses Browsers gespeichert und übersteht einen Reload. Er verlässt das Gerät nicht; Clear entfernt alle abgeschlossenen Einträge samt Fotos.
- Ein Klick auf ein fertiges Bild im Verlauf lädt es mit Personenfoto, Male/Female-Auswahl und allen Styling-Elementen zurück in die Mitte, ohne Comfy erneut abzufragen. Einträge von vor dieser Funktion haben kein gespeichertes Geschlecht; es wird aus Outfit-Vorlagen abgeleitet, sonst bleibt die aktuelle Auswahl.
- Nach einem Reload wird der zuletzt unterbrochene Auftrag weiter abgefragt. Ältere unterbrochene Aufträge lassen sich im Verlauf per Check status fortsetzen, sobald kein anderer Auftrag läuft.
- Während der Generierung liegt eine Ladeanimation über dem Foto. Das Ergebnis ersetzt danach das Foto im Bildfeld. Neben dem Info-Icon schaltet ein Button den Vorher-nachher-Slider ein; daneben lässt sich das Ergebnis herunterladen. Ein neues Foto verwirft das angezeigte Ergebnis, im Verlauf bleibt es erhalten.

Die Tests simulieren Comfy-Antworten und prüfen Upload, Flatlay, Upscaling, Bildnormalisierung, Preset-Ausschnitte, Queue-Zustände, Ergebnis, Fehler und Job-Tickets. Ein echter Modelllauf benötigt einen gültigen Key mit Credits und ist ohne diesen nicht überprüfbar.

Dies ist zunächst ein lokaler Prototyp ohne Benutzerkonten und dauerhafte Datenbank. Vor einer öffentlichen Bereitstellung brauchen die kostenpflichtigen Generate-Aufrufe Zugangskontrolle und Nutzungsbegrenzungen. Der Host muss Node.js, Sharp und Uploads bis 32 MB unterstützen; bei niedrigeren Hosting-Limits ist direkter Asset-Upload als nächster Schritt nötig.

Die aktuelle Auswahl wird im Browser-Arbeitsspeicher gehalten. Referenzbilder werden
lokal als Objekt-URLs angezeigt und beim Reset freigegeben. Das Personenbild bleibt
ebenfalls lokal und kann per Klick auf das Bild oder Drag-and-drop ersetzt werden. Die Steuerung ist
mit der serverseitigen Bildgenerierung verbunden. Beim Klick auf Generate werden das Foto
und die ausgewählten Referenzbilder zur Verarbeitung an Comfy übermittelt.

Die Sidebar-Auswahl erscheint sofort als Thumbnail in „Selected items“ unter dem Personenbild.
Ein Klick auf ein Thumbnail öffnet die Großansicht; das Kreuz entfernt den Eintrag.
In der Sidebar wählt erneutes Anklicken einen Eintrag ab; Male und Female behalten getrennte
Auswahlen. Reset leert beide Kollektionen und alle Styling-Vorschauen.
