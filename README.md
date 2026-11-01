# Kebab Farm Social

Postet jeden Tag automatisch einen Kebab-Farm-Clip auf Instagram Reels, YouTube Shorts und TikTok.
Läuft über GitHub Actions, dein PC muss dafür nicht an sein.

## So läuft es

1. **Material:** In Roblox tippst du `/film clips`, und `Aufnahme.cmd` nimmt den Film auf. Der Film besteht aus 13 kurzen Einstellungen mit zufälligen Kamerawinkeln.
2. **Clips:** `make-clips.js` schneidet daraus bis zu 6 Hochkant-Clips (10–17 s). Dazu kommen eigene Beats, ein Hook-Text, ein Abspann „KEBAB FARM – Play now on Roblox“ und Captions, Titel und Hashtags.
3. **Warteschlange:** Die Clips landen in `posts.json`, die Videos auf GitHub Pages.
4. **Posten:** Der Workflow `.github/workflows/post.yml` postet täglich um 16:00 UTC (17:00 Winterzeit, 18:00 Sommerzeit) den nächsten Clip auf jeder eingeschalteten Plattform. Gepostete Videos werden danach von Pages gelöscht.
5. **Nachschub:** Bei 3 oder weniger Clips legt der Workflow ein Issue „Clip-Nachschub“ an, GitHub schickt dir dazu eine Mail. Wenn ein Post fehlschlägt, bekommst du ebenfalls eine Mail.

## Alltag

| Was | Wie |
|---|---|
| Neue Clips | `Aufnahme.cmd` doppelklicken → Roblox → `/film clips` → nach dem Film Enter |
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
