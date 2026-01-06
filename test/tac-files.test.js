/**
 * Dynamic TAC file validation tests
 * Automatically tests all .tac and .txt files from the test/tacs/ folder
 * Files are organized by TAC type and standard (oaci/noaa/non-compliant)
 */

import { expect } from '@esm-bundle/chai';
import '../src/tac-editor.ts';

// Fetch TAC files data dynamically from the server
async function loadTacFiles() {
  const response = await fetch('/tac-files-data.json');
  if (!response.ok) {
    throw new Error(`Failed to load TAC files data: ${response.status}`);
  }
  return response.json();
}

// Map folder names to message types and TAC codes
const folderToConfig = {
  'SA': { name: 'METAR', types: 'SA' },
  'SP': { name: 'SPECI', types: 'SP' },
  'FC': { name: 'TAF Short', types: 'FC' },
  'FT': { name: 'TAF Long', types: 'FT' },
  'FV': { name: 'VAA', types: 'FV' },
  'FK': { name: 'TCA', types: 'FK' },
  'WS': { name: 'SIGMET Weather', types: 'WS' },
  'WV': { name: 'SIGMET VA', types: 'WV' },
  'WC': { name: 'SIGMET TC', types: 'WC' },
  'WA': { name: 'AIRMET', types: 'WA' }
};

// Test folders to include (exclude non-compliant which should fail)
const testStandards = ['oaci', 'noaa'];

describe('TAC Files Validation', () => {
  let tacFiles;
  let editor;

  // Load TAC files data once before all tests
  before(async () => {
    tacFiles = await loadTacFiles();
  });

  afterEach(() => {
    if (editor) {
      editor.remove();
      editor = null;
    }
  });

  // Generate tests for each TAC type and standard dynamically
  Object.entries(folderToConfig).forEach(([folder, config]) => {
    testStandards.forEach((standard) => {
      describe(`${config.name} - ${standard.toUpperCase()} (${folder}/${standard})`, function() {
        it(`should validate all ${folder}/${standard} files via paste`, async function() {
          // Need to wait for tacFiles to be loaded
          if (!tacFiles) {
            tacFiles = await loadTacFiles();
          }

          const files = tacFiles[folder]?.[standard] || [];
          if (files.length === 0) {
            console.warn(`No files found in ${folder}/${standard} folder`);
            this.skip();
            return;
          }

          const failures = [];

          for (const { file, content } of files) {
            // Create fresh editor for each file with correct standard
            editor = document.createElement('tac-editor');
            editor.setAttribute('grammars-url', '/grammars');
            editor.setAttribute('standard', standard);
            editor.setAttribute('message-types', config.types);
            document.body.appendChild(editor);
            await editor.whenReady();

            // Simulate paste
            editor.value = content;
            const loaded = await editor.waitForGrammarLoad();

            if (!loaded) {
              failures.push({ file, error: 'Grammar failed to load', content });
            } else if (!editor.isValid) {
              failures.push({
                file,
                error: `Validation failed: ${JSON.stringify(editor.errors)}`,
                content
              });
            }

            editor.remove();
            editor = null;
          }

          if (failures.length > 0) {
            console.error(`Failed ${folder}/${standard} files:`, failures);
            const failedFiles = failures.map(f => `${f.file}: ${f.error}`).join('\n');
            expect.fail(`${failures.length}/${files.length} files failed:\n${failedFiles}`);
          }

          console.log(`✓ All ${files.length} ${folder}/${standard} files validated successfully`);
        });
      });
    });
  });
});

describe('Non-Compliant TAC Files', () => {
  let tacFiles;
  let editor;

  before(async () => {
    tacFiles = await loadTacFiles();
  });

  afterEach(() => {
    if (editor) {
      editor.remove();
      editor = null;
    }
  });

  // Non-compliant files should be documented but not expected to pass
  Object.entries(folderToConfig).forEach(([folder, config]) => {
    describe(`${config.name} - Non-Compliant (${folder}/non-compliant)`, function() {
      it(`should document issues in ${folder}/non-compliant files`, async function() {
        if (!tacFiles) {
          tacFiles = await loadTacFiles();
        }

        const files = tacFiles[folder]?.['non-compliant'] || [];
        if (files.length === 0) {
          console.log(`No non-compliant files in ${folder}/non-compliant`);
          this.skip();
          return;
        }

        // Log non-compliant files for documentation
        console.log(`Non-compliant ${folder} files (${files.length}):`);
        for (const { file, content } of files) {
          editor = document.createElement('tac-editor');
          editor.setAttribute('grammars-url', '/grammars');
          editor.setAttribute('standard', 'oaci');
          editor.setAttribute('message-types', config.types);
          document.body.appendChild(editor);
          await editor.whenReady();

          editor.value = content;
          await editor.waitForGrammarLoad();

          console.log(`  - ${file}: ${editor.isValid ? 'Valid (unexpected)' : editor.errors?.join(', ') || 'Invalid'}`);
          console.log(`    Content: ${content.substring(0, 100)}...`);

          editor.remove();
          editor = null;
        }

        // This test always passes - it's just for documentation
        expect(true).to.be.true;
      });
    });
  });
});
