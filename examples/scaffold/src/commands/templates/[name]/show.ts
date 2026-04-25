import { defineCommand } from '@repo/core';
import { type TemplateName, templateNames, templates } from '../../../templates.ts';

const isTemplate = (s: string): s is TemplateName => (templateNames as string[]).includes(s);

export const command = defineCommand('templates [name] show', {
  description: 'Show what a template would generate.',
  options: {},
  handler: (ctx) => {
    const name = ctx.parents['templates [name]'].params.name;
    if (!isTemplate(name)) {
      console.error(`Unknown template: ${name}. Try: ${templateNames.join(', ')}`);
      process.exit(1);
    }
    const tpl = templates[name];
    console.log(`# ${tpl.name} — ${tpl.description}`);
    for (const rel of Object.keys(tpl.files)) {
      console.log(`  ${rel}`);
    }
  },
});
