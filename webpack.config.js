const path = require('path');

// ---------------------------------------------------------------------------
// Widget entries
// To add widget #15, #16, etc: add one line here and create src/widget-name/.
// Nothing else in this file needs to change.
// ---------------------------------------------------------------------------
const widgetEntries = {
  'widget-utility-bar':      './src/widget-utility-bar/index.tsx',      // #01
  'widget-navigation-bar':   './src/widget-navigation-bar/index.tsx',   // #02
  'widget-property-info':    './src/widget-property-info/index.tsx',    // #03
  'widget-homepage-search':  './src/widget-homepage-search/index.tsx',  // #04
  'widget-space-list':       './src/widget-space-list/index.tsx',       // #05
  'widget-promotions':       './src/widget-promotions/index.tsx',       // #06
  'widget-nearby-locations': './src/widget-nearby-locations/index.tsx', // #07
  'widget-map-locations':    './src/widget-map-locations/index.tsx',    // #08
  'widget-reviews':          './src/widget-reviews/index.tsx',          // #09
  'widget-faqs':             './src/widget-faqs/index.tsx',             // #10
  'widget-size-guide':       './src/widget-size-guide/index.tsx',       // #11
  'widget-blogs-listing':    './src/widget-blogs-listing/index.tsx',    // #12
  'widget-footer':           './src/widget-footer/index.tsx',           // #13
  'widget-tier-selection':   './src/widget-tier-selection/index.tsx',   // #14
  'widget-blogs-page':       './src/widget-blogs-page/index.tsx',       // #15
  'widget-blog-post':        './src/widget-blog-post/index.tsx',        // #16
  'widget-account-login':    './src/widget-account-login/index.tsx',    // #17
  // #05's <h1>, on its own, so #06 can sit between it and the filter bar.
  // #18 HERE, but the Duda widget is called "#15 Space List Heading" — Duda
  // numbers its own widgets and #15 was free there. Bundle name is the link
  // between them, not the number.
  'widget-space-list-heading':'./src/widget-space-list-heading/index.tsx',// #18
  'widget-rental-flow-2step':'./src/widget-rental-flow-2step/index.tsx',// #99 (TBD)
  // Living styleguide for @shared/ui — DEV HARNESS ONLY, never a Duda widget.
  // Deliberately unnumbered so it can't be mistaken for one.
  'ui-kit':                  './src/ui-kit/index.tsx',
};

module.exports = (_env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    entry: widgetEntries,

    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      // AMD is required: Duda lazy-loads bundles via require.js.
      // Do NOT change this to 'umd' or add a `library` name — that breaks
      // Duda's loader. Non-AMD route requires options.amd=false in Duda and
      // a global name, which we are not using.
      libraryTarget: 'amd',
      clean: true,
    },

    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          // CSS is bundled INTO the widget's .js and injected as a <style> tag
          // at runtime by style-loader. This keeps us at one CDN file per
          // widget (no separate .css to host) — required for the Duda loader.
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          // Images are base64-inlined into the bundle so the widget stays a
          // single self-contained .js file (required for the Duda AMD loader).
          test: /\.(png|jpe?g|gif|svg|webp)$/i,
          type: 'asset/inline',
        },
        {
          // Same reason, plus one of its own: the rental flow's card frames are
          // documents on Global Payments' origin, so they cannot fetch a font
          // from us or from Google. Inlined here, the face travels to them as a
          // data: URI inside an @font-face rule. See gpHostedFields.ts.
          test: /\.woff2?$/i,
          type: 'asset/inline',
        },
      ],
    },

    plugins: [],

    // Source maps in dev only
    devtool: isDev ? 'inline-source-map' : false,

    devServer: isDev
      ? {
          // Serve the dev/ harness HTML from the root
          static: {
            directory: path.join(__dirname, 'dev'),
          },
          port: 3000,
          // AMD format is incompatible with webpack HMR; use plain live-reload.
          hot: false,
          liveReload: true,
          // Serve bundles from memory at /dist/ (require.js loads them over HTTP
          // from here). We deliberately DON'T write to disk in dev: rewriting the
          // committed dist/*.js on every recompile races Windows Defender/OneDrive
          // file locks (EPERM/UNKNOWN). Run `npm run build` to refresh committed
          // dist/ for shipping.
          devMiddleware: {
            writeToDisk: false,
            publicPath: '/dist/',
          },
        }
      : undefined,
  };
};
