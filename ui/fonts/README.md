# The faces, and where each comes from

The kit names three faces in `values.css` (ADR-039 D5):

| Variable | Face | For | Comes from |
| --- | --- | --- | --- |
| `--face-text` | Inter | reading text, forms, tables | the pinned package `@fontsource-variable/inter`, imported by `ui.css` |
| `--face-mono` | LFT Etica Mono | codes, numbers, small uppercase labels | **the hub**, through the `@font-face` layer below |
| `--face-display` | Kinetika | titles, buttons, app names | **the hub**, the same layer |

Kinetika and LFT Etica Mono are licensed to Brax. They are not in this repository and must not be added to it, not as
files and not as data URIs (the owner's prototype embeds them that way; that copy stays on his PC). Every stack in
`values.css` ends in system fallbacks, so a page without the layer still reads, in system-ui and the system's mono face.

## The `@font-face` layer the hub serves (proposed)

HUB-SHELL §2.5 has the hub self-host its fonts under `/hub/assets/fonts/` so that `font-src 'self'` holds, and §17 R8
records that the two faces are committed to the hub server's private repository and ship in its image. So the hub is the
one place that has them, and a page gets them by linking one stylesheet the hub serves:

```html
<link rel="stylesheet" href="/hub/assets/fonts/hub-fonts.css">
```

`hub-fonts.example.css` beside this file is what that stylesheet needs to say: two `@font-face` rules with the family
names the kit's stacks expect, `"Kinetika"` and `"LFT Etica Mono"`, pointing at the files under `/hub/assets/fonts/`.
Nothing in the kit changes when the hub adds or renames a weight; the kit only names the families.

A module in its frame on the hub is same-origin (HUB-SHELL §4), so the link above works there as it is. An app served
on its own, outside the hub, shows the fallbacks unless it carries the faces itself, which the licence must allow.

## The question put to the owner in the FE01 pull request

Should the two licensed faces be served by the hub, as above (recommended), or copied into each app's build from a
private package? Serving them from the hub keeps one licensed copy, keeps `font-src 'self'`, and lets every module and
app pick them up with one link.
