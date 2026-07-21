import { Card } from '@heroui/react';
import { Link } from 'react-router';

/**
 * NotFoundRoute shows the fallback screen for unknown bridge UI paths.
 */
export function NotFoundRoute() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Page not found</Card.Title>
        <Card.Description>The route you asked for does not exist in the bridge UI.</Card.Description>
      </Card.Header>
      <Card.Content>
        <Link className="text-sm font-semibold text-primary underline" to="/today">
          Go to Today
        </Link>
      </Card.Content>
    </Card>
  );
}
