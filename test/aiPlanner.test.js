jest.mock('../config/database', () => ({ episode: { findMany: jest.fn() } }));
const prisma = require('../config/database');
const ai = require('../services/aiSegments');
const planner = require('../services/aiPlanner');

// semana s do mês m da temporada 1 (maio/2026 em diante)
const ep = (id, month, week, status = 'UNPLANNED') => ({
  id,
  month,
  week,
  status,
  title: id,
  airDate: null,
  show: { name: 'RAW', kind: 'WEEKLY', weekday: 1 },
  season: { number: 1, startDate: null },
});

const fakeResult = (names) => ({
  segments: [
    {
      participants: names.map((n, i) => ({ wrestlerId: n, side: i + 1 })),
      endsRivalry: false,
    },
  ],
  warnings: [],
  ctx: { nameOf: new Map(names.map((n) => [n, n.toUpperCase()])) },
});

afterEach(() => {
  jest.restoreAllMocks();
  planner._jobs.clear();
});

describe('pickEpisodes', () => {
  it('filtra o período e ordena cronologicamente', async () => {
    prisma.episode.findMany.mockResolvedValue([
      ep('c', 7, 1),
      ep('a', 5, 2),
      ep('x', 12, 1),
      ep('b', 6, 4),
    ]);
    const picked = await planner.pickEpisodes('u', {
      from: '2026-05',
      to: '2026-07',
    });
    expect(picked.map((p) => p.e.id)).toEqual(['a', 'b', 'c']);
  });
  it('erra quando vazio, invertido ou grande demais', async () => {
    prisma.episode.findMany.mockResolvedValue([]);
    await expect(
      planner.pickEpisodes('u', { from: '2026-05', to: '2026-07' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      planner.pickEpisodes('u', { from: '2026-07', to: '2026-05' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    prisma.episode.findMany.mockResolvedValue(
      Array.from({ length: 61 }, (_, i) => ep(`e${i}`, 5, 1)),
    );
    await expect(
      planner.pickEpisodes('u', { from: '2026-05', to: '2026-05' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('startRange', () => {
  const deps = { sleepImpl: jest.fn().mockResolvedValue(), intervalMs: 0 };

  it('planeja em ordem, acumulando o histórico entre episódios', async () => {
    prisma.episode.findMany.mockResolvedValue([ep('b', 6, 1), ep('a', 5, 1)]);
    jest.spyOn(ai, 'loadUniverse').mockResolvedValue({});
    const histories = [];
    jest
      .spyOn(ai, 'suggestForEpisode')
      .mockImplementation(async (u, e, o, planned) => {
        histories.push([e.id, planned.history.length]);
        return fakeResult([`w${e.id}`, 'z']);
      });
    const { job, promise } = await planner.startRange(
      'u',
      'usr',
      { from: '2026-05', to: '2026-06' },
      deps,
    );
    await promise;
    expect(histories).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(job).toMatchObject({ status: 'done', total: 2, done: 2 });
    expect(planner.getJob('u', job.id).episodes).toHaveLength(2);
  });

  it('falha de um episódio não derruba o job', async () => {
    prisma.episode.findMany.mockResolvedValue([ep('a', 5, 1), ep('b', 6, 1)]);
    jest.spyOn(ai, 'loadUniverse').mockResolvedValue({});
    jest
      .spyOn(ai, 'suggestForEpisode')
      .mockRejectedValueOnce(
        Object.assign(new Error('elenco'), { statusCode: 400 }),
      )
      .mockResolvedValueOnce(fakeResult(['x', 'y']));
    const { job, promise } = await planner.startRange(
      'u',
      'usr',
      { from: '2026-05', to: '2026-06' },
      deps,
    );
    await promise;
    expect(job.status).toBe('done');
    expect(job.episodes[0].error).toBe('elenco');
    expect(job.episodes[1].segments).toHaveLength(1);
  });

  it('limite da cota (429) interrompe o job com erro', async () => {
    prisma.episode.findMany.mockResolvedValue([ep('a', 5, 1), ep('b', 6, 1)]);
    jest.spyOn(ai, 'loadUniverse').mockResolvedValue({});
    const spy = jest
      .spyOn(ai, 'suggestForEpisode')
      .mockRejectedValue(
        Object.assign(new Error('limite'), { statusCode: 429 }),
      );
    const { job, promise } = await planner.startRange(
      'u',
      'usr',
      { from: '2026-05', to: '2026-06' },
      deps,
    );
    await promise;
    expect(job).toMatchObject({ status: 'error', error: 'limite' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('um job por vez no universe e job de outro universe é 404', async () => {
    prisma.episode.findMany.mockResolvedValue([ep('a', 5, 1)]);
    jest
      .spyOn(ai, 'loadUniverse')
      .mockImplementation(() => new Promise(() => {}));
    const { job } = await planner.startRange(
      'u',
      'usr',
      { from: '2026-05', to: '2026-05' },
      deps,
    );
    await expect(
      planner.startRange('u', 'usr', { from: '2026-05', to: '2026-05' }, deps),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(() => planner.getJob('outro', job.id)).toThrow(/não encontrado/);
  });
});
