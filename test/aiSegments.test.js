const ai = require('../services/aiSegments');

const wr = (id, name, brandId = 'b1') => ({
  id,
  name,
  gender: 'M',
  overall: 80,
  alignment: { name: 'Face' },
  brands: [{ brandId }],
});
const universe = {
  wrestlers: [
    wr('00000000-0000-4000-8000-000000000001', 'Ana'),
    wr('00000000-0000-4000-8000-000000000002', 'Bob'),
    wr('00000000-0000-4000-8000-000000000003', 'Cid'),
    wr('00000000-0000-4000-8000-000000000004', 'Dan'),
  ],
  teams: [
    {
      id: 't1',
      name: 'Duo',
      kind: 'TAG_TEAM',
      members: [
        { wrestlerId: '00000000-0000-4000-8000-000000000003' },
        { wrestlerId: '00000000-0000-4000-8000-000000000004' },
      ],
    },
  ],
  divisions: [
    {
      id: '00000000-0000-4000-8000-000000000006',
      name: 'Main Card',
      gender: 'M',
      titleId: '00000000-0000-4000-8000-000000000005',
      brands: [],
      entries: [
        {
          wrestlerId: '00000000-0000-4000-8000-000000000002',
          wrestler: { id: '00000000-0000-4000-8000-000000000002', name: 'Bob' },
        },
      ],
    },
  ],
  titles: [
    {
      id: '00000000-0000-4000-8000-000000000005',
      name: 'Mundial',
      brandId: null,
      isTag: false,
      reigns: [
        {
          holders: [
            {
              wrestlerId: '00000000-0000-4000-8000-000000000001',
              wrestler: { name: 'Ana' },
            },
          ],
        },
      ],
    },
  ],
  matchTypes: [{ id: '00000000-0000-4000-8000-000000000007', name: 'Singles' }],
  rivalries: [
    {
      id: '00000000-0000-4000-8000-000000000008',
      isActive: true,
      members: [
        {
          side: 1,
          wrestlerId: '00000000-0000-4000-8000-000000000001',
          wrestler: { name: 'Ana' },
        },
        {
          side: 2,
          wrestlerId: '00000000-0000-4000-8000-000000000002',
          wrestler: { name: 'Bob' },
        },
      ],
      _count: { segments: 3 },
    },
  ],
  recent: [],
};
const episode = {
  id: 'e1',
  month: 5,
  week: 1,
  show: { name: 'RAW', brandId: 'b1', kind: 'WEEKLY' },
};
const ctx = () => ai.forEpisode(universe, episode);

describe('buildPrompt', () => {
  it('usa referências curtas e inclui ranking, campeão e rivalidades', () => {
    const p = ai.buildPrompt(ctx(), { count: 4, guidance: 'foco em Ana' });
    expect(p).toContain('W1 | Ana');
    expect(p).toContain('campeão: W1 Ana');
    expect(p).toContain('1.W2 Bob');
    expect(p).toContain('R1 | W1 x W2 | 3 lutas');
    expect(p).toContain('exatamente 4 segmentos');
    expect(p).toContain('foco em Ana');
    expect(p).not.toContain('00000000-0000-4000-8000-000000000001');
  });
  it('lutadores já escalados não aparecem', () => {
    const c = ai.forEpisode(
      universe,
      episode,
      new Set(['00000000-0000-4000-8000-000000000001']),
    );
    expect(ai.buildPrompt(c)).not.toContain('| Ana |');
  });
});

