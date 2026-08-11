//@ts-check

'use strict';

const path = require('path');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',

  entry: './src/host/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                module: 'commonjs'
              }
            }
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};

/** @type WebpackConfig */
const panelConfig = {
  target: 'web',
  mode: 'none',

  entry: './src/webview/panel.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'panel.js'
  },
  // IMPORTANT: keep everything in ONE bundle. When pixi.js code-splits
  // into async chunks (1.panel.js, 2.panel.js), those chunks are loaded via
  // dynamically-injected <script> tags WITHOUT our CSP nonce, so the
  // Content-Security-Policy blocks them → black screen. Disabling chunk
  // splitting guarantees a single script tag with the nonce.
  optimization: {
    splitChunks: false
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                module: 'esnext',
                lib: ['ES2022', 'DOM', 'DOM.Iterable']
              }
            }
          }
        ]
      }
    ],
    parser: {
      javascript: {
        // Merge ALL dynamic import() calls (pixi.js uses them internally,
        // e.g. loadEnvironmentExtensions) into the main bundle instead of
        // emitting async chunks that violate our CSP nonce.
        dynamicImportMode: 'eager'
      }
    }
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};

module.exports = [ extensionConfig, panelConfig ];
