import { z } from 'zod';

export const credentialsSchema = z.object({
  accessKey: z.string().min(1),
  secretKey: z.string().min(1),
});

export type Credentials = z.infer<typeof credentialsSchema>;
