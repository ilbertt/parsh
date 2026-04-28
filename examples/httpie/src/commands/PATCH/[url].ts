import { defineCommand } from '@parshjs/core';
import { z } from 'zod';
import { runRequest } from '../../request.ts';

export const command = defineCommand('PATCH [url]', {
  description: 'Send a PATCH request.',
  params: { url: { schema: z.url() } },
  options: {},
  handler: async ({ params, parents, rootOptions, print }) => {
    await runRequest({
      method: 'PATCH',
      url: params.url,
      headers: parents.PATCH.options.header,
      query: parents.PATCH.options.query,
      data: parents.PATCH.options.data,
      auth: rootOptions.auth,
      timeout: rootOptions.timeout,
      follow: rootOptions.follow,
      verbose: rootOptions.verbose,
      print,
    });
  },
});
