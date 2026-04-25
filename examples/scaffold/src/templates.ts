export type TemplateName = 'node' | 'react' | 'cli';

export type Template = {
  name: TemplateName;
  description: string;
  files: Record<string, (projectName: string) => string>;
};

export const templates: Record<TemplateName, Template> = {
  node: {
    name: 'node',
    description: 'Minimal Node.js + TypeScript service.',
    files: {
      'package.json': (n) =>
        `${JSON.stringify({ name: n, type: 'module', scripts: { start: 'tsx src/index.ts' } }, null, 2)}\n`,
      'src/index.ts': () => "console.log('hello from node');\n",
      'README.md': (n) => `# ${n}\n`,
    },
  },
  react: {
    name: 'react',
    description: 'React + Vite single-page app.',
    files: {
      'package.json': (n) =>
        `${JSON.stringify({ name: n, type: 'module', scripts: { dev: 'vite' } }, null, 2)}\n`,
      'index.html': (n) => `<!doctype html><title>${n}</title><div id=root></div>\n`,
      'src/main.tsx': () => "import {createRoot} from 'react-dom/client';\n",
      'README.md': (n) => `# ${n}\n`,
    },
  },
  cli: {
    name: 'cli',
    description: 'parsh-powered CLI starter.',
    files: {
      'package.json': (n) =>
        `${JSON.stringify({ name: n, type: 'module', bin: { [n]: 'src/main.ts' } }, null, 2)}\n`,
      'src/main.ts': (n) => `#!/usr/bin/env bun\nconsole.log('${n} is alive');\n`,
      'README.md': (n) => `# ${n}\n`,
    },
  },
};

export const templateNames = Object.keys(templates) as TemplateName[];
