# Chips — one style: `soft`

Every chip is HeroUI's `variant="soft"`: a tinted background (`--<color>-soft`) with its matching text
(`--<color>-soft-foreground`) and **no border**. Pick the semantic `color` for the role (`accent`,
`success`, `warning`, `danger`, `default`) and `size="sm"` by default.

```tsx
<Chip color="accent" size="sm" variant="soft">Unsaved</Chip>

{/* With an icon, when the case calls for one */}
<Chip color="accent" size="sm" variant="soft">
  <Icon aria-hidden="true" className="size-3.5" icon={checkIcon} />
  <Chip.Label>Origin</Chip.Label>
</Chip>
```

- **The icon is optional, decided per case.** Add one at the start or the end only when it carries
  meaning the text does not; decorative icons are `aria-hidden`. With an icon, wrap the text in
  `Chip.Label` so the spacing is HeroUI's.
- **Never** a bordered pill, an outline in the text color, or a hand-styled `<span>` that imitates a
  chip.
- Do not use `primary` (solid), `secondary` or `tertiary` for new chips. This is not retroactive:
  chips with another variant, or none, move to `soft` in the unit that next touches their file.
- A chip's color carries a meaning (a level, a domain, an `estado`, a status). Take it from the
  helper that owns that mapping (`foundations/color-tokens.md`); never pick a color because it looks
  right.
- In a list row, a status chip is a one-word tag in a fixed-width slot (`patterns/lists.md`).

## Mockups

A mockup draws chips exactly as the app does, with their real labels and colors, so the reviewed
design is the one that ships. Copying a chip wrongly invents a case the product does not have; see
`process/mockup-fidelity-and-pricing.md`.
