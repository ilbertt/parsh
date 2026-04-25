import { z } from 'zod';

export const configSchema = z.object({
  defaultRegion: z.string(),
  profile: z.string(),
});

export type Config = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: Config = {
  defaultRegion: 'eu-west-2',
  profile: 'default',
};
