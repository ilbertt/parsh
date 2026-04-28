import { defineCommand } from '@parshjs/core';
import { z } from 'zod';
import { runRequest } from '../../request.ts';

export const command = defineCommand('HEAD [url]', {
  description: 'Send a HEAD request.',
  params: { url: { schema: z.url() } },
  options: {},
  handler: async ({ params, parents, rootOptions, print }) => {
    await runRequest({
      method: 'HEAD',
      url: params.url,
      headers: parents.HEAD.options.header,
      query: parents.HEAD.options.query,
      data: undefined,
      auth: rootOptions.auth,
      timeout: rootOptions.timeout,
      follow: rootOptions.follow,
      verbose: rootOptions.verbose,
      print,
    });
  },
});
