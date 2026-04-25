import { join } from 'node:path';
import { createFilesContext, osHomeConfigDir } from '@repo/files';
import { z } from 'zod';

const credentialsSchema = z.object({
  accessKey: z.string().min(1),
  secretKey: z.string().min(1),
});

export const filesContext = createFilesContext({
  basePath: join(osHomeConfigDir(), 'awslike'),
  files: {
    credentials: { filename: 'credentials.json', schema: credentialsSchema },
  },
});
