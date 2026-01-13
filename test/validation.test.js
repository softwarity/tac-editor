/**
 * Validation tests for TacEditor
 */

import { expect } from '@esm-bundle/chai';
import '../src/tac-editor.ts';
import { metarSamples, invalidSamples } from './fixtures/tac-samples.js';

describe('TacEditor - Validation', () => {
  let editor;

  beforeEach(async () => {
    editor = document.createElement('tac-editor');
    editor.setAttribute('grammars-url', '/grammars');
    document.body.appendChild(editor);
    await editor.whenReady();
  });

  afterEach(() => {
    editor.remove();
  });

  describe('Valid Messages', () => {
    it('should validate simple METAR', async () => {
      editor.value = metarSamples.simple;
      const loaded = await editor.waitForGrammarLoad();
      // If grammar failed to load, skip the test with a message
      if (!loaded) {
        console.warn('Grammar failed to load, messageType:', editor.messageType);
      }
      expect(loaded).to.be.true;
      expect(editor.isValid).to.be.true;
    });

    it('should validate METAR with gusts', async () => {
      editor.value = metarSamples.withGusts;
      await editor.waitForGrammarLoad();
      expect(editor.isValid).to.be.true;
    });

    it('should validate METAR with CAVOK', async () => {
      editor.value = metarSamples.cavok;
      await editor.waitForGrammarLoad();
      expect(editor.isValid).to.be.true;
    });

    it('should validate METAR with CB', async () => {
      editor.value = metarSamples.withCB;
      await editor.waitForGrammarLoad();
      expect(editor.isValid).to.be.true;
    });
  });

  describe('Message Type Detection', () => {
    it('should detect METAR type', async () => {
      editor.value = metarSamples.simple;
      await editor.waitForGrammarLoad();
      expect(editor.messageType).to.equal('sa:oaci');
    });

    it('should detect SPECI type', async () => {
      editor.value = 'SPECI EGLL 281045Z 09012KT 3000 BR BKN004 08/07 Q1019';
      await editor.waitForGrammarLoad();
      expect(editor.messageType).to.equal('sp:oaci');
    });

    it('should return null for empty input', async () => {
      editor.value = '';
      expect(editor.messageType).to.be.null;
    });
  });

  describe('Error Reporting', () => {
    it('should return errors array', async () => {
      editor.value = metarSamples.simple;
      await editor.waitForGrammarLoad();
      expect(editor.errors).to.be.an('array');
    });

    it('should have empty errors for valid message', async () => {
      editor.value = metarSamples.simple;
      await editor.waitForGrammarLoad();
      expect(editor.errors.length).to.equal(0);
    });
  });

  describe('Tokens', () => {
    it('should expose tokens array', async () => {
      editor.value = metarSamples.simple;
      await editor.waitForGrammarLoad();
      expect(editor.tokens).to.be.an('array');
    });

    it('should return tokens for valid METAR', async () => {
      editor.value = metarSamples.simple;
      await editor.waitForGrammarLoad();
      expect(editor.tokens.length).to.be.greaterThan(0);
    });
  });
});
