# NitroDrp style

Opus follows the NitroDrp private file transfer design: a terminal-flavoured, hard-edged
look. Dark ("Night Signal") is the default; light is "Concrete Signal".

## Night Signal (dark)
| Token   | Hex       | Used for                              |
|---------|-----------|---------------------------------------|
| ground  | `#0A0A0A` | page, with a faint dot grid           |
| surface | `#151515` | cards, rows                           |
| ink     | `#F5F5F5` | text and borders                      |
| muted   | `#A3A3A3` | secondary text                        |
| rule    | `#2E2E2E` | row dividers                          |
| accent  | `#FF5A1F` | primary action, progress              |
| marker  | `#C6F432` | highlighted words, done, links        |
| pop     | `#FF2E93` | offset shadow on actions              |
| lift    | `#3A3A3A` | offset shadow on cards                |

## Concrete Signal (light)
ground `#E9E8E3`, surface `#F7F7F4`, ink `#111111`, accent `#D63A12`, marker `#C6F432`, pop `#FF2E93`.

## Rules
- Headlines, labels, numbers and buttons: Space Mono. Body: Inter.
- Each page opens with a `$ command` eyebrow, a headline with one lime-marked phrase, and a blinking lime cursor.
- Cards: 2px ink border, 6px radius, `5px 5px 0` offset shadow in lift grey.
- Primary buttons: accent fill, dark text, 2px ink border, `4px 4px 0` pink shadow. Secondary: surface fill, lime text.
- Inputs and chips: 4px radius, 2px ink border.
- Lime means done or healthy. Orange means act or progress. Pink is only ever a shadow.
