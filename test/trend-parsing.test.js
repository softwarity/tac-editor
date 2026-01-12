/**
 * Trend parsing tests for TacEditor
 * Tests for METAR/SPECI trend forecast parsing (NOSIG, BECMG, TEMPO)
 */

import { expect } from '@esm-bundle/chai';
import { TacParser } from '../src/tac-parser.ts';
import reportGrammar from '../grammars/report.oaci.en.json';
import saGrammar from '../grammars/sa.oaci.en.json';

describe('TacParser - Trend Parsing', () => {
  let parser;

  beforeEach(() => {
    parser = new TacParser();
    parser.registerGrammar('report', reportGrammar);
    parser.registerGrammar('sa', saGrammar);
    parser.resolveInheritance();
    parser.setGrammar('sa');
  });

  describe('Single trend group', () => {
    it('should identify NOSIG as trend token', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 NOSIG');
      const nosig = tokens.find(t => t.text === 'NOSIG');
      expect(nosig).to.exist;
      expect(nosig.type).to.equal('nosig');
      expect(nosig.category).to.equal('trend');
    });

    it('should identify BECMG as trend token', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG 5000');
      const becmg = tokens.find(t => t.text === 'BECMG');
      expect(becmg).to.exist;
      expect(becmg.type).to.equal('becmg');
      expect(becmg.category).to.equal('trend');
    });

    it('should identify TEMPO as trend token', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 TEMPO 3000');
      const tempo = tokens.find(t => t.text === 'TEMPO');
      expect(tempo).to.exist;
      expect(tempo.type).to.equal('tempo');
      expect(tempo.category).to.equal('trend');
    });

    it('should identify trend CAVOK as trendCavok', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG CAVOK');
      const cavokTokens = tokens.filter(t => t.text === 'CAVOK');
      expect(cavokTokens.length).to.equal(1);
      expect(cavokTokens[0].type).to.equal('trendCavok');
      expect(cavokTokens[0].category).to.equal('trend');
    });

    it('should identify trend visibility as trendVisibility', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG 5000');
      const visibilityTokens = tokens.filter(t => t.text === '5000');
      // First 5000 doesn't exist in this message, only the trend visibility
      expect(visibilityTokens.length).to.equal(1);
      expect(visibilityTokens[0].type).to.equal('trendVisibility');
    });
  });

  describe('Multiple trend groups', () => {
    it('should identify both BECMG and TEMPO in multiple trends', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG 5000 TEMPO 3000');
      const becmg = tokens.find(t => t.text === 'BECMG');
      const tempo = tokens.find(t => t.text === 'TEMPO');
      expect(becmg).to.exist;
      expect(becmg.type).to.equal('becmg');
      expect(tempo).to.exist;
      expect(tempo.type).to.equal('tempo');
    });

    it('should identify both CAVOK tokens as trendCavok in BECMG CAVOK TEMPO CAVOK', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG CAVOK TEMPO CAVOK');
      const cavokTokens = tokens.filter(t => t.text === 'CAVOK');

      expect(cavokTokens.length).to.equal(2, 'Should have exactly 2 CAVOK tokens');

      // First CAVOK after BECMG
      expect(cavokTokens[0].type).to.equal('trendCavok', 'First CAVOK should be trendCavok');
      expect(cavokTokens[0].category).to.equal('trend', 'First CAVOK should have trend category');

      // Second CAVOK after TEMPO
      expect(cavokTokens[1].type).to.equal('trendCavok', 'Second CAVOK should be trendCavok');
      expect(cavokTokens[1].category).to.equal('trend', 'Second CAVOK should have trend category');
    });

    it('should handle three consecutive trend groups', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG 5000 TEMPO 3000 BECMG CAVOK');
      const trendKeywords = tokens.filter(t => ['becmg', 'tempo'].includes(t.type));
      expect(trendKeywords.length).to.equal(3, 'Should have 3 trend keywords');
    });

    it('should correctly identify trend visibility vs observation visibility', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG 5000 TEMPO 3000');

      const obsVis = tokens.find(t => t.text === '9999');
      expect(obsVis).to.exist;
      expect(obsVis.type).to.equal('visibility', 'Observation visibility should be type visibility');

      const trendVis5000 = tokens.find(t => t.text === '5000');
      expect(trendVis5000).to.exist;
      expect(trendVis5000.type).to.equal('trendVisibility', 'First trend visibility should be trendVisibility');

      const trendVis3000 = tokens.find(t => t.text === '3000');
      expect(trendVis3000).to.exist;
      expect(trendVis3000.type).to.equal('trendVisibility', 'Second trend visibility should be trendVisibility');
    });
  });

  describe('Observation CAVOK vs trend CAVOK', () => {
    it('should identify observation CAVOK correctly', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT CAVOK 12/05 Q1023 NOSIG');
      const cavok = tokens.find(t => t.text === 'CAVOK');
      expect(cavok).to.exist;
      expect(cavok.type).to.equal('cavok');
      expect(cavok.category).to.equal('status');
    });

    it('should distinguish observation CAVOK from trend CAVOK', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT CAVOK 12/05 Q1023 BECMG 5000 BR');
      const cavokTokens = tokens.filter(t => t.text === 'CAVOK');
      expect(cavokTokens.length).to.equal(1);
      expect(cavokTokens[0].type).to.equal('cavok', 'Should be observation cavok');
      expect(cavokTokens[0].category).to.equal('status');
    });
  });

  describe('Trend with wind', () => {
    it('should identify trend wind as trendWind', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG 36020KT');
      const windTokens = tokens.filter(t => t.text.endsWith('KT'));
      expect(windTokens.length).to.equal(2);

      // Observation wind
      expect(windTokens[0].type).to.equal('wind');

      // Trend wind
      expect(windTokens[1].type).to.equal('trendWind');
      expect(windTokens[1].category).to.equal('trend');
    });

    it('should handle trend wind followed by trend visibility', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG 36020KT 5000');

      const trendWind = tokens.find(t => t.text === '36020KT');
      expect(trendWind).to.exist;
      expect(trendWind.type).to.equal('trendWind');

      const trendVis = tokens.find(t => t.text === '5000');
      expect(trendVis).to.exist;
      expect(trendVis.type).to.equal('trendVisibility');
    });
  });

  describe('Trend time indicators', () => {
    it('should identify FM time indicator', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG FM1100 5000');
      const fm = tokens.find(t => t.text === 'FM1100');
      expect(fm).to.exist;
      expect(fm.type).to.equal('trendTimeFM');
    });

    it('should identify TL time indicator', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG FM1100 TL1200 5000');
      const tl = tokens.find(t => t.text === 'TL1200');
      expect(tl).to.exist;
      expect(tl.type).to.equal('trendTimeTL');
    });

    it('should identify AT time indicator', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 TEMPO AT1130 TSRA');
      const at = tokens.find(t => t.text === 'AT1130');
      expect(at).to.exist;
      expect(at.type).to.equal('trendTimeAT');
    });
  });

  describe('Complex trend scenarios', () => {
    it('should parse METAR with BECMG and multiple conditions', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 BECMG FM1100 TL1200 5000 BR BKN010');

      const becmg = tokens.find(t => t.text === 'BECMG');
      expect(becmg.type).to.equal('becmg');

      const fm = tokens.find(t => t.text === 'FM1100');
      expect(fm.type).to.equal('trendTimeFM');

      const tl = tokens.find(t => t.text === 'TL1200');
      expect(tl.type).to.equal('trendTimeTL');

      const trendVis = tokens.find(t => t.text === '5000');
      expect(trendVis.type).to.equal('trendVisibility');

      const trendWeather = tokens.find(t => t.text === 'BR');
      expect(trendWeather).to.exist;
      expect(trendWeather.type).to.equal('trendWeather');

      const trendCloud = tokens.find(t => t.text === 'BKN010');
      expect(trendCloud).to.exist;
      expect(trendCloud.type).to.equal('trendCloud');
    });

    it('should parse METAR with multiple TEMPO groups', () => {
      const tokens = parser.tokenize('METAR LFPG 281030Z 27015KT 9999 FEW040 12/05 Q1023 TEMPO 3000 TSRA TEMPO 1500 FG');

      const tempoTokens = tokens.filter(t => t.type === 'tempo');
      expect(tempoTokens.length).to.equal(2);

      const trendVisTokens = tokens.filter(t => t.type === 'trendVisibility');
      expect(trendVisTokens.length).to.equal(2);
      expect(trendVisTokens[0].text).to.equal('3000');
      expect(trendVisTokens[1].text).to.equal('1500');
    });
  });
});
