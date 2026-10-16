# Comfy color reference

Source: https://comfy.org/hub/apps/cinematic-studio/

Captured on 2026-10-16 from the loaded page's root CSS variables and computed element styles. This records the observed site palette, not a published integration specification. The accompanying `comfy-colors.css` preserves original token names and adds proposed `--app-*` aliases.

## Main interface colors

| Role | Value | Original token / observation |
| --- | --- | --- |
| Page background | `#211927` | `--color-primary-comfy-ink`; verified on body |
| Primary accent / filled CTA | `#F2FF59` | `--color-primary-comfy-yellow`; verified on CTA |
| Text on primary CTA | `#211927` | Verified on CTA |
| Bright content / scene text | `#F0EFED` | `--color-primary-warm-white`; verified on scene textarea |
| Secondary content | `#C2BFB9` | `--color-primary-comfy-canvas` / `--color-content` |
| Muted text / placeholder | `#7E7C78` | `--color-primary-warm-gray` |
| Panels | `rgb(255 255 255 / 4%)` | Verified on Shot settings panel |
| Panel borders | `rgb(255 255 255 / 8%)` | Verified on Shot settings panel |
| Scene input surface | `rgb(255 255 255 / 4%)` | Verified on scene field wrapper |
| Scene input border | `rgb(255 255 255 / 20%)` | Verified on scene field wrapper |
| Hover surface | `#FFFFFF14` | `--color-hub-surface-hover` (approximately 8% white) |
| Dropdown background | `#332B38` | `--color-site-dropdown` |

Transparent layers must remain transparent: a panel and an input inside it compose on top of each other. A single flattened gray does not reproduce the same result.

The site's transparency tokens use 8-digit hex values (for example `#FFFFFF0A`), while the panel utility classes resolve to exact `rgba` percentages. This causes negligible rounding differences; both were recorded as observed.

## Supporting tokens available on the page

| Token role | Value |
| --- | --- |
| Ink light | `#2A2330` |
| Comfy plum | `#49378B` |
| Deep plum | `#2B2040` |
| Mauve | `#4D3762` |
| Charcoal | `#242428` |
| Cool gray | `#3C3C3C` |
| Workflow selection | `#A894EF` |
| Comfy orange | `#FABC25` |
| Comfy red | `#FF3B3B` |
| Destructive | `#F44336` |
| Destructive light | `#FFB4A8` |
| Alternate brand yellow | `#F0FF41` |

Use `#F2FF59` for the observed Cinematic Studio CTA styling; the alternate brand-yellow token also exists but is not the inspected CTA's background.
