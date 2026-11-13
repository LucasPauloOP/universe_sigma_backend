const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const app = require('../app');
const prisma = require('../config/database');

const stamp = Date.now();
let tokenA;
let tokenB;
let uniA;
const authA = () => ({ Authorization: `Bearer ${tokenA}` });
const base = () => `/api/universes/${uniA}`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `t${stamp}` } } });
  await prisma.$disconnect();
});

describe('Auth', () => {
  it('registra usuário e já cria o universe padrão', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `a.t${stamp}@x.com`, password: '12345678' });
    expect(res.statusCode).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    tokenA = res.body.token;
    uniA = res.body.universe.id;

    const b = await request(app)
      .post('/api/auth/register')
      .send({ email: `b.t${stamp}@x.com`, password: '12345678' });
    tokenB = b.body.token;
  });

  it('rejeita e-mail duplicado, senha curta e login errado', async () => {
    const dup = await request(app)
      .post('/api/auth/register')
      .send({ email: `a.t${stamp}@x.com`, password: '12345678' });
    expect(dup.statusCode).toBe(409);
    const short = await request(app)
      .post('/api/auth/register')
      .send({ email: `c.t${stamp}@x.com`, password: '123' });
    expect(short.statusCode).toBe(422);
    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: `a.t${stamp}@x.com`, password: 'errada123' });
    expect(bad.statusCode).toBe(401);
  });

  it('exige token', async () => {
    expect((await request(app).get('/api/universes')).statusCode).toBe(401);
  });
});

describe('Isolamento entre usuários', () => {
  it('usuário B não acessa o universe de A', async () => {
    const res = await request(app)
      .get(`${base()}/wrestlers`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.statusCode).toBe(404);
  });
});

describe('Universe padrão', () => {
  it('tem brands, shows, títulos e o calendário de episódios', async () => {
    const brands = await request(app).get(`${base()}/brands`).set(authA());
    expect(brands.body.total).toBe(5);
    const eps = await request(app)
      .get(`${base()}/episodes?limit=500&month=1`)
      .set(authA());
    // 4 semanais x 4 semanas + Royal Rumble + 2 especiais de janeiro
    expect(eps.body.total).toBe(19);
  });
});

