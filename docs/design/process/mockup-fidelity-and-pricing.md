# Mockup fidelity and pricing

A mockup is reviewed as if it were the product. What it draws is what the user approves, so it must
either copy the real UI or say clearly that it proposes something new, and what that costs.

## Copy the real UI

- Draw the real controls with their real meaning: the same chip variant, color and label
  (`components/chips.md`), the same buttons, the same field labels, the same data literals.
- **Never invent a case by copying badly.** A chip copied with the wrong label or color tells the
  reviewer the product has a state it does not have. Before drawing a control, read the component
  that renders it and the helper that picks its color or label.
- Use real copy from the feature's constants where it exists, and real data shapes (Spanish data
  literals stay Spanish; UI copy is English).
- Port Legacy intent, never its literal colors (`foundations/color-tokens.md`).

## Improvement proposals are labelled

Anything that does not exist yet (a new control, a new state, a new count, a different action) is an
**improvement proposal**. Label it as such in the mockup, separate from the faithful copy, so the
reviewer approves it knowingly.

## Price every behavior change

When a proposed UI changes behavior in code, state its price next to it:

| Price | Scope | Examples |
|---|---|---|
| `$` | UI only: markup, classes, copy, which existing component renders | an empty state's kind, layout or copy |
| `$$` | Rewire an existing callback | an action that calls a handler or route the surface already has |
| `$$$` | New logic, delivered test-first with mutation testing | a filter reset a store does not have; a derived count |
| `$$$$` | A new contract: navigation, the keyboard registry, Go / Wails bindings | deep-linking to a specific tab; a new shortcut; a new backend field |

- The price follows the most expensive part of the change.
- A `$$$` or `$$$$` enhancement is out of scope unless the user approves it explicitly.
- A change to a mockup the user commented on changes only that mockup; ask before propagating it to
  others.

## After approval

The approved mockup becomes the spec. Deviations found while building (a label that does not exist,
a callback that is missing) go back to the user with their price instead of being improvised.
