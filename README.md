# Kebab Farm Social

Postet 3-mal am Tag automatisch einen Kebab-Farm-Clip auf Instagram Reels, YouTube Shorts und TikTok (TikTok als Entwurf in der App).
Läuft über GitHub Actions, dein PC muss dafür nicht an sein.

## So läuft es

1. **Material:** In Roblox tippst du `/film clips 3`, und `Aufnahme.cmd` nimmt die Filme auf: 3 Durchgänge mit je 13 kurzen Einstellungen und zufälligen Kamerawinkeln. Eine Aufnahme pro Woche reicht.
2. **Clips:** `make-clips.js` schneidet daraus pro Durchgang bis zu 9 Hochkant-Clips (8–18 s) in 9 Formaten. Struktur: in der ersten Sekunde das stärkste Bild mit Hook, dann Schnitte im Takt. Dazu kommen eigene Beats, ein Hook-Text, ein Abspann „KEBAB FARM – Play now on Roblox“ und Captions, Titel und Hashtags.
3. **Warteschlange:** Die Clips landen in `posts.json`, die Videos auf GitHub Pages.
4. **Posten:** Der Workflow `.github/workflows/post.yml` postet um 11, 16 und 20 Uhr UTC (12, 17 und 21 Uhr Winterzeit, im Sommer je eine Stunde später) einen Clip auf jeder eingeschalteten Plattform. Welcher Clip: nie dasselbe Format zweimal hintereinander, möglichst aus einem anderen Durchgang (`pickPost` in `lib/queue.js`). Gepostete Videos werden danach von Pages gelöscht.
5. **Nachschub:** Bei 9 oder weniger Clips (3 Tage) legt der Workflow ein Issue „Clip-Nachschub“ an, GitHub schickt dir dazu eine Mail. Das Issue schließt sich von selbst, sobald neue Clips da sind. Wenn ein Post fehlschlägt, bekommst du ebenfalls eine Mail.

## Alltag

| Was | Wie |
|---|---|
| Neue Clips | `Aufnahme.cmd` doppelklicken → Roblox → `/film clips 3` → nach den Filmen Enter |
| Stand ansehen | `Status.cmd` doppelklicken |
| Verbindungen prüfen | `npm run setup -- check` |
| Sofort posten / Probelauf | GitHub → Actions → „Kebab Farm posten“ → Run workflow |

## Einrichtung (einmalig)

```
npm run setup                 # GitHub: Repo, Schlüssel, Pages
npm run setup -- instagram    # Instagram (Creator-/Business-Konto)
npm run setup -- tiktok       # TikTok (erst als Entwurf in die App, nach dem Audit direkt)
npm run setup -- youtube      # YouTube (bleibt bis zum Audit aus)
```

Später:

- `npm run setup -- enable youtube` schaltet YouTube ein, sobald Google das API-Audit bestätigt hat.
- `npm run setup -- tiktok-direct` schaltet TikTok auf öffentliches Direkt-Posten, sobald TikTok das Audit bestätigt hat.

## Plattformen

| Plattform | Ab wann öffentlich | Bis dahin |
|---|---|---|
| Instagram | sofort | – |
| TikTok | nach TikTok-Audit | Entwurf in der TikTok-App, du tippst auf „Posten“ |
| YouTube | nach YouTube-API-Audit | aus (sonst macht YouTube jedes Video privat) |

## Dateien

- `config.json`: Plattformen an/aus, TikTok-Modus, Spiel-Link
- `posts.json`: Warteschlange mit allen Clips und Texten
- `state/`: was wo gepostet ist (`posted.json`, `history.jsonl`) und die verschlüsselten Zugangsdaten (`tokens.enc`)
- `content/`: Hooks, Captions, Hashtags (`texts.js`) und Schnitt-Rezepte (`recipes.js`)
- `local/`: nur auf deinem PC (Aufnahmen, Material, fertige Videos, Musik, Schlüssel `local/.env`)

`local/.env` enthält den Schlüssel zu allen Zugängen. Diese Datei niemals teilen.
