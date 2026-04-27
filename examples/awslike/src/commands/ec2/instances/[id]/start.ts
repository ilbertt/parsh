import { defineCommand } from '@parshjs/core';

export const command = defineCommand('ec2 instances [id] start', {
  description: 'Start a stopped EC2 instance.',
  options: {},
  handler: ({ parents, rootOptions, print }) => {
    const id = parents['ec2 instances [id]'].params.id;
    if (parents.ec2.options.askConfirmation) {
      print.warn(`Start ${id}? (y/N)`);
    }
    print.info(`Starting instance ${id} in ${rootOptions.region}`);
  },
});
