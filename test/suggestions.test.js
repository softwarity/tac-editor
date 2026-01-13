/**
 * Suggestions tests for TacEditor
 */

import { expect } from '@esm-bundle/chai';
import { TacParser } from '../src/tac-parser.ts';
import reportGrammar from '../grammars/report.oaci.en.json';
import saGrammar from '../grammars/sa.oaci.en.json';
import spGrammar from '../grammars/sp.oaci.en.json';

describe('TacParser - Suggestions', () => {
  let parser;

  beforeEach(() => {
    parser = new TacParser();
    // Register grammars with inheritance chain
    // Register with both 'report' (for extends) and 'report:oaci' names
    parser.registerGrammar('report', reportGrammar);
    parser.registerGrammar('report:oaci', reportGrammar);
    parser.registerGrammar('sa:oaci', saGrammar);
    parser.registerGrammar('sp:oaci', spGrammar);
    // Resolve inheritance after all grammars are registered
    parser.resolveInheritance();
  });

  describe('Initial Suggestions', () => {
    it('should provide message type suggestions for empty input', async () => {
      const suggestions = await parser.getSuggestions('', 0);
      expect(suggestions).to.be.an('array');
      expect(suggestions.length).to.be.greaterThan(0);
    });

    it('should include METAR in initial suggestions', async () => {
      const suggestions = await parser.getSuggestions('', 0);
      const metar = suggestions.find(s => s.text === 'METAR');
      expect(metar).to.exist;
    });

    it('should include SPECI in initial suggestions', async () => {
      const suggestions = await parser.getSuggestions('', 0);
      const speci = suggestions.find(s => s.text === 'SPECI');
      expect(speci).to.exist;
    });

    it('should include description in suggestions', async () => {
      const suggestions = await parser.getSuggestions('', 0);
      const metar = suggestions.find(s => s.text === 'METAR');
      expect(metar.description).to.be.a('string');
    });
  });

  describe('Contextual Suggestions', () => {
    it('should provide suggestions after METAR keyword', async () => {
      parser.detectMessageType('METAR');
      const suggestions = await parser.getSuggestions('METAR ', 6);
      expect(suggestions).to.be.an('array');
    });

    it('should provide wind suggestions after datetime', async () => {
      parser.detectMessageType('METAR LFPG 281030Z');
      const suggestions = await parser.getSuggestions('METAR LFPG 281030Z ', 19);
      expect(suggestions).to.be.an('array');
      // Should suggest wind patterns or AUTO
    });

    it('should provide visibility suggestions after wind', async () => {
      parser.detectMessageType('METAR LFPG 281030Z 27015KT');
      const suggestions = await parser.getSuggestions('METAR LFPG 281030Z 27015KT ', 27);
      expect(suggestions).to.be.an('array');
      // Should suggest CAVOK or visibility
    });

    it('should include CAVOK in suggestions after wind', async () => {
      parser.detectMessageType('METAR LFPG 281030Z 27015KT');
      const suggestions = await parser.getSuggestions('METAR LFPG 281030Z 27015KT ', 27);
      const cavok = suggestions.find(s => s.text === 'CAVOK');
      expect(cavok).to.exist;
    });
  });

  describe('Suggestion Structure', () => {
    it('should include required properties in suggestions', async () => {
      const suggestions = await parser.getSuggestions('', 0);
      for (const sug of suggestions) {
        expect(sug.text).to.be.a('string');
        expect(sug.description).to.be.a('string');
      }
    });
  });
});
