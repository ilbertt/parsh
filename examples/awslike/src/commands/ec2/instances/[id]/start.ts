import { defineCommand } from '@repo/core';

export const command = defineCommand('ec2 instances [id] start', {
  description: 'Start a stopped EC2 instance.',
  options: {},
  handler: ({ parents, root }) => {
    const id = parents['ec2 instances [id]'].params.id;
    if (parents.ec2.options.askConfirmation) {
      console.warn(`Start ${id}? (y/N)`);
    }
    console.log(`Starting instance ${id} in ${root.options.region}`);
  },
});
