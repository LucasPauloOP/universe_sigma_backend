process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://u:p@localhost/db';
const {
  episodeDate,
  episodeDayOffset,
  gameDaysBetween,
} = require('../services/timeline');
const { missingNights } = require('../services/seasonCalendar');

const season = { number: 1, startDate: null };
const raw = { kind: 'WEEKLY', weekday: 1 };
const nxt = { kind: 'WEEKLY', weekday: 2 };
const smack = { kind: 'WEEKLY', weekday: 5 };
const ple = { kind: 'PLE', weekday: null };
const iso = (d) => d.toISOString().slice(0, 10);
const at = (month, week, show, extra = {}) =>
  episodeDate({ month, week, show, ...extra }, season);

describe('calendário do jogo: todo mês tem 4 semanas (segunda a domingo)', () => {
  it('usa a data do episódio quando preenchida à mão', () => {
    expect(
      iso(
        episodeDate(
          { airDate: '2026-08-12T00:00:00Z', month: 8, week: 1, show: raw },
          season,
        ),
      ),
    ).toBe('2026-08-12');
  });

  it('semana N ocupa os dias 7(N-1)+1 a 7N; RAW é a segunda, SmackDown a sexta, PLE o sábado', () => {
    expect(iso(at(8, 1, raw))).toBe('2026-08-01');
    expect(iso(at(8, 1, nxt))).toBe('2026-08-02');
    expect(iso(at(8, 1, smack))).toBe('2026-08-05');
    expect(iso(at(8, 1, ple))).toBe('2026-08-06');
    expect(iso(at(8, 2, raw))).toBe('2026-08-08');
    expect(iso(at(8, 4, ple))).toBe('2026-08-27');
  });

  it('a ordem de jogo e as datas sempre batem (RAW < SmackDown < PLE na mesma semana)', () => {
    for (let month = 1; month <= 12; month++) {
      for (let week = 1; week <= 4; week++) {
        const r = at(month, week, raw);
        const s = at(month, week, smack);
        const p = at(month, week, ple);
        expect(r < s && s < p).toBe(true);
        if (week < 4) expect(p < at(month, week + 1, raw)).toBe(true);
      }
    }
  });

  it('nunca passa do dia 28 nem muda de mês', () => {
    for (let month = 1; month <= 12; month++) {
      const last = at(month, 4, { kind: 'WEEKLY', weekday: 0 }, { night: 2 });
      expect(last.getUTCDate()).toBeLessThanOrEqual(28);
      expect(last.getUTCMonth() + 1).toBe(month);
    }
  });

  it('semana vazia = 4 e semana 5 vira 4', () => {
    expect(iso(at(8, null, raw))).toBe(iso(at(8, 4, raw)));
    expect(iso(at(8, 5, raw))).toBe(iso(at(8, 4, raw)));
  });

  it('sem dia cadastrado: semanal = segunda, PLE = sábado', () => {
    expect(episodeDayOffset({ show: { kind: 'WEEKLY', weekday: null } })).toBe(
      0,
    );
    expect(episodeDayOffset({ show: { kind: 'PLE', weekday: null } })).toBe(5);
  });

  it('maio a dezembro no ano da temporada, janeiro a abril no seguinte', () => {
    expect(iso(at(5, 1, raw))).toBe('2026-05-01');
    expect(iso(at(1, 1, raw))).toBe('2027-01-01');
    expect(
      iso(episodeDate({ month: 5, week: 1, show: raw }, { number: 2 })),
    ).toBe('2027-05-01');
  });

  it('Noite 2 de um PLE é o domingo, no dia seguinte à Noite 1', () => {
    const n1 = at(4, 3, ple, { night: 1 });
    const n2 = at(4, 3, ple, { night: 2 });
    expect(n2.getTime() - n1.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('gameDaysBetween (mês = 28 dias)', () => {
  it('uma semana depois = 7 dias, em qualquer mês', () => {
    expect(gameDaysBetween(at(8, 1, raw), at(8, 2, raw))).toBe(7);
    expect(gameDaysBetween(at(8, 4, raw), at(9, 1, raw))).toBe(7); // vira o mês: ainda 7
  });

  it('um mês inteiro = 28 dias e uma temporada (12 meses) = 336', () => {
    expect(gameDaysBetween(at(5, 1, raw), at(6, 1, raw))).toBe(28);
    expect(gameDaysBetween(at(5, 1, raw), at(5, 1, raw, {}))).toBe(0);
    expect(
      gameDaysBetween(
        at(5, 1, raw),
        episodeDate({ month: 5, week: 1, show: raw }, { number: 2 }),
      ),
    ).toBe(336);
  });

  it('nunca é negativo', () => {
    expect(gameDaysBetween(at(9, 1, raw), at(8, 1, raw))).toBe(0);
  });
});

describe('missingNights', () => {
  it('PLE de uma noite com episódio existente: nada a criar', () => {
    expect(missingNights(1, [null])).toEqual([]);
    expect(missingNights(1, [])).toEqual([1]);
  });
  it('passou a ter duas noites: o existente (sem noite) é a 1 e falta a 2', () => {
    expect(missingNights(2, [null])).toEqual([2]);
    expect(missingNights(2, [1, 2])).toEqual([]);
    expect(missingNights(2, [])).toEqual([1, 2]);
  });
});
