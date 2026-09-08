import { Tabs } from '@heroui/react';
import { AnimeCreate } from '../../features/anime-create/ui/AnimeCreate/AnimeCreate';
import { AnimeEditorWorkspace } from '../../features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorWorkspace';
import type { AnimeEditorRouteProps } from './AnimeEditorRoute.types';

/** AnimeEditorRoute mounts a Library/Create tab shell as its own routed surface. */
export function AnimeEditorRoute({ initialTab = 'library' }: Readonly<AnimeEditorRouteProps>) {
  return (
    <section className="flex min-h-screen flex-col gap-4">
      {/*
        Keyed by the requested tab because HeroUI's Tabs is uncontrolled here:
        `defaultSelectedKey` is read once at mount, so an already-mounted
        `/editor` navigating to `/editor/create` would otherwise stay on
        Library. The key forces the remount that re-reads the default.
      */}
      <Tabs defaultSelectedKey={initialTab} key={initialTab}>
        <Tabs.ListContainer className="w-fit">
          <Tabs.List aria-label="Anime editor">
            <Tabs.Tab id="library">
              Library
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="create">
              Create
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="library">
          <AnimeEditorWorkspace />
        </Tabs.Panel>

        <Tabs.Panel id="create">
          <AnimeCreate />
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
