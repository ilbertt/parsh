import { createEnvContext } from '@repo/env';
import { z } from 'zod';

export const envVarsContext = createEnvContext({
  vars: {
    AWSLIKE_PROFILE: { schema: z.string(), default: 'default' },
    AWSLIKE_DEBUG: { schema: z.boolean(), default: false },
  },
});
