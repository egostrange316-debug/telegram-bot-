const esbuild = require('esbuild');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const testing = process.argv.includes('--test');
const aliases = {
  [path.join(root, 'src/config.js')]: path.join(root, 'src/edge/config.js'),
  [path.join(root, 'src/models/app.js')]: path.join(root, 'src/storage/postgres.js'),
  [path.join(root, 'src/models/bot.js')]: path.join(root, 'src/storage/postgres.js'),
};
esbuild.build({
  entryPoints: [testing ? 'tests/supabase-flow.entry.js' : 'src/edge/runtime.js'],
  outfile: testing ? 'tests/.generated-flow.cjs' : 'supabase/functions/enzo-bot/runtime.mjs',
  external: testing ? ['grammy', 'bcryptjs', 'node:*'] : ['npm:*', 'node:*'], bundle: true, platform: testing ? 'node' : 'neutral', format: testing ? 'cjs' : 'esm', target: 'es2022',
  banner: testing ? {} : { js: 'import { Buffer } from "node:buffer";' },
  plugins: [{ name: 'edge-adapters', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (!testing && ['grammy', 'bcryptjs', 'crypto'].includes(args.path)) return { path: args.path, namespace: 'edge-dependency' };
      if (args.path.startsWith('.')) {
        const p = path.resolve(args.resolveDir, args.path);
        if (aliases[p + '.js']) return { path: aliases[p + '.js'] };
      }
    });
    build.onLoad({ filter: /.*/, namespace: 'edge-dependency' }, args => ({
      contents: `import * as dependency from ${JSON.stringify({ grammy: 'npm:grammy@1.46.0', bcryptjs: 'npm:bcryptjs@2.4.3', crypto: 'node:crypto' }[args.path])}; module.exports = dependency;`, loader: 'js',
    }));
  } }],
}).then(() => console.log('Supabase Edge bundle built')).catch(() => process.exit(1));
