import { Card } from '@heroui/react';
import { Link } from 'react-router';

export function NotFoundRoute() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Page not found</Card.Title>
        <Card.Description>The route you asked for does not exist in the bridge UI.</Card.Description>
      </Card.Header>
      <Card.Content>
        <Link className="text-sm font-semibold text-primary underline" to="/dashboard">
          Go to dashboard
        </Link>
      </Card.Content>
    </Card>
  );
}
