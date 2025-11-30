/**
 * Event tests for TacEditor
 * Updated for Monaco-like architecture
 */

import { expect } from '@esm-bundle/chai';
import '../src/tac-editor.ts';
import { metarSamples } from './fixtures/tac-samples.js';

describe('TacEditor - Events', () => {
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

  describe('Change Event', () => {
    it('should emit change event on value change', (done) => {
      editor.addEventListener('change', (e) => {
        expect(e.detail).to.exist;
        expect(e.detail.value).to.be.a('string');
        done();
      }, { once: true });

      editor.value = 'METAR LFPG';
    });

    it('should include value in change event detail', (done) => {
      editor.addEventListener('change', (e) => {
        expect(e.detail.value).to.equal('METAR LFPG');
        done();
      }, { once: true });

      editor.value = 'METAR LFPG';
    });

    it('should include message type in change event detail', async () => {
      editor.value = metarSamples.simple;
      await editor.waitForGrammarLoad();
      expect(editor.messageType).to.equal('metar-speci');
    });

    it('should include tokens in change event detail', (done) => {
      editor.addEventListener('change', (e) => {
        expect(e.detail.tokens).to.be.an('array');
        done();
      }, { once: true });

      editor.value = 'METAR LFPG';
    });

    it('should include valid flag in change event detail', (done) => {
      editor.addEventListener('change', (e) => {
        expect(e.detail.valid).to.be.a('boolean');
        done();
      }, { once: true });

      editor.value = metarSamples.simple;
    });
  });

  describe('Clear Method', () => {
    it('should clear the editor', async () => {
      editor.value = metarSamples.simple;
      await new Promise(r => setTimeout(r, 10));
      
      editor.clear();
      
      expect(editor.value).to.equal('');
    });

    it('should reset message type on clear', async () => {
      editor.value = metarSamples.simple;
      await new Promise(r => setTimeout(r, 10));
      
      editor.clear();
      
      expect(editor.messageType).to.be.null;
    });

    it('should emit change event on clear', (done) => {
      editor.value = metarSamples.simple;
      
      setTimeout(() => {
        editor.addEventListener('change', (e) => {
          expect(e.detail.value).to.equal('');
          done();
        }, { once: true });
        
        editor.clear();
      }, 10);
    });
  });

  describe('Focus', () => {
    it('should have focus method', () => {
      expect(editor.focus).to.be.a('function');
    });

    it('should focus the input on focus call', () => {
      editor.focus();
      const input = editor.shadowRoot.getElementById('hiddenTextarea');
      expect(editor.shadowRoot.activeElement).to.equal(input);
    });
  });
});
