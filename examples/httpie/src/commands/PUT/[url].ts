import { defineCommand } from '@parshjs/core';
import { z } from 'zod';
import { runRequest } from '../../request.ts';

export const command = defineCommand('PUT [url]', {
  description: 'Send a PUT request.',
  params: { url: { schema: z.url() } },
  options: {},
  handler: async ({ params, parents, rootOptions, print }) => {
    await runRequest({
      method: 'PUT',
      url: params.url,
      headers: parents.PUT.options.header,
      query: parents.PUT.options.query,
      data: parents.PUT.options.data,
      auth: rootOptions.auth,
      timeout: rootOptions.timeout,
      follow: rootOptions.follow,
      verbose: rootOptions.verbose,
      print,
    });
  },
});
