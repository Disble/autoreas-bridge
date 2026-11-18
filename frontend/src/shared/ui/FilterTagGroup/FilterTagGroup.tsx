import checkIcon from '@iconify-icons/tabler/check';
import { Icon } from '@iconify/react';
import { Description, Label, Tag, TagGroup } from '@heroui/react';
import type { FilterTagGroupProps } from './filter-tag-group.types';

/** One multiple-choice group of filter tags; a selected tag shows a check. */
export function FilterTagGroup({ label, hint, options, selectedKeys, onSelectionChange }: Readonly<FilterTagGroupProps>) {
  return (
    <TagGroup
      className="flex flex-col gap-2"
      selectedKeys={selectedKeys}
      selectionMode="multiple"
      size="md"
      onSelectionChange={onSelectionChange}
    >
      <Label className="text-sm font-semibold">{label}</Label>
      {hint === undefined ? null : <Description className="-mt-1 text-xs">{hint}</Description>}
      <TagGroup.List className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Tag className="group/tag" id={option.value} key={option.value} textValue={option.label}>
            <Icon aria-hidden="true" className="hidden size-3.5 group-data-[selected=true]/tag:inline-block" icon={checkIcon} />
            {option.label}
          </Tag>
        ))}
      </TagGroup.List>
    </TagGroup>
  );
}
