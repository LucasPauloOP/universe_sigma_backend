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