describe('Roster, card e torneio', () => {
  const ids = {};

  it('cria lutadores com brands e imagem', async () => {
    const brands = (await request(app).get(`${base()}/brands`).set(authA()))
      .body.data;
    ids.raw = brands.find((b) => b.name === 'RAW').id;
    for (const name of ['Cena', 'Orton', 'Rhodes', 'Punk']) {
      const res = await request(app)
        .post(`${base()}/wrestlers`)
        .set(authA())
        .send({
          name,
          gender: 'M',
          brandIds: [ids.raw],
          imageUrl: 'https://img.test/a.png',
        });
      expect(res.statusCode).toBe(201);
      ids[name] = res.body.id;
      expect(res.body.brands).toHaveLength(1);
    }
  });

  it('monta o card: luta valendo título + promo, na ordem', async () => {
    const ep = (
      await request(app)
        .get(
          `${base()}/episodes?showId=${(await request(app).get(`${base()}/shows`).set(authA())).body.data.find((s) => s.name === 'RAW').id}&month=1&week=1`,
        )
        .set(authA())
    ).body.data[0];
    ids.ep = ep.id;
    const mt = (
      await request(app).get(`${base()}/match-types`).set(authA())
    ).body.data.find((m) => m.name === 'Singles');
    const title = (await request(app).get(`${base()}/titles`).set(authA())).body
      .data[0];

    const promo = await request(app)
      .post(`${base()}/segments`)
      .set(authA())
      .send({ episodeId: ep.id, type: 'PROMO', notes: 'Cena abre o show' });
    expect(promo.statusCode).toBe(201);
    expect(promo.body.position).toBe(1);

    const match = await request(app)
      .post(`${base()}/segments`)
      .set(authA())
      .send({
        episodeId: ep.id,
        type: 'MATCH',
        matchTypeId: mt.id,
        titleId: title.id,
        isMainEvent: true,
        finishType: 'PINFALL',
        isDone: true,
        notes: 'Luta do ano',
        participants: [
          { wrestlerId: ids.Cena, side: 1, isWinner: true },
          { wrestlerId: ids.Orton, side: 2 },
        ],
      });
    expect(match.statusCode).toBe(201);
    expect(match.body.position).toBe(2);
    ids.match = match.body.id;

    const card = await request(app)
      .get(`${base()}/episodes/${ep.id}/card`)
      .set(authA());
    expect(card.body.segments.map((s) => s.type)).toEqual(['PROMO', 'MATCH']);

    const re = await request(app)
      .put(`${base()}/episodes/${ep.id}/segments/order`)
      .set(authA())
      .send({ order: [match.body.id, promo.body.id] });
    expect(re.statusCode).toBe(200);
    const card2 = await request(app)
      .get(`${base()}/episodes/${ep.id}/card`)
      .set(authA());
    expect(card2.body.segments[0].type).toBe('MATCH');
  });

  it('calcula o retrospecto', async () => {
    const r = await request(app)
      .get(`${base()}/wrestlers/${ids.Cena}/record`)
      .set(authA());
    expect(r.body).toMatchObject({ wins: 1, losses: 0, matches: 1 });
    const o = await request(app)
      .get(`${base()}/wrestlers/${ids.Orton}/record`)
      .set(authA());
    expect(o.body).toMatchObject({ wins: 0, losses: 1 });
  });

  it('recusa vincular lutador de outro universe', async () => {
    const other = await request(app)
      .post('/api/universes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'B2', useTemplate: false });
    const w = await request(app)
      .post(`/api/universes/${other.body.id}/wrestlers`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Intruso', gender: 'M' });
    const res = await request(app)
      .post(`${base()}/segments`)
      .set(authA())
      .send({
        episodeId: ids.ep,
        type: 'MATCH',
        participants: [{ wrestlerId: w.body.id }],
      });
    expect(res.statusCode).toBe(400);
  });

  it('torneio de 4 atravessando shows diferentes e avançando o vencedor', async () => {
    const t = await request(app)
      .post(`${base()}/tournaments`)
      .set(authA())
      .send({ name: 'King of the Ring', size: 4 });
    expect(t.statusCode).toBe(201);
    for (const [i, n] of ['Cena', 'Orton', 'Rhodes', 'Punk'].entries()) {
      const e = await request(app)
        .post(`${base()}/tournament-entrants`)
        .set(authA())
        .send({ tournamentId: t.body.id, wrestlerId: ids[n], seed: i + 1 });
      expect(e.statusCode).toBe(201);
    }
    const gen = await request(app)
      .post(`${base()}/tournaments/${t.body.id}/generate-bracket`)
      .set(authA());
    expect(gen.body.created).toBe(3);

    const br = (
      await request(app)
        .get(`${base()}/tournaments/${t.body.id}/bracket`)
        .set(authA())
    ).body;
    const semi1 = br.matches.find((m) => m.round === 1 && m.slot === 1);
    expect(semi1.entrantA.wrestler.name).toBe('Cena');

    // vincula a luta real e declara o vencedor
    const upd = await request(app)
      .put(`${base()}/tournament-matches/${semi1.id}`)
      .set(authA())
      .send({ segmentId: ids.match, winnerId: semi1.entrantAId });
    expect(upd.statusCode).toBe(200);
    const br2 = (
      await request(app)
        .get(`${base()}/tournaments/${t.body.id}/bracket`)
        .set(authA())
    ).body;
    const final = br2.matches.find((m) => m.round === 2);
    expect(final.entrantAId).toBe(semi1.entrantAId);
    expect(
      br2.matches.find((m) => m.id === semi1.id).segment.episode.show.name,
    ).toBe('RAW');
  });
});

describe('Card: ordem livre e main event único', () => {
  const w = {};
  let ep;
  const cardOf = async () =>
    (await request(app).get(`${base()}/episodes/${ep}/card`).set(authA())).body
      .segments;
  const summary = (segs) =>
    segs.map((s) => `${s.position}:${s.notes}${s.isMainEvent ? '*' : ''}`);

  it('monta o card inteiro na ordem do array, com o main event no fim', async () => {
    for (const name of [
      'AJ Styles',
      'Roman Reigns',
      'Carmelo Hayes',
      'John Cena',
      'CM Punk',
    ]) {
      w[name] = (
        await prisma.wrestler.findFirst({ where: { universeId: uniA, name } })
      ).id;
    }
    const title = (await request(app).get(`${base()}/titles`).set(authA())).body
      .data[0];
    const singles = (
      await request(app).get(`${base()}/match-types`).set(authA())
    ).body.data.find((m) => m.name === 'Singles');
    const show = (
      await request(app).get(`${base()}/shows`).set(authA())
    ).body.data.find((s) => s.name === 'SmackDown');
    ep = (
      await request(app)
        .get(`${base()}/episodes?showId=${show.id}&month=2&week=1`)
        .set(authA())
    ).body.data[0].id;

    const res = await request(app)
      .post(`${base()}/episodes/${ep}/segments`)
      .set(authA())
      .send({
        segments: [
          {
            type: 'MATCH',
            matchTypeId: singles.id,
            notes: 'AJ x Roman',
            participants: [
              { wrestlerId: w['AJ Styles'], side: 1 },
              { wrestlerId: w['Roman Reigns'], side: 2 },
            ],
          },
          {
            type: 'PROMO',
            notes: 'Promo Carmelo',
            participants: [{ wrestlerId: w['Carmelo Hayes'] }],
          },
          {
            type: 'MATCH',
            matchTypeId: singles.id,
            titleId: title.id,
            isMainEvent: true,
            notes: 'Cena x Punk',
            participants: [
              { wrestlerId: w['John Cena'], side: 1 },
              { wrestlerId: w['CM Punk'], side: 2 },
            ],
          },
        ],
      });
    expect(res.statusCode).toBe(201);
    expect(summary(await cardOf())).toEqual([
      '1:AJ x Roman',
      '2:Promo Carmelo',
      '3:Cena x Punk*',
    ]);
  });

  it('recusa dois main events no mesmo pedido', async () => {
    const res = await request(app)
      .post(`${base()}/episodes/${ep}/segments`)
      .set(authA())
      .send({
        segments: [
          { type: 'PROMO', isMainEvent: true },
          { type: 'PROMO', isMainEvent: true },
        ],
      });
    expect(res.statusCode).toBe(400);
  });

  it('novo main event tira o posto do anterior (continua só um)', async () => {
    const res = await request(app)
      .post(`${base()}/segments`)
      .set(authA())
      .send({
        episodeId: ep,
        type: 'PROMO',
        notes: 'Novo main',
        isMainEvent: true,
      });
    expect(res.statusCode).toBe(201);
    const segs = await cardOf();
    expect(segs.filter((s) => s.isMainEvent)).toHaveLength(1);
    expect(summary(segs)).toEqual([
      '1:AJ x Roman',
      '2:Promo Carmelo',
      '3:Cena x Punk',
      '4:Novo main*',
    ]);
  });

  it('insere numa posição empurrando os demais', async () => {
    await request(app)
      .post(`${base()}/segments`)
      .set(authA())
      .send({ episodeId: ep, type: 'PROMO', notes: 'Abertura', position: 1 });
    expect(summary(await cardOf())).toEqual([
      '1:Abertura',
      '2:AJ x Roman',
      '3:Promo Carmelo',
      '4:Cena x Punk',
      '5:Novo main*',
    ]);
  });

  it('move um segmento para outra posição', async () => {
    const segs = await cardOf();
    const cena = segs.find((s) => s.notes === 'Cena x Punk');
    const res = await request(app)
      .put(`${base()}/segments/${cena.id}`)
      .set(authA())
      .send({ position: 2, isMainEvent: true });
    expect(res.statusCode).toBe(200);
    const after = await cardOf();
    expect(summary(after)).toEqual([
      '1:Abertura',
      '2:Cena x Punk*',
      '3:AJ x Roman',
      '4:Promo Carmelo',
      '5:Novo main',
    ]);
  });

  it('remover fecha o buraco na numeração', async () => {
    const abertura = (await cardOf()).find((s) => s.notes === 'Abertura');
    expect(
      (
        await request(app)
          .delete(`${base()}/segments/${abertura.id}`)
          .set(authA())
      ).statusCode,
    ).toBe(204);
    expect(summary(await cardOf())).toEqual([
      '1:Cena x Punk*',
      '2:AJ x Roman',
      '3:Promo Carmelo',
      '4:Novo main',
    ]);
  });

  it('o banco também bloqueia dois main events no mesmo episódio', async () => {
    await expect(
      prisma.segment.updateMany({
        where: { episodeId: ep },
        data: { isMainEvent: true },
      }),
    ).rejects.toThrow();
  });
});

describe('Reset do universe', () => {
  it('exige confirmação', async () => {
    const res = await request(app)
      .post(`${base()}/reset`)
      .set(authA())
      .send({});
    expect(res.statusCode).toBe(422);
  });

  it('apaga o que o usuário criou e restaura o padrão', async () => {
    expect(
      (await request(app).get(`${base()}/wrestlers`).set(authA())).body.total,
    ).toBe(291);
    const res = await request(app)
      .post(`${base()}/reset`)
      .set(authA())
      .send({ confirm: true });
    expect(res.statusCode).toBe(200);
    expect(
      (await request(app).get(`${base()}/wrestlers`).set(authA())).body.total,
    ).toBe(287);
    const reigns = await request(app)
      .get(`${base()}/title-reigns?limit=50`)
      .set(authA());
    expect(reigns.body.total).toBe(11);
    expect(
      (await request(app).get(`${base()}/tournaments`).set(authA())).body.total,
    ).toBe(2);
    expect(
      (await request(app).get(`${base()}/brands`).set(authA())).body.total,
    ).toBe(5);
    expect(
      (await request(app).get(`${base()}/segments`).set(authA())).body.total,
    ).toBe(0);
  });
});
