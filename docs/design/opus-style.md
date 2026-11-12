# Opus style (current)

The original Opus palette, with a handful of pieces borrowed from the NitroDrp design.
This replaces the earlier Obsidian Pop and full NitroDrp palettes, which are kept only as history.

## Palette (original, unchanged)
| Token | Light | Dark |
|-------|-------|------|
| paper | `#fdfdfb` | `#000000` |
| paper-2 | `#f3f1ec` | `#141412` |
| ink | `#0a0a0a` | `#f5f5f0` |
| gold | `#b4904e` | `#d2b072` |
| green | `#0e5a43` | `#3dbf8f` |
| bad | `#c8321e` | `#ff6b55` |

Fonts stay Archivo (display) and Geist (body).

## Taken from NitroDrp
- Dot-grid page ground.
- `$ command` eyebrow above each page headline.
- One marked phrase per headline, in gold, plus a blinking cursor.
- Space Mono for buttons, chips, pills, nav and small labels.
- Hard offset shadows on cards, rows and buttons (primary buttons use an ink offset).
- 4px / 6px corner radii.
- Dashed idea cards on the Ask page and a dashed preview notice.

## Not taken
NitroDrp's orange, lime and pink. Gold marks what needs you, green means healthy or keep.

## Screens
| Today | Subscriptions |
|---|---|
| ![Today](screens/op-today.png) | ![Subscriptions](screens/op-subscriptions.png) |

| Ask | Light theme |
|---|---|
| ![Ask](screens/op-ask.png) | ![Light](screens/op-light.png) |

Mobile: ![Mobile](screens/op-mobile.png)

## Where it lives
Original tokens are at the top of `dashboard/src/styles.css`. Everything borrowed from NitroDrp is in the section "NitroDrp pieces on the original Opus palette" at the bottom.
