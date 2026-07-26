import { toast } from '@heroui/react';

/** Toast options type derived from HeroUI's toast.success signature. */
export type ToastOptions = NonNullable<Parameters<typeof toast.success>[1]>;
