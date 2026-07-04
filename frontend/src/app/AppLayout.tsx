import type { SVGProps } from 'react';
import { NavLink, Outlet } from 'react-router';
import { NotificationToasts } from './NotificationToasts';

type NavItem = {
  readonly to: string;
  readonly label: string;
  readonly Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
};

function BridgeMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M3 17c3-8 15-8 18 0" />
      <circle cx="5" cy="17" fill="currentColor" r="1.6" />
      <circle cx="19" cy="17" fill="currentColor" r="1.6" />
      <path d="M12 4v3" />
    </svg>
  );
}

function NetworkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect height="14" rx="1.2" width="18" x="3" y="4" />
      <path d="M7 9h10" />
      <path d="M7 13h6" />
    </svg>
  );
}

function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect height="9" rx="1.2" width="8" x="3" y="3" />
      <rect height="5" rx="1.2" width="8" x="13" y="3" />
      <rect height="9" rx="1.2" width="8" x="13" y="12" />
      <rect height="5" rx="1.2" width="8" x="3" y="16" />
    </svg>
  );
}

function StatusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </svg>
  );
}

function AnimeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect height="20" rx="2" width="20" x="2" y="2" />
      <path d="M7 2v20" />
      <path d="M17 2v20" />
      <path d="M2 12h20" />
      <path d="M2 7h5" />
      <path d="M2 17h5" />
      <path d="M17 17h5" />
      <path d="M17 7h5" />
    </svg>
  );
}

function ChaptersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M6 4h12" />
      <path d="M6 8h12" />
      <path d="M6 12h8" />
      <path d="M6 16h6" />
      <path d="M17 14v6" />
      <path d="M14 17h6" />
    </svg>
  );
}

function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

function PairingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect height="7" rx="1" width="7" x="3" y="3" />
      <rect height="7" rx="1" width="7" x="14" y="3" />
      <rect height="7" rx="1" width="7" x="3" y="14" />
      <path d="M14 14h3v3" />
      <path d="M20 14v.01" />
      <path d="M14 20h.01" />
      <path d="M17 20h4v-3" />
    </svg>
  );
}

function OptionsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M12 3v1" />
      <path d="M12 20v1" />
      <path d="M4.22 4.22l.71.71" />
      <path d="M19.07 19.07l.71.71" />
      <path d="M3 12h1" />
      <path d="M20 12h1" />
      <path d="M4.22 19.78l.71-.71" />
      <path d="M19.07 4.93l.71-.71" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/network', label: 'Network', Icon: NetworkIcon },
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/animes', label: 'Animes', Icon: AnimeIcon },
  { to: '/chapters', label: 'Chapters', Icon: ChaptersIcon },
  { to: '/downloads', label: 'Downloads', Icon: DownloadIcon },
  { to: '/status', label: 'Status', Icon: StatusIcon },
  { to: '/pairing', label: 'Pairing', Icon: PairingIcon },
  { to: '/preferences', label: 'Opciones', Icon: OptionsIcon },
];

const railItemClass = ({ isActive }: { isActive: boolean }) =>
  [
    'group/item relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors',
    'focus-visible:ring-2 focus-visible:ring-primary/60',
    isActive
      ? 'bg-primary/15 text-primary font-medium'
      : 'text-muted hover:bg-content2/60 hover:text-foreground',
  ].join(' ');

const tabItemClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors',
    isActive ? 'text-primary' : 'text-muted hover:text-foreground',
  ].join(' ');

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NotificationToasts />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-divider/60 bg-background/85 px-4 backdrop-blur md:hidden">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <BridgeMark className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Autoreas Bridge</span>
      </header>

      <div className="flex w-full">
        <aside className="group/rail sticky top-0 z-20 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-divider/60 bg-content1/40 backdrop-blur-xl md:flex md:w-16 md:transition-[width] md:duration-200 md:ease-out md:hover:w-56 md:focus-within:w-56">
          <div className="flex h-16 shrink-0 items-center gap-3 px-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <BridgeMark className="size-5" />
            </div>
            <div className="min-w-0 overflow-hidden opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">Autoreas</p>
              <p className="truncate text-[11px] text-muted">Bridge workspace</p>
            </div>
          </div>

          <nav aria-label="Bridge primary navigation" className="flex flex-col gap-1 px-2 py-1">
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <NavLink className={railItemClass} key={to} to={to}>
                <Icon aria-hidden="true" className="size-5 shrink-0" />
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
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink className={tabItemClass} key={to} to={to}>
            <Icon aria-hidden="true" className="size-5" />
            <span className="font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
