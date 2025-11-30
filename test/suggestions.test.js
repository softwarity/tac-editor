/**
 * Suggestions tests for TacEditor
 */

import { expect } from '@esm-bundle/chai';
import { TacParser } from '../src/tac-parser.ts';
import metarSpeciGrammar from '../grammars/metar-speci.en.json';

describe('TacParser - Suggestions', () => {
  let parser;

  beforeEach(() => {
    parser = new TacParser();
    parser.registerGrammar('metar-speci', metarSpeciGrammar);
  });

  describe('Initial Suggestions', () => {
    it('should provide message type suggestions for empty input', () => {
      const suggestions = parser.getSuggestions('', 0);
      expect(suggestions).to.be.an('array');
      expect(suggestions.length).to.be.greaterThan(0);
    });

    it('should include METAR in initial suggestions', () => {
      const suggestions = parser.getSuggestions('', 0);
      const metar = suggestions.find(s => s.text === 'METAR');
      expect(metar).to.exist;
    });

    it('should include SPECI in initial suggestions', () => {
      const suggestions = parser.getSuggestions('', 0);
      const speci = suggestions.find(s => s.text === 'SPECI');
      expect(speci).to.exist;
    });

    it('should include description in suggestions', () => {
      const suggestions = parser.getSuggestions('', 0);
      const metar = suggestions.find(s => s.text === 'METAR');
      expect(metar.description).to.be.a('string');
    });
  });

  describe('Contextual Suggestions', () => {
    it('should provide suggestions after METAR keyword', () => {
      parser.detectMessageType('METAR');
      const suggestions = parser.getSuggestions('METAR ', 6);
      expect(suggestions).to.be.an('array');
    });

    it('should provide wind suggestions after datetime', () => {
      parser.detectMessageType('METAR LFPG 281030Z');
      const suggestions = parser.getSuggestions('METAR LFPG 281030Z ', 19);
      expect(suggestions).to.be.an('array');
      // Should suggest wind patterns or AUTO
    });

    it('should provide visibility suggestions after wind', () => {
      parser.detectMessageType('METAR LFPG 281030Z 27015KT');
      const suggestions = parser.getSuggestions('METAR LFPG 281030Z 27015KT ', 27);
      expect(suggestions).to.be.an('array');
      // Should suggest CAVOK or visibility
    });

    it('should include CAVOK in suggestions after wind', () => {
      parser.detectMessageType('METAR LFPG 281030Z 27015KT');
      const suggestions = parser.getSuggestions('METAR LFPG 281030Z 27015KT ', 27);
      const cavok = suggestions.find(s => s.text === 'CAVOK');
      expect(cavok).to.exist;
    });
  });

  describe('Suggestion Types', () => {
    it('should include type property in suggestions', () => {
      const suggestions = parser.getSuggestions('', 0);
      for (const sug of suggestions) {
        expect(sug.type).to.be.a('string');
      }
    });
  });
});
