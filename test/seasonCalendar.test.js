const { monthsFrom } = require('../services/seasonCalendar');

describe('monthsFrom', () => {
  it('sem início ou maio: temporada inteira', () => {
    expect(monthsFrom(null)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4]);
    expect(monthsFrom(5)).toHaveLength(12);
  });
  it('começando em agosto vai até abril', () => {
    expect(monthsFrom(8)).toEqual([8, 9, 10, 11, 12, 1, 2, 3, 4]);
  });
  it('começando em janeiro: janeiro a abril', () => {
    expect(monthsFrom(1)).toEqual([1, 2, 3, 4]);
  });
});
