import { toActivityJsonTokens } from './activity-technical-json.helpers';
import { ACTIVITY_TECHNICAL_CODE_CLASS, ACTIVITY_TECHNICAL_JSON_TOKEN_CLASS } from './activity-technical-view.constants';
import type { ActivityTechnicalJsonProps } from './activity-technical-view.types';

/**
 * A stored JSON body in the mockup's dark code box (`.ax-code`), its keys and
 * string values coloured as the mockup's tokenizer colours them.
 */
export function ActivityTechnicalJson({ raw }: ActivityTechnicalJsonProps) {
  return (
    <pre className={`${ACTIVITY_TECHNICAL_CODE_CLASS} whitespace-pre`}>
      {toActivityJsonTokens(raw).map((token) => (
        <span className={ACTIVITY_TECHNICAL_JSON_TOKEN_CLASS[token.kind]} key={token.offset}>
          {token.text}
        </span>
      ))}
    </pre>
  );
}
