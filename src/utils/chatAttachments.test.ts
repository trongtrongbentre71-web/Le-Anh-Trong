import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAttachmentFile,
  convertAiControlPoints,
  convertAiDetailRows,
  convertAiTraverseRows,
  formatFileSize,
  truncateDocumentText,
} from './chatAttachments.ts';

test('classifyAttachmentFile detects image, pdf, spreadsheet, text, and unsupported files', () => {
  assert.equal(classifyAttachmentFile('de_bai.pdf', 'application/pdf'), 'pdf');
  assert.equal(classifyAttachmentFile('so_do.jpg', 'image/jpeg'), 'image');
  assert.equal(classifyAttachmentFile('bang_toa_do.xlsx', ''), 'spreadsheet');
  assert.equal(classifyAttachmentFile('civil3d.csv', 'text/csv'), 'spreadsheet');
  assert.equal(classifyAttachmentFile('script.scr', ''), 'text');
  assert.equal(classifyAttachmentFile('notes.txt', 'text/plain'), 'text');
  assert.equal(classifyAttachmentFile('archive.zip', 'application/zip'), 'unsupported');
});

test('formatFileSize and truncateDocumentText format cleanly', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(1.5 * 1024 * 1024), '1.50 MB');
  const trunc = truncateDocumentText('abcdef', 4);
  assert.ok(trunc.startsWith('abcd'));
  assert.ok(trunc.includes('rút gọn'));
});

test('convertAiControlPoints converts valid benchmarks and skips NaN rows', () => {
  const cps = convertAiControlPoints({
    mode: 'replace',
    points: [
      { name: 'A1', x: 2345.1234, y: 1200.5, h: 15.25, note: 'Mốc đề bài' },
      { name: 'BAD', x: Number.NaN, y: 100, h: 10 },
    ],
  });
  assert.equal(cps.length, 1);
  assert.equal(cps[0].name, 'A1');
  assert.equal(cps[0].x, 2345.123);
  assert.equal(cps[0].h, 15.25);
});

test('convertAiTraverseRows parses 2-face L/R angles and converts mia to active unit', () => {
  const rows = convertAiTraverseRows(
    {
      mode: 'replace',
      rows: [
        {
          stationName: 'M1',
          targetName: 'T1',
          instrumentHeightM: 1.52,
          hzBackLStr: '0°00\'00"',
          hzForeLStr: '90°12\'30"',
          hzBackRStr: '180°00\'05"',
          hzForeRStr: '270°12\'40"',
          vertLStr: '89°40\'00"',
          vertRStr: '270°20\'00"',
          miaAMm: 1.75, // meters -> 1750mm -> 1.75m
          miaLMm: 1.5,
          miaBMm: 1.25,
        },
      ],
    },
    'm'
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hzForeL.deg, '90');
  assert.equal(rows[0].hzForeL.min, '12');
  assert.equal(rows[0].miaA, 1.75);
  assert.equal(rows[0].miaB, 1.25);
});

test('convertAiDetailRows handles batch detail + transfer points with -0° and unit conversion', () => {
  const { rows, detectedVerticalMode } = convertAiDetailRows(
    {
      mode: 'append',
      rows: [
        {
          pointName: 'P10',
          stationName: 'M1',
          orientName: 'M0',
          instrumentHeightM: 1450, // mm -> 1.45m
          hzPointStr: '78°30\'00"',
          vertAngleStr: '-0°18\'40"',
          miaAMm: 1800,
          miaLMm: 1500,
          miaBMm: 1200,
          kind: 'station',
          note: 'Trạm chuyền từ đề',
        },
      ],
    },
    { miaUnit: 'mm', instrumentHeightUnit: 'm', outputUnit: 'm' },
    { defaultStation: 'M1', defaultOrient: 'M0', defaultVertMode: 'Z', existingCount: 7 }
  );

  assert.equal(detectedVerticalMode, 'V');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].instrumentHeight, 1.45);
  assert.equal(rows[0].vertAngle.deg, '-0');
  assert.equal(rows[0].kind, 'station');
});

test('convertDetailRowsUnitChange rescales mia & instrumentHeight cleanly when switching units', async () => {
  const { convertDetailRowsUnitChange, matchNameInList } = await import('./chatAttachments.ts');
  const converted = convertDetailRowsUnitChange(
    [
      {
        id: '1',
        pointName: 'P1',
        stationName: 'M1',
        orientName: 'M0',
        instrumentHeight: 1.48,
        hzOrient: { deg: '0', min: '00', sec: '00' },
        hzPoint: { deg: '45', min: '00', sec: '00' },
        vertAngle: { deg: '90', min: '00', sec: '00' },
        miaA: 1620,
        miaL: 1470,
        miaB: 1320,
        kind: 'detail',
        note: '',
      },
    ],
    { miaUnit: 'mm', instrumentHeightUnit: 'm', outputUnit: 'm' },
    { miaUnit: 'm', instrumentHeightUnit: 'cm', outputUnit: 'm' }
  );
  assert.equal(converted[0].miaA, 1.62);
  assert.equal(converted[0].miaL, 1.47);
  assert.equal(converted[0].miaB, 1.32);
  assert.equal(converted[0].instrumentHeight, 148);
  assert.equal(matchNameInList('p4', ['P4', 'P5']), true);
  assert.equal(matchNameInList('P2', ['P4', 'P5']), false);
});
