/**
 * Rendering tests for TacEditor
 * Updated for Monaco-like architecture
 */

import { expect } from '@esm-bundle/chai';
import '../src/tac-editor.ts';

describe('TacEditor - Rendering', () => {
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

  describe('Basic Rendering', () => {
    it('should render with default state', () => {
      expect(editor).to.exist;
      expect(editor.shadowRoot).to.exist;
    });

    it('should have a shadow DOM', () => {
      expect(editor.shadowRoot.querySelector('.editor-wrapper')).to.exist;
    });

    it('should render hidden textarea for input', () => {
      const input = editor.shadowRoot.getElementById('hiddenTextarea');
      expect(input).to.exist;
      expect(input.tagName.toLowerCase()).to.equal('textarea');
    });

    it('should render viewport area', () => {
      const viewport = editor.shadowRoot.getElementById('viewport');
      expect(viewport).to.exist;
    });

    it('should render lines container', () => {
      const linesContainer = editor.shadowRoot.getElementById('linesContainer');
      expect(linesContainer).to.exist;
    });

    it('should render suggestions container', () => {
      const suggestions = editor.shadowRoot.getElementById('suggestionsContainer');
      expect(suggestions).to.exist;
    });

    it('should render footer bar', () => {
      const footer = editor.shadowRoot.getElementById('footerBar');
      expect(footer).to.exist;
    });
  });

  describe('Value Attribute', () => {
    it('should accept value via attribute', async () => {
      editor.setAttribute('value', 'METAR LFPG');
      await new Promise(r => setTimeout(r, 10));
      expect(editor.value).to.equal('METAR LFPG');
    });

    it('should accept value via property', () => {
      editor.value = 'SPECI EGLL';
      expect(editor.value).to.equal('SPECI EGLL');
    });

    it('should update display when value changes', async () => {
      editor.value = 'METAR LFPG';
      // Force a render cycle - need to wait for the render debounce and RAF
      await new Promise(r => setTimeout(r, 100));
      // Manually trigger renderViewport if needed
      editor.renderViewport();
      await new Promise(r => setTimeout(r, 50));
      const linesContainer = editor.shadowRoot.getElementById('linesContainer');
      expect(linesContainer.textContent.trim()).to.include('METAR');
    });
  });

  describe('Readonly Mode', () => {
    it('should support readonly attribute', () => {
      editor.setAttribute('readonly', '');
      const input = editor.shadowRoot.getElementById('hiddenTextarea');
      expect(input.readOnly).to.be.true;
    });

    it('should remove readonly when attribute removed', () => {
      editor.setAttribute('readonly', '');
      editor.removeAttribute('readonly');
      const input = editor.shadowRoot.getElementById('hiddenTextarea');
      expect(input.readOnly).to.be.false;
    });
  });

  describe('Color Scheme', () => {
    it('should accept color-scheme attribute', () => {
      editor.setAttribute('color-scheme', 'dark');
      expect(editor.getAttribute('color-scheme')).to.equal('dark');
    });

    it('should accept light color scheme', () => {
      editor.setAttribute('color-scheme', 'light');
      expect(editor.getAttribute('color-scheme')).to.equal('light');
    });
  });
});
