import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as p from '@clack/prompts';
import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { type TemplateName, templateNames, templates } from '../templates.ts';

const isTemplate = (s: string): s is TemplateName => (templateNames as string[]).includes(s);

export const command = defineCommand('init', {
  description: 'Interactively scaffold a new project.',
  options: {
    name: { schema: z.string().optional() },
    template: { schema: z.string().optional() },
    yes: { schema: z.boolean().optional() },
  },
  handler: async ({ options }) => {
    p.intro('scaffold');

    const name =
      options.name ??
      (await p.text({
        message: 'Project name',
        placeholder: 'my-app',
        validate: (v) => (v.trim().length === 0 ? 'Required' : undefined),
      }));
    if (p.isCancel(name)) {
      p.cancel('Cancelled.');
      return;
    }

    const rawTemplate =
      options.template ??
      (await p.select({
        message: 'Template',
        options: templateNames.map((t) => ({ value: t, label: t, hint: templates[t].description })),
      }));
    if (p.isCancel(rawTemplate)) {
      p.cancel('Cancelled.');
      return;
    }
    if (typeof rawTemplate !== 'string' || !isTemplate(rawTemplate)) {
      p.cancel(`Unknown template: ${String(rawTemplate)}`);
      return;
    }

    const confirmed =
      options.yes ?? (await p.confirm({ message: `Create ./${name} from "${rawTemplate}"?` }));
    if (p.isCancel(confirmed) || confirmed === false) {
      p.cancel('Aborted.');
      return;
    }

    const spin = p.spinner();
    spin.start('Writing files');
    const tpl = templates[rawTemplate];
    for (const [rel, build] of Object.entries(tpl.files)) {
      const full = join(process.cwd(), name, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, build(name));
    }
    spin.stop(`Created ${Object.keys(tpl.files).length} files in ./${name}`);

    p.outro(`Done. cd ${name} to get started.`);
  },
});
