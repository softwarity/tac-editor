import { playwrightLauncher } from '@web/test-runner-playwright';
import { esbuildPlugin } from '@web/dev-server-esbuild';
import fs from 'fs';
import path from 'path';

const isCI = process.env.CI === 'true';

// Custom plugin to handle Vite's ?inline CSS imports
function inlineCssPlugin() {
  return {
    name: 'inline-css',
    resolveMimeType(context) {
      if (context.path.includes('.css')) {
        return 'js';
      }
    },
    async serve(context) {
      if (context.path.includes('.css')) {
        // Remove query params for file path
        const cleanPath = context.path.split('?')[0];
        const filePath = path.join(process.cwd(), cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath);
        try {
          const cssContent = fs.readFileSync(filePath, 'utf-8');
          const escaped = cssContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
          return { body: `export default \`${escaped}\`;`, type: 'js' };
        } catch (e) {
          console.error('Failed to load CSS:', filePath, e.message);
        }
      }
    },
  };
}

// Custom plugin to handle JSON grammar imports
function jsonPlugin() {
  return {
    name: 'json-loader',
    resolveMimeType(context) {
      if (context.path.endsWith('.json')) {
        return 'js';
      }
    },
    async serve(context) {
      if (context.path.endsWith('.json')) {
        const filePath = path.join(process.cwd(), context.path.startsWith('/') ? context.path.slice(1) : context.path);
        try {
          const jsonContent = fs.readFileSync(filePath, 'utf-8');
          // All JSON files are served as JS modules
          return { body: `export default ${jsonContent};`, type: 'js' };
        } catch (e) {
          console.error('Failed to load JSON:', filePath, e.message);
        }
      }
    },
  };
}


export default {
  files: 'test/**/*.test.js',
  nodeResolve: true,

  // Plugins to handle Vite-specific imports
  plugins: [
    inlineCssPlugin(),
    jsonPlugin(),
    esbuildPlugin({ ts: true, tsconfig: './tsconfig.json' }),
  ],

  // Use Playwright for real headless browser testing
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
  ],

  // Test timeout (ms)
  testFramework: {
    config: {
      timeout: 5000,
    },
  },

  // Coverage reporting
  coverage: isCI,
  coverageConfig: {
    reportDir: 'coverage',
    reporters: ['html', 'lcov', 'text-summary'],
    include: ['src/**/*.js'],
    threshold: {
      statements: 60,
      branches: 50,
      functions: 60,
      lines: 60,
    },
  },
};