describe('normalize', () => {
  const match = (over = {}) => ({
    type: 'MATCH',
    matchType: 'M1',
    stakes: 'NONE',
    isMainEvent: false,
    sides: [{ wrestlers: ['W1'] }, { wrestlers: ['W2'] }],
    ...over,
  });

  it('traduz referências para ids e força isDone=false', () => {
    const { segments, warnings } = ai.normalize(
      {
        segments: [match({ title: 'T1', division: 'D1', stakes: 'CONTENDER' })],
      },
      ctx(),
    );
    expect(warnings).toEqual([]);
    expect(segments[0]).toMatchObject({
      type: 'MATCH',
      matchTypeId: '00000000-0000-4000-8000-000000000007',
      titleId: '00000000-0000-4000-8000-000000000005',
      cardDivisionId: '00000000-0000-4000-8000-000000000006',
      stakes: 'CONTENDER',
      isDone: false,
      isMainEvent: true,
    });
    expect(segments[0].participants).toEqual([
      {
        wrestlerId: '00000000-0000-4000-8000-000000000001',
        side: 1,
        isWinner: false,
      },
      {
        wrestlerId: '00000000-0000-4000-8000-000000000002',
        side: 2,
        isWinner: false,
      },
    ]);
  });

  it('descarta lutadores inventados e lutas sem dois lados', () => {
    const { segments, warnings } = ai.normalize(
      {
        segments: [
          match({ sides: [{ wrestlers: ['W1'] }, { wrestlers: ['W99'] }] }),
        ],
      },
      ctx(),
    );
    expect(segments).toEqual([]);
    expect(warnings.join()).toMatch(/W99/);
  });

  it('não repete lutador no episódio', () => {
    const { segments } = ai.normalize(
      {
        segments: [
          match(),
          match({ sides: [{ wrestlers: ['W1'] }, { wrestlers: ['W3'] }] }),
        ],
      },
      ctx(),
    );
    expect(segments).toHaveLength(1);
  });

  it('só um main event (o primeiro marcado) ', () => {
    const { segments } = ai.normalize(
      {
        segments: [
          match({ isMainEvent: true }),
          match({
            isMainEvent: true,
            sides: [{ wrestlers: ['W3'] }, { wrestlers: ['W4'] }],
          }),
        ],
      },
      ctx(),
    );
    expect(segments.map((s) => s.isMainEvent)).toEqual([true, false]);
  });

  it('sem main event quando não pedido', () => {
    const { segments } = ai.normalize(
      { segments: [match({ isMainEvent: true })] },
      ctx(),
      {
        includeMainEvent: false,
      },
    );
    expect(segments[0].isMainEvent).toBe(false);
  });

  it('começar e encerrar juntos: fica só "começa"; encerrar exige rivalidade ativa', () => {
    const both = ai.normalize(
      {
        segments: [
          match({ startsRivalry: true, endsRivalry: true, rivalry: 'R1' }),
        ],
      },
      ctx(),
    );
    expect(both.segments[0]).toMatchObject({
      startsRivalry: true,
      endsRivalry: false,
    });
    const bad = ai.normalize(
      { segments: [match({ endsRivalry: true, rivalry: 'R9' })] },
      ctx(),
    );
    expect(bad.segments[0].endsRivalry).toBe(false);
    const ok = ai.normalize(
      { segments: [match({ endsRivalry: true, rivalry: 'R1' })] },
      ctx(),
    );
    expect(ok.segments[0]).toMatchObject({
      endsRivalry: true,
      rivalryId: '00000000-0000-4000-8000-000000000008',
    });
  });

  it('rivalidade já encerrada no período não encerra de novo', () => {
    const { segments } = ai.normalize(
      { segments: [match({ endsRivalry: true, rivalry: 'R1' })] },
      ctx(),
      { endedRivalries: new Set(['00000000-0000-4000-8000-000000000008']) },
    );
    expect(segments[0].endsRivalry).toBe(false);
  });

  it('promo não tem título, stakes nem rivalidade', () => {
    const { segments } = ai.normalize(
      {
        segments: [
          {
            type: 'PROMO',
            title: 'T1',
            stakes: 'RANKING',
            startsRivalry: true,
            isMainEvent: true,
            sides: [{ wrestlers: ['W1'] }],
          },
        ],
      },
      ctx(),
      { includeMainEvent: false },
    );
    expect(segments[0]).toMatchObject({
      type: 'PROMO',
      stakes: 'NONE',
      startsRivalry: false,
    });
    expect(segments[0].titleId).toBeUndefined();
  });

  it('stakes sem divisão viram NONE; respeita o limite de segmentos', () => {
    const { segments, warnings } = ai.normalize(
      {
        segments: [
          match({ stakes: 'RANKING' }),
          match({ sides: [{ wrestlers: ['W3'] }, { wrestlers: ['W4'] }] }),
        ],
      },
      ctx(),
      { count: 1 },
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].stakes).toBe('NONE');
    expect(warnings.join()).toMatch(/mantidos os 1/);
  });
});

