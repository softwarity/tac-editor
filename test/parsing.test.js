/**
 * Parsing tests for TacEditor
 */

import { expect } from '@esm-bundle/chai';
import { TacParser } from '../src/tac-parser.ts';
import metarSpeciGrammar from '../grammars/metar-speci.en.json';
import { metarSamples, speciSamples } from './fixtures/tac-samples.js';

describe('TacParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TacParser();
    parser.registerGrammar('metar-speci', metarSpeciGrammar);
  });

  describe('Grammar Registration', () => {
    it('should register a grammar', () => {
      expect(parser.getGrammarNames()).to.include('metar-speci');
    });

    it('should return registered grammar names', () => {
      const names = parser.getGrammarNames();
      expect(names).to.be.an('array');
      expect(names.length).to.be.greaterThan(0);
    });
  });

  describe('Message Type Detection', () => {
    it('should detect METAR message type', () => {
      const type = parser.detectMessageType('METAR LFPG 281030Z');
      expect(type).to.equal('metar-speci');
    });

    it('should detect SPECI message type', () => {
      const type = parser.detectMessageType('SPECI EGLL 281045Z');
      expect(type).to.equal('metar-speci');
    });

    it('should return null for unknown message type', () => {
      const type = parser.detectMessageType('UNKNOWN LFPG');
      expect(type).to.be.null;
    });

    it('should return null for empty text', () => {
      const type = parser.detectMessageType('');
      expect(type).to.be.null;
    });

    it('should be case insensitive', () => {
      const type = parser.detectMessageType('metar LFPG');
      expect(type).to.equal('metar-speci');
    });
  });

  describe('Tokenization', () => {
    it('should tokenize simple METAR', () => {
      const tokens = parser.tokenize(metarSamples.simple);
      expect(tokens).to.be.an('array');
      expect(tokens.length).to.be.greaterThan(0);
    });

    it('should identify METAR keyword', () => {
      const tokens = parser.tokenize('METAR LFPG');
      const keyword = tokens.find(t => t.text === 'METAR');
      expect(keyword).to.exist;
      expect(keyword.type).to.equal('identifier');
    });

    it('should identify ICAO code', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z');
      const icao = tokens.find(t => t.text === 'LFPG');
      expect(icao).to.exist;
      expect(icao.type).to.equal('icao');
    });

    it('should identify datetime', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z');
      const datetime = tokens.find(t => t.text === '281030Z');
      expect(datetime).to.exist;
      expect(datetime.type).to.equal('datetime');
    });

    it('should identify wind', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT');
      const wind = tokens.find(t => t.text === '27015KT');
      expect(wind).to.exist;
      expect(wind.type).to.equal('wind');
    });

    it('should identify wind with gusts', () => {
      const tokens = parser.tokenize(metarSamples.withGusts);
      const wind = tokens.find(t => t.text.includes('G25'));
      expect(wind).to.exist;
      expect(wind.type).to.equal('wind');
    });

    it('should identify CAVOK', () => {
      const tokens = parser.tokenize(metarSamples.cavok);
      const cavok = tokens.find(t => t.text === 'CAVOK');
      expect(cavok).to.exist;
      expect(cavok.type).to.equal('cavok');
    });

    it('should identify visibility', () => {
      const tokens = parser.tokenize(metarSamples.simple);
      const visibility = tokens.find(t => t.text === '9999');
      expect(visibility).to.exist;
      expect(visibility.type).to.equal('visibility');
    });

    it('should identify cloud layers', () => {
      const tokens = parser.tokenize(metarSamples.simple);
      const cloud = tokens.find(t => t.text === 'FEW040');
      expect(cloud).to.exist;
      expect(cloud.type).to.equal('cloud');
    });

    it('should identify temperature/dewpoint', () => {
      const tokens = parser.tokenize(metarSamples.simple);
      const temp = tokens.find(t => t.text === '12/05');
      expect(temp).to.exist;
      expect(temp.type).to.equal('temperature');
    });

    it('should identify QNH pressure', () => {
      const tokens = parser.tokenize(metarSamples.simple);
      const pressure = tokens.find(t => t.text === 'Q1023');
      expect(pressure).to.exist;
      expect(pressure.type).to.equal('pressure');
    });

    it('should identify altimeter (US format)', () => {
      const tokens = parser.tokenize(metarSamples.usFormat);
      const pressure = tokens.find(t => t.text === 'A3042');
      expect(pressure).to.exist;
      expect(pressure.type).to.equal('pressureInches');
      expect(pressure.style).to.equal('pressure');
    });

    it('should identify NOSIG trend', () => {
      const tokens = parser.tokenize(metarSamples.simple);
      const trend = tokens.find(t => t.text === 'NOSIG');
      expect(trend).to.exist;
      expect(trend.type).to.equal('nosig');
      expect(trend.style).to.equal('trend');
    });

    it('should preserve whitespace tokens', () => {
      const tokens = parser.tokenize('METAR LFPG');
      const whitespace = tokens.find(t => t.type === 'whitespace');
      expect(whitespace).to.exist;
    });

    it('should include start and end positions', () => {
      const tokens = parser.tokenize('METAR LFPG');
      for (const token of tokens) {
        expect(token.start).to.be.a('number');
        expect(token.end).to.be.a('number');
        expect(token.end).to.be.greaterThan(token.start);
      }
    });
  });

  describe('Tokenization - Raw (no grammar)', () => {
    it('should tokenize without grammar as error', () => {
      const emptyParser = new TacParser();
      const tokens = emptyParser.tokenize('SOMETHING UNKNOWN');
      expect(tokens).to.be.an('array');
      const errors = tokens.filter(t => t.type === 'error');
      expect(errors.length).to.be.greaterThan(0);
    });
  });

  describe('Validation', () => {
    it('should validate correct METAR', () => {
      const result = parser.validate(metarSamples.simple);
      expect(result.valid).to.be.true;
      expect(result.errors).to.be.an('array');
    });

    it('should return errors array for invalid input', () => {
      parser.detectMessageType('METAR LFPG');
      const result = parser.validate('METAR INVALID_STUFF');
      expect(result.errors).to.be.an('array');
    });
  });

  describe('Reset', () => {
    it('should reset current grammar', () => {
      parser.detectMessageType('METAR LFPG');
      expect(parser.currentGrammar).to.exist;
      parser.reset();
      expect(parser.currentGrammar).to.be.null;
    });
  });
});
