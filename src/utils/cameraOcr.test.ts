import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildControlPointsFromCandidates,
  buildDetailRowsFromCandidates,
  buildTraverseRowsFromCandidates,
  computeCandidateMiaErrorMm,
  inferVerticalModeFromAngleStr,
  normalizeInstrumentHeightM,
  normalizeMiaToMm,
  sanitizeOcrResponse,
  stripDataUrlPrefix,
} from './cameraOcr.ts';

test('stripDataUrlPrefix extracts MIME type and base64 cleanly', () => {
  const { mimeType, base64 } = stripDataUrlPrefix('data:image/jpeg;base64,ABC123==');
  assert.equal(mimeType, 'image/jpeg');
  assert.equal(base64, 'ABC123==');
  assert.throws(() => stripDataUrlPrefix('not-a-data-url'));
});

test('normalizeMiaToMm and normalizeInstrumentHeightM convert meters/cm/mm accurately', () => {
  assert.equal(normalizeMiaToMm(1.65, 1500), 1650);
  assert.equal(normalizeMiaToMm(1650, 1500), 1650);
  assert.equal(normalizeMiaToMm('1,425', 1500), 1425);
  assert.equal(normalizeInstrumentHeightM(1.48, 1.45), 1.48);
  assert.equal(normalizeInstrumentHeightM(1480, 1.45), 1.48);
  assert.equal(normalizeInstrumentHeightM(148, 1.45), 1.48);
});

test('inferVerticalModeFromAngleStr distinguishes Zenith Z (~90°) and Vertical V (-0° / ~0°)', () => {
  assert.equal(inferVerticalModeFromAngleStr('89°15\'20"', undefined, 'V'), 'Z');
  assert.equal(inferVerticalModeFromAngleStr('-0°25\'10"', undefined, 'Z'), 'V');
  assert.equal(inferVerticalModeFromAngleStr('2°10\'00"', undefined, 'Z'), 'V');
});

test('sanitizeOcrResponse and buildDetailRowsFromCandidates preserve -0° and convert to active units', () => {
  const sanitized = sanitizeOcrResponse(
    {
      detectedType: 'detail',
      sourceDescription: 'Ảnh sổ đo tay thực địa',
      warnings: ['Kiểm tra lại chỉ trên điểm P9'],
      detailRows: [
        {
          pointName: 'P9',
          stationName: 'M1',
          orientName: 'M0',
          instrumentHeightM: 1.46,
          hzOrientStr: '0°00\'00"',
          hzPointStr: '52°14\'30"',
          vertAngleStr: '-0°20\'15"',
          miaAMm: 1.85, // meters input -> should convert to 1850mm
          miaLMm: 1550,
          miaBMm: 1250,
          kind: 'detail',
          note: 'Góc tường rào',
        },
      ],
    },
    {
      defaultStation: 'M1',
      defaultOrient: 'M0',
      defaultInstrumentHeightM: 1.48,
      defaultVerticalMode: 'Z',
      existingDetailCount: 7,
    }
  );

  assert.equal(sanitized.detectedType, 'detail');
  assert.equal(sanitized.detailRows.length, 1);
  assert.equal(sanitized.detailRows[0].miaAMm, 1850);
  assert.equal(sanitized.detailRows[0].verticalMode, 'V');
  assert.equal(computeCandidateMiaErrorMm(1850, 1550, 1250), 0);

  const built = buildDetailRowsFromCandidates(sanitized.detailRows, {
    miaUnit: 'm',
    instrumentHeightUnit: 'cm',
    outputUnit: 'm',
  });
  assert.equal(built.length, 1);
  assert.equal(built[0].miaA, 1.85);
  assert.equal(built[0].instrumentHeight, 146);
  assert.equal(built[0].vertAngle.deg, '-0');
  assert.equal(built[0].vertAngle.min, '20');
  assert.equal(built[0].vertAngle.sec, '15');
});

test('buildControlPointsFromCandidates and buildTraverseRowsFromCandidates filter unselected rows', () => {
  const cps = buildControlPointsFromCandidates([
    { selected: true, name: 'M3', x: 1120.5, y: 2050.25, h: 11.4, note: 'Mốc mới' },
    { selected: false, name: 'M4', x: 1150, y: 2080, h: 12.1, note: 'Bỏ qua' },
  ]);
  assert.equal(cps.length, 1);
  assert.equal(cps[0].name, 'M3');

  const trs = buildTraverseRowsFromCandidates(
    [
      {
        selected: true,
        stationName: 'T4',
        targetName: 'T5',
        instrumentHeightM: 1.5,
        hzBackLStr: '0°00\'00"',
        hzForeLStr: '91°10\'20"',
        hzBackRStr: '180°00\'10"',
        hzForeRStr: '271°10\'25"',
        vertLStr: '89°30\'00"',
        vertRStr: '270°30\'00"',
        miaAMm: 1700,
        miaLMm: 1500,
        miaBMm: 1300,
      },
    ],
    'mm'
  );
  assert.equal(trs.length, 1);
  assert.equal(trs[0].miaA, 1700);
  assert.equal(trs[0].hzForeL.deg, '91');
});
