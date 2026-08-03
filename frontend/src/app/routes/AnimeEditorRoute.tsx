import { Tabs } from '@heroui/react';
import { AnimeCreate } from '../../features/anime-create/ui/AnimeCreate/AnimeCreate';
import { AnimeEditorWorkspace } from '../../features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorWorkspace';

/** AnimeEditorRoute mounts a Library/Create tab shell as its own routed surface. */
export function AnimeEditorRoute() {
  return (
    <section className="flex min-h-screen flex-col gap-4">
      <Tabs defaultSelectedKey="library">
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
