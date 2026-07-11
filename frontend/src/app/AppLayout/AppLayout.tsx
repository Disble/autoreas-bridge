import { Icon } from '@iconify/react';
import { NavLink, Outlet } from 'react-router';
import { NotificationToasts } from '../NotificationToasts';
import { APP_LAYOUT_BRIDGE_MARK_PATHS, APP_LAYOUT_NAV_ITEMS } from '../../shared/navigation/app-layout.constants';
import { railItemClass, tabItemClass } from './AppLayout.helpers';

/**
 * AppLayout composes the shared shell for every bridge route, including the
 * desktop rail, mobile navigation, toast host, and routed outlet.
 */
export function AppLayout() {
  const bridgeMark = (
    <svg
      aria-hidden="true"
      className="size-full"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={APP_LAYOUT_BRIDGE_MARK_PATHS.arc} />
      <circle
        cx={APP_LAYOUT_BRIDGE_MARK_PATHS.leftNode.cx}
        cy={APP_LAYOUT_BRIDGE_MARK_PATHS.leftNode.cy}
        fill="currentColor"
        r={APP_LAYOUT_BRIDGE_MARK_PATHS.leftNode.r}
      />
      <circle
        cx={APP_LAYOUT_BRIDGE_MARK_PATHS.rightNode.cx}
        cy={APP_LAYOUT_BRIDGE_MARK_PATHS.rightNode.cy}
        fill="currentColor"
        r={APP_LAYOUT_BRIDGE_MARK_PATHS.rightNode.r}
      />
      <path d={APP_LAYOUT_BRIDGE_MARK_PATHS.mast} />
    </svg>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NotificationToasts />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-divider/60 bg-background/85 px-4 backdrop-blur md:hidden">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <span className="size-4">{bridgeMark}</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">Autoreas Bridge</span>
      </header>

      <div className="flex w-full">
        <aside className="group/rail sticky top-0 z-20 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-divider/60 bg-content1/40 backdrop-blur-xl md:flex md:w-16 md:transition-[width] md:duration-200 md:ease-out md:hover:w-56 md:focus-within:w-56">
          <div className="flex h-16 shrink-0 items-center gap-3 px-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <span className="size-5">{bridgeMark}</span>
            </div>
            <div className="min-w-0 overflow-hidden opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">Autoreas</p>
              <p className="truncate text-[11px] text-muted">Bridge workspace</p>
            </div>
          </div>

          <nav aria-label="Bridge primary navigation" className="flex flex-col gap-1 px-2 py-1">
            {APP_LAYOUT_NAV_ITEMS.map(({ to, label, icon }) => (
              <NavLink className={railItemClass} key={to} to={to}>
                <Icon aria-hidden="true" className="size-5 shrink-0" icon={icon} />
                <span className="overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
                  {label}
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto px-3 pb-4 pt-2 text-[11px] text-muted opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
            <p className="truncate">Desktop ↔ Mobile sync</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 xl:px-10 xl:py-8">
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        aria-label="Bridge mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-divider/60 bg-background/90 backdrop-blur md:hidden"
      >
        {APP_LAYOUT_NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink className={tabItemClass} key={to} to={to}>
            <Icon aria-hidden="true" className="size-5" icon={icon} />
            <span className="font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
