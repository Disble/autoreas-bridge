import { Card } from '@heroui/react';
import { SeasonModePanel } from '../../features/preferences/ui/SeasonModePanel/SeasonModePanel';

export function PreferencesRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Opciones</h1>
        <p className="text-sm text-muted">Configura el comportamiento de la aplicación</p>
      </header>

      <div className="grid min-w-0 gap-4">
        <Card>
          <Card.Header>
            <Card.Title>Modo Temporada</Card.Title>
            <Card.Description>Controla cómo se abre la sección de animes al navegar</Card.Description>
          </Card.Header>
          <Card.Content>
            <SeasonModePanel />
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
