import { defineCommand } from '@parshjs/core';
import { z } from 'zod';
import { runRequest } from '../../request.ts';

export const command = defineCommand('POST [url]', {
  description: 'Send a POST request.',
  params: { url: { schema: z.url() } },
  options: {},
  handler: async ({ params, parents, rootOptions, print }) => {
    await runRequest({
      method: 'POST',
      url: params.url,
      headers: parents.POST.options.header,
      query: parents.POST.options.query,
      data: parents.POST.options.data,
      auth: rootOptions.auth,
      timeout: rootOptions.timeout,
      follow: rootOptions.follow,
      verbose: rootOptions.verbose,
      print,
    });
  },
});
