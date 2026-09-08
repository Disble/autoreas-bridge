# Delta for Desktop Navigation

## MODIFIED Requirements

### Requirement: Default Landing and Route Redirects

The application root (`/`) MUST default to `/today`. Every removed or renamed route MUST redirect to its replacement without a dead end. The static `/editor/create` route MUST resolve before `/editor/:id`, MUST select the Create tab, and MUST render the existing Create workspace. `/editor` and `/editor/:id` MUST continue to select the Library tab.

(Previously: The editor routes retained Library behavior without a static Create deep link.)

#### Scenario: Root redirect

- GIVEN a user opens the app with no path
- WHEN the router resolves `/`
- THEN it MUST redirect to `/today`

#### Scenario: Legacy route redirects

- GIVEN a user navigates to a removed or renamed path
- WHEN the router resolves `/episodes`, `/network`, `/status`, `/pairing`, `/dashboard`, or `/preferences`
- THEN it MUST redirect respectively to `/today`, `/activity`, `/activity`, `/devices`, `/today`, `/settings`
- AND `/editor` MUST remain unchanged

#### Scenario: Static Create route wins over the editor identifier route

- GIVEN a user opens `/editor/create`
- WHEN the router resolves the path
- THEN it MUST render the Create tab and existing Create workspace
- AND it MUST NOT treat `create` as an anime identifier

#### Scenario: Library routes preserve existing behavior

- GIVEN a user opens `/editor` or `/editor/anime-123`
- WHEN the router resolves the path
- THEN it MUST select the Library tab
- AND `/editor/anime-123` MUST retain its identifier-driven editor behavior
