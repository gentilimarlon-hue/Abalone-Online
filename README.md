# Abalone Online – Projektbasis

Dieses Projekt enthält die aktuelle Abalone-Version als `index.html` und die vorbereitete Supabase-Datenbankschema-Datei.

## Geplante Architektur

- **GitHub Pages**: veröffentlicht die statische Web-App.
- **Supabase**: speichert Spielräume und synchronisiert Spielzustände in Echtzeit.
- **Einladungslinks**: verweisen auf die veröffentlichte App mit einer Raum-ID, z. B. `https://DEINNAME.github.io/abalone-online/?room=AB12CD`.

## Veröffentlichung über GitHub

1. In GitHub ein neues öffentliches Repository namens `abalone-online` erstellen.
2. `index.html`, `supabase/schema.sql` und diese README hochladen.
3. Im Repository `Settings → Pages` öffnen.
4. Unter `Build and deployment` die Quelle `Deploy from a branch`, Branch `main`, Ordner `/ (root)` auswählen und speichern.
5. Nach der Veröffentlichung ist die App unter `https://gentilimarlon-hue.github.io/abalone-online/` erreichbar (sofern der Repository-Name `abalone-online` lautet).

## Supabase vorbereiten

1. Unter https://supabase.com ein Projekt erstellen.
2. Im Supabase-Dashboard `SQL Editor` öffnen.
3. Den Inhalt von `supabase/schema.sql` ausführen.
4. Unter `Project Settings → API` die Project URL und den `anon`/publishable key bereithalten.

**Wichtig:** Der `service_role`-Key darf niemals in eine HTML-Datei oder in GitHub eingecheckt werden. Für die Browser-App wird ausschließlich der öffentliche `anon`/publishable key verwendet; Zugriffe müssen durch Row Level Security abgesichert sein.

## Status

Diese Lieferung ist die Projekt- und Hosting-Grundlage. Die aktuelle `index.html` ist weiterhin die funktionierende lokale Spielversion. Die Mehrspieler-Oberfläche, Raumverwaltung, sichere Zugprüfung und Echtzeit-Synchronisierung werden im nächsten Implementierungsschritt mit den konkreten Supabase-Projektdaten verbunden. Noch keine Online-Partien möglich.
