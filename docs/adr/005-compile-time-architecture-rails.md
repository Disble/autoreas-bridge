# ADR 005: Compile-Time Architecture Rails

## Status
Accepted

## Context
Bridge frontend architecture must be enforced at compile/lint time, not only by code review. Otherwise the next rushed edit puts Wails calls back into `App.tsx` and we are back to square one.

## Decision
Architecture rules become compile-time rails wherever possible.
1. Delivery files (`frontend/src/App.tsx`, `frontend/src/app/**`) cannot import React state/effect hooks or Wails bindings.
2. Feature `.tsx` and `use-*.ts` files cannot declare root-level constants, helper functions, interfaces, type aliases, or inline schemas.
3. `*Props` fields in `*.types.ts` must be `readonly`.
4. Exported helpers in `*.helpers.ts` require JSDoc.
5. The feature generator must emit code that already complies with these rails.

## Consequences
* **Positive:** lint failures expose architectural drift immediately.
* **Negative:** some legitimate edge cases may need future rule exceptions.
