import { buildPublicPackage } from '@repo/pack-utils';

await buildPublicPackage({ packageDir: import.meta.dir });
