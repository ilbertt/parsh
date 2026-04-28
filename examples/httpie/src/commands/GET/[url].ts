import { defineCommand } from '@parshjs/core';
import { z } from 'zod';
import { runRequest } from '../../request.ts';

export const command = defineCommand('GET [url]', {
  description: 'Send a GET request.',
  params: { url: { schema: z.url() } },
  options: {},
  handler: async ({ params, parents, rootOptions, print }) => {
    await runRequest({
      method: 'GET',
      url: params.url,
      headers: parents.GET.options.header,
      query: parents.GET.options.query,
      data: undefined,
      auth: rootOptions.auth,
      timeout: rootOptions.timeout,
      follow: rootOptions.follow,
      verbose: rootOptions.verbose,
      print,
    });
  },
});
