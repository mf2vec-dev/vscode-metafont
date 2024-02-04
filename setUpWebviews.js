const { build } = require('esbuild');

const baseConfig = {
  bundle: true,
  platform: 'node',
  mainFields: [ 'module', 'main' ]
};

const options = [
  {
    ...baseConfig,
    entryPoints: [ './src/webviews/src/singleGeometryWebview.ts' ],
    outfile: './out/webviews/src/singleGeometryWebview.js',
    format: 'cjs',
    external: [ 'vscode' ]
  },
  {
    ...baseConfig,
    entryPoints: [ './src/webviews/src/multiGeometryWebview.ts' ],
    outfile: './out/webviews/src/multiGeometryWebview.js',
    format: 'cjs',
    external: [ 'vscode' ]
  },
  {
    ...baseConfig,
    entryPoints: [ './src/webviews/src/tableWebview.ts' ],
    outfile: './out/webviews/src/tableWebview.js',
    format: 'cjs',
    external: [ 'vscode' ]
  },
  {
    ...baseConfig,
    entryPoints: [ './src/webviews/src/registerWebviewUiToolkit.ts' ],
    outfile: './out/webviews/src/registerWebviewUiToolkit.js',
    format: 'cjs',
    external: [ 'vscode' ]
  }
];

for (const opt of options) {
  (async (opt) => {
    await build(opt)
      .catch((err) => {
        console.log(opt);
        process.stderr.write(err.stderr);
        process.exit(1);
      });
  })(opt);
}
