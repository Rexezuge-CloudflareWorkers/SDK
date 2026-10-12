import { describe, expect, it } from 'vitest';
import {
  btnBlueStyle,
  btnGreenStyle,
  btnSmallStyle,
  buttonColors,
  cardStyle,
  inputStyle,
  paginationBtnStyle,
  tableCardStyle,
  tdStyle,
  theme,
  thStyle,
} from './theme.ts';

describe('theme', () => {
  it('exposes the palette as one token group', () => {
    expect(theme).toMatchObject({
      cardBg: '#1e2433',
      inputBg: '#252d3d',
      border: '#374151',
      blue: '#2563eb',
      blueHover: '#1d4ed8',
      green: '#16a34a',
      greenHover: '#15803d',
      red: '#dc2626',
      redHover: '#b91c1c',
      spinnerBlue: '#60a5fa',
    });
  });

  it('pairs each solid action colour with its hover colour', () => {
    expect(buttonColors).toEqual({
      blue: { bg: theme.blue, hover: theme.blueHover },
      green: { bg: theme.green, hover: theme.greenHover },
      red: { bg: theme.red, hover: theme.redHover },
    });
  });

  it('exposes the style objects a bespoke surface composes', () => {
    expect(cardStyle).toMatchObject({ background: theme.cardBg, borderRadius: '12px', padding: '24px' });
    expect(inputStyle).toMatchObject({ background: theme.inputBg, border: `1px solid ${theme.border}` });
    expect(tableCardStyle).toMatchObject({ background: theme.cardBg, overflow: 'hidden' });
    expect(thStyle).toMatchObject({ textTransform: 'uppercase', background: theme.inputBg });
    expect(tdStyle).toMatchObject({ padding: '12px' });
    expect(paginationBtnStyle).toMatchObject({ padding: '6px 12px' });
    expect(btnBlueStyle).toMatchObject({ background: theme.blue, borderRadius: '8px' });
    expect(btnGreenStyle).toMatchObject({ background: theme.green });
    expect(btnSmallStyle).toMatchObject({ padding: '6px 12px', fontSize: '13px' });
  });
});
