# Anime Cover Rendering Specification

## Purpose

Any surface that renders a stored anime cover MUST resolve it through the `GetAnimeCover`
binding rather than rendering the stored path directly. The stored cover is an object
(`{"path":"D:\\User\\Downloads\\....jpg","type":"image"}`) that Go flattens to a plain path
string on `MobileAnime.Cover`; WebView2 cannot load a bare Windows filesystem path from the
Wails asset origin. Episodes/Today already renders the same anime correctly by going through
this binding.

## Requirements

### Requirement: Covers resolve through the binding, never a raw stored path

Any surface rendering a stored cover MUST call the `GetAnimeCover` binding for the selected
anime and render its resolved `dataUrl`. It MUST NOT pass the stored cover path
(`MobileAnime.Cover` / `AnimeDetail.cover`) directly to an image element or equivalent. An
empty stored path or the literal string `"null"` MUST render the placeholder without calling
the binding.

#### Scenario: A local-path cover resolves and renders

- GIVEN the selected anime has a non-empty, non-`"null"` stored cover path
- WHEN the surface loads the anime
- THEN it calls `GetAnimeCover` for that anime id
- AND it renders the binding's resolved `dataUrl`, not the raw stored path

#### Scenario: An empty or sentinel stored path skips the binding

- GIVEN the selected anime's stored cover path is empty or the literal string `"null"`
- WHEN the surface loads the anime
- THEN it renders the placeholder
- AND it does NOT call `GetAnimeCover`

### Requirement: Every cover-resolution failure falls back to the placeholder

A surface resolving a cover through the binding MUST render the placeholder when the binding
call fails, when the binding returns `source: "placeholder"`, or when the resolved image fails
to decode (an `onError` event, or a loaded image reporting zero `naturalWidth`).

#### Scenario: A binding failure renders the placeholder

- GIVEN `GetAnimeCover` rejects or throws
- WHEN the surface handles the result
- THEN it renders the placeholder
- AND it does not treat the failure as a decodable image

#### Scenario: A `placeholder`-source response renders the placeholder

- GIVEN `GetAnimeCover` resolves with `source: "placeholder"`
- WHEN the surface renders the result
- THEN it renders the placeholder, not an empty or broken image

#### Scenario: A decode failure falls back to the placeholder

- GIVEN a resolved `dataUrl` is assigned to an image element
- WHEN that image fires `onError`, or loads with `naturalWidth` of zero
- THEN the surface falls back to rendering the placeholder