describe('callGemini', () => {
  const OLD = process.env.GEMINI_API_KEY;
  afterEach(() => {
    process.env.GEMINI_API_KEY = OLD;
    delete process.env.GEMINI_MODEL;
  });
  const reply = (status, body) => ({
    status,
    ok: status < 400,
    json: async () => body,
  });

  it('sem chave: 503', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(ai.callGemini('x')).rejects.toMatchObject({ statusCode: 503 });
  });

  it('interpreta o JSON da resposta', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchImpl = jest.fn().mockResolvedValue(
      reply(200, {
        candidates: [{ content: { parts: [{ text: '{"segments":[]}' }] } }],
      }),
    );
    await expect(ai.callGemini('x', { fetchImpl })).resolves.toEqual({
      segments: [],
    });
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('k');
  });

  it('429: tenta os modelos em rodadas e depois desiste com mensagem clara', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'a,b';
    const sleepImpl = jest.fn().mockResolvedValue();
    const fetchImpl = jest.fn().mockResolvedValue(reply(429, {}));
    try {
      await expect(
        ai.callGemini('x', { fetchImpl, sleepImpl }),
      ).rejects.toMatchObject({ statusCode: 429 });
    } finally {
      delete process.env.GEMINI_MODEL;
    }
    expect(fetchImpl).toHaveBeenCalledTimes(6); // 2 modelos x 3 rodadas
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });

  it('tempo esgotado ou 503: passa para o próximo modelo na hora', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'lento,ocupado,bom';
    const sleepImpl = jest.fn().mockResolvedValue();
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('TimeoutError'))
      .mockResolvedValueOnce(reply(503, {}))
      .mockResolvedValueOnce(
        reply(200, {
          candidates: [{ content: { parts: [{ text: '{"segments":[]}' }] } }],
        }),
      );
    try {
      await expect(
        ai.callGemini('x', { fetchImpl, sleepImpl }),
      ).resolves.toEqual({ segments: [] });
    } finally {
      delete process.env.GEMINI_MODEL;
    }
    expect(fetchImpl.mock.calls[2][0]).toContain('/bom:');
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it('todos os modelos 404: erro pedindo para ajustar GEMINI_MODEL', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'a,b';
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        reply(404, { error: { message: 'no longer available' } }),
      );
    try {
      await expect(ai.callGemini('x', { fetchImpl })).rejects.toMatchObject({
        statusCode: 502,
        message: expect.stringMatching(/GEMINI_MODEL.*no longer available/),
      });
    } finally {
      delete process.env.GEMINI_MODEL;
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('404: tenta o próximo modelo da lista', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'velho, novo';
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(reply(404, {}))
      .mockResolvedValueOnce(
        reply(200, {
          candidates: [{ content: { parts: [{ text: '{"segments":[]}' }] } }],
        }),
      );
    try {
      await expect(ai.callGemini('x', { fetchImpl })).resolves.toEqual({
        segments: [],
      });
    } finally {
      delete process.env.GEMINI_MODEL;
    }
    expect(fetchImpl.mock.calls[0][0]).toContain('/velho:');
    expect(fetchImpl.mock.calls[1][0]).toContain('/novo:');
  });

  it('401: mostra o motivo do Google e a dica da chave', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        reply(401, { error: { message: 'API keys are not supported' } }),
      );
    await expect(ai.callGemini('x', { fetchImpl })).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringMatching(/not supported.*sem aspas/),
    });
  });

  it('resposta que não é JSON: 502', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'a';
    const sleepImpl = jest.fn().mockResolvedValue();
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        reply(200, { candidates: [{ content: { parts: [{ text: 'oi' }] } }] }),
      );
    await expect(
      ai.callGemini('x', { fetchImpl, sleepImpl }),
    ).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});
