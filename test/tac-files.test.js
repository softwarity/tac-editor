/**
 * Dynamic TAC file validation tests
 * Automatically tests all .tac and .txt files from the test/tacs/ folder
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

// Map folder names to message types
const folderToType = {
  'SA': 'METAR',
  'SP': 'SPECI',
  'FC': 'TAF',
  'FV': 'VAA',
  'FK': 'TCA'
};

describe('TAC Files Validation', () => {
  let tacFiles;
  let editor;

  // Load TAC files data once before all tests
  before(async () => {
    tacFiles = await loadTacFiles();
  });

  beforeEach(async () => {
    editor = document.createElement('tac-editor');
    editor.setAttribute('grammars-url', '/grammars');
    document.body.appendChild(editor);
    await editor.whenReady();
  });

  afterEach(() => {
    editor.remove();
  });

  // Generate tests for each TAC type dynamically
  // Note: FK (TCA) excluded - grammar not yet created
  ['SA', 'SP', 'FC', 'FV'].forEach((folder) => {
    describe(`${folderToType[folder]} Messages (${folder})`, function() {
      it(`should validate all ${folder} files`, async function() {
        // Need to wait for tacFiles to be loaded
        if (!tacFiles) {
          tacFiles = await loadTacFiles();
        }

        const files = tacFiles[folder] || [];
        if (files.length === 0) {
          console.warn(`No files found in ${folder} folder`);
          return;
        }

        const failures = [];

        for (const { file, content } of files) {
          editor.value = content;
          const loaded = await editor.waitForGrammarLoad();

          if (!loaded) {
            failures.push({ file, error: 'Grammar failed to load', content });
            continue;
          }

          if (!editor.isValid) {
            failures.push({
              file,
              error: `Validation failed: ${JSON.stringify(editor.errors)}`,
              content
            });
          }
        }

        if (failures.length > 0) {
          console.error(`Failed ${folder} files:`, failures);
          const failedFiles = failures.map(f => `${f.file}: ${f.error}`).join('\n');
          expect.fail(`${failures.length}/${files.length} files failed:\n${failedFiles}`);
        }

        console.log(`✓ All ${files.length} ${folder} files validated successfully`);
      });
    });
  });
});
