import { defineCommand } from '@parshjs/core';
import { type TemplateName, templateNames, templates } from '../../../templates.ts';

const isTemplate = (s: string): s is TemplateName => (templateNames as string[]).includes(s);

export const command = defineCommand('templates [name] show', {
  description: 'Show what a template would generate.',
  options: {},
  handler: ({ parents, print }) => {
    const name = parents['templates [name]'].params.name;
    if (!isTemplate(name)) {
      print.error(`Unknown template: ${name}. Try: ${templateNames.join(', ')}`);
      process.exit(1);
    }
    const tpl = templates[name];
    print.info(`# ${tpl.name} — ${tpl.description}`);
    for (const rel of Object.keys(tpl.files)) {
      print.dim(`  ${rel}`);
    }
  },
});
