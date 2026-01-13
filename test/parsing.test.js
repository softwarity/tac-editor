/**
 * Parsing tests for TacEditor
 */

import { expect } from '@esm-bundle/chai';
import { TacParser } from '../src/tac-parser.ts';
import reportGrammar from '../grammars/report.oaci.en.json';
import reportNoaaGrammar from '../grammars/report.noaa.en.json';
import saGrammar from '../grammars/sa.oaci.en.json';
import saNoaaGrammar from '../grammars/sa.noaa.en.json';
import spGrammar from '../grammars/sp.oaci.en.json';
import fvGrammar from '../grammars/fv.oaci.en.json';
import { metarSamples, speciSamples } from './fixtures/tac-samples.js';

describe('TacParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TacParser();
    // Register grammars with inheritance chain: sa/sp -> report
    // Register with both 'report' (for extends) and 'report:oaci' names
    parser.registerGrammar('report', reportGrammar);
    parser.registerGrammar('report:oaci', reportGrammar);
    parser.registerGrammar('report.noaa', reportNoaaGrammar);
    parser.registerGrammar('sa:oaci', saGrammar);
    parser.registerGrammar('sa:noaa', saNoaaGrammar);
    parser.registerGrammar('sp:oaci', spGrammar);
    // Resolve inheritance after all grammars are registered
    parser.resolveInheritance();
  });

  describe('Grammar Registration', () => {
    it('should register a grammar', () => {
      expect(parser.getGrammarNames()).to.include('sa:oaci');
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
      expect(type).to.equal('sa:oaci');
    });

    it('should detect SPECI message type', () => {
      const type = parser.detectMessageType('SPECI EGLL 281045Z');
      expect(type).to.equal('sp:oaci');
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
      expect(type).to.equal('sa:oaci');
    });
  });

  describe('Tokenization', () => {
    // Note: tokenize() requires detectMessageType() to be called first to set the grammar

    it('should tokenize simple METAR', () => {
      parser.detectMessageType(metarSamples.simple);
      const tokens = parser.tokenize(metarSamples.simple);
      expect(tokens).to.be.an('array');
      expect(tokens.length).to.be.greaterThan(0);
    });

    it('should identify METAR keyword', () => {
      parser.detectMessageType('METAR LFPG');
      const tokens = parser.tokenize('METAR LFPG');
      const keyword = tokens.find(t => t.text === 'METAR');
      expect(keyword).to.exist;
      expect(keyword.type).to.equal('identifier');
    });

    it('should identify ICAO code', () => {
      parser.detectMessageType('METAR LFPG 281030Z');
      const tokens = parser.tokenize('METAR LFPG 281030Z');
      const icao = tokens.find(t => t.text === 'LFPG');
      expect(icao).to.exist;
      expect(icao.type).to.equal('icao');
    });

    it('should identify datetime', () => {
      parser.detectMessageType('METAR LFPG 281030Z');
      const tokens = parser.tokenize('METAR LFPG 281030Z');
      const datetime = tokens.find(t => t.text === '281030Z');
      expect(datetime).to.exist;
      expect(datetime.type).to.equal('datetime');
    });

    it('should identify wind', () => {
      parser.detectMessageType('METAR LFPG 281030Z 27015KT');
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT');
      const wind = tokens.find(t => t.text === '27015KT');
      expect(wind).to.exist;
      expect(wind.type).to.equal('wind');
    });

    it('should identify wind with gusts', () => {
      parser.detectMessageType(metarSamples.withGusts);
      const tokens = parser.tokenize(metarSamples.withGusts);
      const wind = tokens.find(t => t.text.includes('G25'));
      expect(wind).to.exist;
      expect(wind.type).to.equal('wind');
    });

    it('should identify CAVOK', () => {
      parser.detectMessageType(metarSamples.cavok);
      const tokens = parser.tokenize(metarSamples.cavok);
      const cavok = tokens.find(t => t.text === 'CAVOK');
      expect(cavok).to.exist;
      expect(cavok.type).to.equal('cavok');
    });

    it('should identify visibility', () => {
      parser.detectMessageType(metarSamples.simple);
      const tokens = parser.tokenize(metarSamples.simple);
      const visibility = tokens.find(t => t.text === '9999');
      expect(visibility).to.exist;
      expect(visibility.type).to.equal('visibility');
    });

    it('should identify cloud layers', () => {
      parser.detectMessageType(metarSamples.simple);
      const tokens = parser.tokenize(metarSamples.simple);
      const cloud = tokens.find(t => t.text === 'FEW040');
      expect(cloud).to.exist;
      expect(cloud.type).to.equal('cloudBase');
    });

    it('should identify temperature/dewpoint', () => {
      parser.detectMessageType(metarSamples.simple);
      const tokens = parser.tokenize(metarSamples.simple);
      const temp = tokens.find(t => t.text === '12/05');
      expect(temp).to.exist;
      expect(temp.type).to.equal('temperature');
    });

    it('should identify QNH pressure', () => {
      parser.detectMessageType(metarSamples.simple);
      const tokens = parser.tokenize(metarSamples.simple);
      const pressure = tokens.find(t => t.text === 'Q1023');
      expect(pressure).to.exist;
      expect(pressure.type).to.equal('pressure');
    });

    it('should identify altimeter (US format)', () => {
      // Use NOAA grammar explicitly for US format testing
      parser.setGrammar('sa:noaa');
      const tokens = parser.tokenize(metarSamples.usFormat);
      const pressure = tokens.find(t => t.text === 'A3042');
      expect(pressure).to.exist;
      expect(pressure.type).to.equal('pressureInches');
      expect(pressure.category).to.equal('measurement');
    });

    it('should identify NOSIG trend', () => {
      parser.detectMessageType(metarSamples.simple);
      const tokens = parser.tokenize(metarSamples.simple);
      const trend = tokens.find(t => t.text === 'NOSIG');
      expect(trend).to.exist;
      expect(trend.type).to.equal('nosig');
      expect(trend.category).to.equal('trend');
    });

    it('should identify AUTO modifier', () => {
      parser.detectMessageType(metarSamples.auto);
      const tokens = parser.tokenize(metarSamples.auto);
      const auto = tokens.find(t => t.text === 'AUTO');
      expect(auto).to.exist;
      expect(auto.type).to.equal('auto');
      expect(auto.category).to.equal('keyword');
    });

    it('should identify COR correction', () => {
      parser.detectMessageType(metarSamples.correction);
      const tokens = parser.tokenize(metarSamples.correction);
      const cor = tokens.find(t => t.text === 'COR');
      expect(cor).to.exist;
      expect(cor.type).to.equal('correction');
      expect(cor.category).to.equal('keyword');
    });

    it('should identify NIL report', () => {
      parser.detectMessageType(metarSamples.nil);
      const tokens = parser.tokenize(metarSamples.nil);
      const nil = tokens.find(t => t.text === 'NIL');
      expect(nil).to.exist;
      expect(nil.type).to.equal('nil');
      expect(nil.category).to.equal('keyword');
    });

    it('should identify variable wind direction', () => {
      parser.detectMessageType(metarSamples.withVariableWind);
      const tokens = parser.tokenize(metarSamples.withVariableWind);
      const variation = tokens.find(t => t.text === '350V030');
      expect(variation).to.exist;
      expect(variation.type).to.equal('windVariation');
      expect(variation.category).to.equal('measurement');
    });

    it('should identify calm wind (00000KT)', () => {
      parser.detectMessageType(metarSamples.calm);
      const tokens = parser.tokenize(metarSamples.calm);
      const wind = tokens.find(t => t.text === '00000KT');
      expect(wind).to.exist;
      expect(wind.type).to.equal('wind');
    });

    it('should preserve whitespace tokens', () => {
      parser.detectMessageType('METAR LFPG');
      const tokens = parser.tokenize('METAR LFPG');
      const whitespace = tokens.find(t => t.type === 'whitespace');
      expect(whitespace).to.exist;
    });

    it('should include start and end positions', () => {
      parser.detectMessageType('METAR LFPG');
      const tokens = parser.tokenize('METAR LFPG');
      for (const token of tokens) {
        expect(token.start).to.be.a('number');
        expect(token.end).to.be.a('number');
        expect(token.end).to.be.greaterThan(token.start);
      }
    });
  });

  describe('Weather Phenomena Tokenization', () => {
    it('should identify moderate rain (RA)', () => {
      parser.detectMessageType(metarSamples.withWeather);
      const tokens = parser.tokenize(metarSamples.withWeather);
      const weather = tokens.find(t => t.text === 'RA');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
      expect(weather.category).to.equal('phenomenon');
    });

    it('should identify heavy rain (+RA)', () => {
      parser.detectMessageType(metarSamples.withHeavyRain);
      const tokens = parser.tokenize(metarSamples.withHeavyRain);
      const weather = tokens.find(t => t.text === '+RA');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify light drizzle (-DZ)', () => {
      parser.detectMessageType(metarSamples.withLightDrizzle);
      const tokens = parser.tokenize(metarSamples.withLightDrizzle);
      const weather = tokens.find(t => t.text === '-DZ');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify thunderstorm with rain (+TSRA)', () => {
      parser.detectMessageType(metarSamples.withThunderstorm);
      const tokens = parser.tokenize(metarSamples.withThunderstorm);
      const weather = tokens.find(t => t.text === '+TSRA');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify snow (SN)', () => {
      parser.detectMessageType(metarSamples.withSnow);
      const tokens = parser.tokenize(metarSamples.withSnow);
      const weather = tokens.find(t => t.text === 'SN');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify freezing rain (FZRA)', () => {
      parser.detectMessageType(metarSamples.withFreezingRain);
      const tokens = parser.tokenize(metarSamples.withFreezingRain);
      const weather = tokens.find(t => t.text === 'FZRA');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify mist (BR)', () => {
      parser.detectMessageType(metarSamples.withMist);
      const tokens = parser.tokenize(metarSamples.withMist);
      const weather = tokens.find(t => t.text === 'BR');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify haze (HZ)', () => {
      parser.detectMessageType(metarSamples.withHaze);
      const tokens = parser.tokenize(metarSamples.withHaze);
      const weather = tokens.find(t => t.text === 'HZ');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify blowing snow (BLSN)', () => {
      parser.detectMessageType(metarSamples.withBlowingSnow);
      const tokens = parser.tokenize(metarSamples.withBlowingSnow);
      const weather = tokens.find(t => t.text === 'BLSN');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify showers of rain (SHRA)', () => {
      parser.detectMessageType(metarSamples.withShowers);
      const tokens = parser.tokenize(metarSamples.withShowers);
      const weather = tokens.find(t => t.text === 'SHRA');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify fog (FG)', () => {
      parser.detectMessageType(metarSamples.fog);
      const tokens = parser.tokenize(metarSamples.fog);
      const weather = tokens.find(t => t.text === 'FG');
      expect(weather).to.exist;
      expect(weather.type).to.equal('weather');
    });

    it('should identify multiple weather phenomena', () => {
      parser.detectMessageType(metarSamples.withMultipleWeather);
      const tokens = parser.tokenize(metarSamples.withMultipleWeather);
      const ra = tokens.find(t => t.text === 'RA');
      const br = tokens.find(t => t.text === 'BR');
      expect(ra).to.exist;
      expect(br).to.exist;
    });

    it('should identify thunderstorm in vicinity (VCTS)', () => {
      parser.detectMessageType(metarSamples.withVicinityTS);
      const tokens = parser.tokenize(metarSamples.withVicinityTS);
      const weather = tokens.find(t => t.text === 'VCTS');
      expect(weather).to.exist;
      // VCTS matches the weather pattern (VC+TS) so it's parsed as weather type
      expect(weather.type).to.equal('weather');
      expect(weather.category).to.equal('phenomenon');
    });
  });

  describe('Cloud Types Tokenization', () => {
    it('should identify cloud with CB (Cumulonimbus)', () => {
      parser.detectMessageType(metarSamples.withCB);
      const tokens = parser.tokenize(metarSamples.withCB);
      const cloud = tokens.find(t => t.text === 'FEW040CB');
      expect(cloud).to.exist;
      expect(cloud.type).to.equal('cloud');
      expect(cloud.category).to.equal('measurement');
    });

    it('should identify cloud with TCU (Towering Cumulus)', () => {
      parser.detectMessageType(metarSamples.withTCU);
      const tokens = parser.tokenize(metarSamples.withTCU);
      const cloud = tokens.find(t => t.text === 'SCT025TCU');
      expect(cloud).to.exist;
      expect(cloud.type).to.equal('cloud');
    });

    it('should identify vertical visibility (VV)', () => {
      parser.detectMessageType(metarSamples.verticalVisibility);
      const tokens = parser.tokenize(metarSamples.verticalVisibility);
      const vv = tokens.find(t => t.text === 'VV001');
      expect(vv).to.exist;
      expect(vv.type).to.equal('verticalVisibility');
      expect(vv.category).to.equal('measurement');
    });

    it('should identify NSC (No Significant Cloud)', () => {
      parser.detectMessageType(metarSamples.withNSC);
      const tokens = parser.tokenize(metarSamples.withNSC);
      const nsc = tokens.find(t => t.text === 'NSC');
      expect(nsc).to.exist;
      expect(nsc.type).to.equal('nsc');
      expect(nsc.category).to.equal('status');
    });

    it('should identify NCD (No Cloud Detected)', () => {
      parser.detectMessageType(metarSamples.withNCD);
      const tokens = parser.tokenize(metarSamples.withNCD);
      const ncd = tokens.find(t => t.text === 'NCD');
      expect(ncd).to.exist;
      expect(ncd.type).to.equal('ncd');
      expect(ncd.category).to.equal('status');
    });
  });

  describe('RVR (Runway Visual Range) Tokenization', () => {
    it('should identify RVR with tendency', () => {
      parser.detectMessageType(metarSamples.withRVR);
      const tokens = parser.tokenize(metarSamples.withRVR);
      const rvr = tokens.find(t => t.text === 'R27/0800U');
      expect(rvr).to.exist;
      expect(rvr.type).to.equal('rvr');
      expect(rvr.category).to.equal('measurement');
    });

    it('should identify RVR with variation', () => {
      parser.detectMessageType(metarSamples.withRVRVariation);
      const tokens = parser.tokenize(metarSamples.withRVRVariation);
      const rvr = tokens.find(t => t.text === 'R27L/0400V0800U');
      expect(rvr).to.exist;
      expect(rvr.type).to.equal('rvr');
    });

    it('should identify multiple RVR groups', () => {
      parser.detectMessageType(metarSamples.withMultipleRVR);
      const tokens = parser.tokenize(metarSamples.withMultipleRVR);
      const rvr27 = tokens.find(t => t.text === 'R27/0600');
      const rvr09 = tokens.find(t => t.text === 'R09/0800');
      expect(rvr27).to.exist;
      expect(rvr09).to.exist;
    });
  });

  describe('Recent Weather Tokenization', () => {
    it('should identify recent rain (RERA)', () => {
      parser.detectMessageType(metarSamples.withRecentWeather);
      const tokens = parser.tokenize(metarSamples.withRecentWeather);
      const recent = tokens.find(t => t.text === 'RERA');
      expect(recent).to.exist;
      expect(recent.type).to.equal('recentWeather');
      expect(recent.category).to.equal('phenomenon');
    });

    it('should identify recent thunderstorm (RETS)', () => {
      parser.detectMessageType(metarSamples.withRecentTS);
      const tokens = parser.tokenize(metarSamples.withRecentTS);
      const recent = tokens.find(t => t.text === 'RETS');
      expect(recent).to.exist;
      expect(recent.type).to.equal('recentWeather');
    });
  });

  describe('Windshear Tokenization', () => {
    it('should identify windshear on runway', () => {
      parser.detectMessageType(metarSamples.withWindshear);
      const tokens = parser.tokenize(metarSamples.withWindshear);
      const ws = tokens.find(t => t.text === 'WS');
      const rwy = tokens.find(t => t.text === 'R27');
      expect(ws).to.exist;
      expect(ws.type).to.equal('windshear');
      expect(rwy).to.exist;
      expect(rwy.type).to.equal('windshearRunway');
    });

    it('should identify windshear on left runway', () => {
      parser.detectMessageType(metarSamples.withWindshearLeft);
      const tokens = parser.tokenize(metarSamples.withWindshearLeft);
      const rwy = tokens.find(t => t.text === 'R27L');
      expect(rwy).to.exist;
      expect(rwy.type).to.equal('windshearRunway');
    });

    it('should identify windshear all runways', () => {
      parser.detectMessageType(metarSamples.withWindshearAll);
      const tokens = parser.tokenize(metarSamples.withWindshearAll);
      const ws = tokens.find(t => t.text === 'WS');
      const all = tokens.find(t => t.text === 'ALL');
      const rwy = tokens.find(t => t.text === 'RWY');
      expect(ws).to.exist;
      expect(all).to.exist;
      expect(all.type).to.equal('windshearAllRwy');
      expect(rwy).to.exist;
      expect(rwy.type).to.equal('rwy');
    });
  });

  describe('Temperature Tokenization', () => {
    it('should identify positive temperature/dewpoint', () => {
      parser.detectMessageType(metarSamples.simple);
      const tokens = parser.tokenize(metarSamples.simple);
      const temp = tokens.find(t => t.text === '12/05');
      expect(temp).to.exist;
      expect(temp.type).to.equal('temperature');
    });

    it('should identify negative temperature (M prefix)', () => {
      parser.detectMessageType(metarSamples.withNegativeTemp);
      const tokens = parser.tokenize(metarSamples.withNegativeTemp);
      const temp = tokens.find(t => t.text === 'M05/M10');
      expect(temp).to.exist;
      expect(temp.type).to.equal('temperature');
    });
  });

  describe('Directional Visibility Tokenization', () => {
    it('should identify directional visibility', () => {
      parser.detectMessageType(metarSamples.withDirectionalVis);
      const tokens = parser.tokenize(metarSamples.withDirectionalVis);
      const dirVis = tokens.find(t => t.text === '2000NE');
      expect(dirVis).to.exist;
      expect(dirVis.type).to.equal('directionalVisibility');
      expect(dirVis.category).to.equal('measurement');
    });
  });

  describe('Trend Tokenization', () => {
    it('should identify TEMPO trend', () => {
      parser.detectMessageType(metarSamples.withTempo);
      const tokens = parser.tokenize(metarSamples.withTempo);
      const tempo = tokens.find(t => t.text === 'TEMPO');
      expect(tempo).to.exist;
      expect(tempo.type).to.equal('tempo');
      expect(tempo.category).to.equal('trend');
    });

    it('should identify BECMG trend', () => {
      parser.detectMessageType(metarSamples.withBECMG);
      const tokens = parser.tokenize(metarSamples.withBECMG);
      const becmg = tokens.find(t => t.text === 'BECMG');
      expect(becmg).to.exist;
      expect(becmg.type).to.equal('becmg');
      expect(becmg.category).to.equal('trend');
    });

    it('should identify trend time FM', () => {
      parser.detectMessageType(metarSamples.withBECMG);
      const tokens = parser.tokenize(metarSamples.withBECMG);
      const fm = tokens.find(t => t.text === 'FM1100');
      expect(fm).to.exist;
      expect(fm.type).to.equal('trendTimeFM');
      expect(fm.category).to.equal('datetime');
    });

    it('should identify trend time TL', () => {
      parser.detectMessageType(metarSamples.withBECMG);
      const tokens = parser.tokenize(metarSamples.withBECMG);
      const tl = tokens.find(t => t.text === 'TL1200');
      expect(tl).to.exist;
      expect(tl.type).to.equal('trendTimeTL');
      expect(tl.category).to.equal('datetime');
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
      parser.detectMessageType(metarSamples.simple);
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

describe('TacParser - VAA Grammar', () => {
  let parser;

  beforeEach(() => {
    parser = new TacParser();
    parser.registerGrammar('fv:oaci', fvGrammar);
  });

  describe('Multi-token identifier detection', () => {
    it('should detect VA ADVISORY message type', () => {
      const type = parser.detectMessageType('VA ADVISORY');
      expect(type).to.equal('fv:oaci');
    });

    it('should detect VA ADVISORY with subsequent content', () => {
      const type = parser.detectMessageType('VA ADVISORY\nDTG: 20080923/0130Z');
      expect(type).to.equal('fv:oaci');
    });

    it('should be case insensitive for VA ADVISORY', () => {
      const type = parser.detectMessageType('va advisory');
      expect(type).to.equal('fv:oaci');
    });
  });

  describe('VAA Tokenization', () => {
    it('should tokenize VA ADVISORY identifier', () => {
      parser.detectMessageType('VA ADVISORY');
      const tokens = parser.tokenize('VA ADVISORY');
      const identifier = tokens.find(t => t.text === 'VA ADVISORY');
      expect(identifier).to.exist;
      expect(identifier.type).to.equal('identifier');
    });

    it('should tokenize DTG label', () => {
      parser.detectMessageType('VA ADVISORY');
      const tokens = parser.tokenize('VA ADVISORY\nDTG: 20080923/0130Z');
      const dtgLabel = tokens.find(t => t.text === 'DTG:');
      expect(dtgLabel).to.exist;
      expect(dtgLabel.type).to.equal('dtgLabel');
    });

    it('should tokenize DTG value', () => {
      parser.detectMessageType('VA ADVISORY');
      const tokens = parser.tokenize('VA ADVISORY\nDTG: 20080923/0130Z');
      const dtgValue = tokens.find(t => t.text === '20080923/0130Z');
      expect(dtgValue).to.exist;
      expect(dtgValue.type).to.equal('dtgValue');
    });

    it('should tokenize VAAC name', () => {
      parser.detectMessageType('VA ADVISORY');
      const tokens = parser.tokenize('VA ADVISORY\nDTG: 20080923/0130Z\nVAAC: TOKYO');
      const vaacLabel = tokens.find(t => t.text === 'VAAC:');
      const vaacValue = tokens.find(t => t.text === 'TOKYO');
      expect(vaacLabel).to.exist;
      expect(vaacValue).to.exist;
      expect(vaacValue.type).to.equal('vaacValue');
    });

    it('should tokenize colour code label', () => {
      parser.detectMessageType('VA ADVISORY');
      const tokens = parser.tokenize('VA ADVISORY\nAVIATION COLOUR CODE: RED');
      const colourCodeLabel = tokens.find(t => t.text === 'AVIATION COLOUR CODE:');
      expect(colourCodeLabel).to.exist;
      expect(colourCodeLabel.type).to.equal('colourCodeLabel');
    });

    it('should tokenize OBS VA CLD label', () => {
      parser.detectMessageType('VA ADVISORY');
      const tokens = parser.tokenize('VA ADVISORY\nOBS VA CLD: FL250/300');
      const obsVaCldLabel = tokens.find(t => t.text === 'OBS VA CLD:');
      expect(obsVaCldLabel).to.exist;
      expect(obsVaCldLabel.type).to.equal('obsVaCldLabel');
    });
  });
});
