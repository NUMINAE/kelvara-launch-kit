// Bundles the landing page and the Mini App.
//   src/site/main.js -> assets/site.js
//   src/app/main.ts  -> app/app.js
import { build } from 'esbuild';

const common = { bundle: true, minify: true, format: 'iife', target: 'es2020', legalComments: 'none' };
await build({ ...common, entryPoints: ['src/site/main.js'], outfile: 'assets/site.js' });
await build({ ...common, entryPoints: ['src/app/main.ts'], outfile: 'app/app.js', define: { global: 'globalThis' }, inject: ['src/app/buffer-shim.ts'] });
console.log('built assets/site.js and app/app.js');
