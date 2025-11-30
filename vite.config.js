import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, cpSync, mkdirSync, existsSync } from 'fs';
import { minifyHTMLLiterals } from 'minify-literals';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const banner = `/**
 * @license MIT
 * @name ${pkg.name}
 * @version ${pkg.version}
 * @author Softwarity (https://www.softwarity.io/)
 * @copyright ${new Date().getFullYear()} Softwarity
 * @see https://github.com/softwarity/tac-editor
 */`;

// Custom Vite plugin to copy grammars directory to dist
function copyGrammarsPlugin() {
  return {
    name: 'copy-grammars',
    closeBundle() {
      const srcDir = resolve(__dirname, 'grammars');
      const destDir = resolve(__dirname, 'dist/grammars');
      if (existsSync(srcDir)) {
        mkdirSync(destDir, { recursive: true });
        cpSync(srcDir, destDir, { recursive: true });
        console.log('Copied grammars to dist/grammars');
      }
    }
  };
}

// Custom Vite plugin to minify template literals (CSS/HTML)
function minifyLiteralsPlugin() {
  return {
    name: 'minify-literals',
    async transform(code, id) {
      if ((id.endsWith('.js') || id.endsWith('.ts')) && code.includes('`')) {
        try {
          const result = await minifyHTMLLiterals(code, { fileName: id });
          return result ? { code: result.code, map: result.map } : null;
        } catch (e) {
          // If minification fails, return original code
          return null;
        }
      }
      return null;
    }
  };
}

export default defineConfig({
  plugins: [minifyLiteralsPlugin(), copyGrammarsPlugin()],
  define: {
    __VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/tac-editor.ts'),
      name: 'TacEditor',
      fileName: 'tac-editor',
      formats: ['es']
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 3
      },
      mangle: {
        toplevel: true
      },
      format: {
        comments: false,
        preamble: banner
      }
    },
    rollupOptions: {
      output: {
        assetFileNames: 'tac-editor.[ext]'
      }
    }
  },
  server: {
    open: '/demo/index.html'
  }
});
