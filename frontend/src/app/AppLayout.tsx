import { Card, Separator, buttonVariants } from '@heroui/react';
import { NavLink, Outlet } from 'react-router';

export function AppLayout() {
  const getNavClassName = ({ isActive }: { isActive: boolean }) =>
    `${buttonVariants({ variant: isActive ? 'primary' : 'outline' })} justify-center whitespace-nowrap lg:justify-start`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 2xl:px-10 2xl:py-8 xl:flex-row xl:items-start xl:gap-8">
        <aside className="w-full xl:sticky xl:top-8 xl:max-w-72 xl:shrink-0 2xl:max-w-80">
          <Card className="overflow-hidden">
            <Card.Header className="gap-2">
              <div className="space-y-1">
                <Card.Title>Autoreas Bridge</Card.Title>
                <Card.Description>Desktop shell for sync, pairing, diagnostics, and bridge operations</Card.Description>
              </div>
            </Card.Header>
            <Card.Content className="flex flex-col gap-4">
              <nav aria-label="Bridge navigation" className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-1">
                <NavLink className={getNavClassName} to="/dashboard">
                  Dashboard
                </NavLink>
                <NavLink className={getNavClassName} to="/status">
                  Status
                </NavLink>
                <NavLink className={getNavClassName} to="/pairing">
                  Pairing
                </NavLink>
                <NavLink className={getNavClassName} to="/observability">
                  Observability
                </NavLink>
              </nav>

              <Separator />

              <div className="space-y-1 text-sm text-muted">
                <p className="font-medium text-foreground">Layout intent</p>
                <p>Compact navigation on small windows, stable workspace on large screens.</p>
              </div>
            </Card.Content>
          </Card>
        </aside>

        <main className="min-w-0 flex-1 pb-8 xl:pt-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
