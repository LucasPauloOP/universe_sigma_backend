const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const app = require('../app');
const prisma = require('../config/database');

// Testes de integração contra um Neon remoto: criar o universe padrão e apagar
// o usuário levam bem mais que os 5s padrão do Jest.
jest.setTimeout(60000);

const stamp = Date.now();
let tokenA;
let tokenB;
let uniA;
// Elenco do universe padrão (medido antes de qualquer teste criar lutador).
let defaultWrestlers;
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

describe('Refresh token', () => {
  const email = `r.t${stamp}@x.com`;
  const post = (path, body) => request(app).post(`/api/auth${path}`).send(body);
  let first;

  it('login devolve token de acesso e refresh token', async () => {
    const reg = await post('/register', {
      email,
      password: '12345678',
      useTemplate: false,
    });
    expect(reg.statusCode).toBe(201);
    expect(reg.body.refreshToken).toBeDefined();
    const login = await post('/login', { email, password: '12345678' });
    expect(login.body.token).toBeDefined();
    expect(login.body.refreshToken).toBeDefined();
    first = login.body.refreshToken;
  });

  it('refresh rotaciona: devolve novo par e o antigo deixa de valer', async () => {
    const res = await post('/refresh', { refreshToken: first });
    expect(res.statusCode).toBe(200);
    expect(res.body.refreshToken).not.toBe(first);
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.email).toBe(email);

    // reuso do token antigo: 401 e derruba também o novo (possível roubo)
    expect((await post('/refresh', { refreshToken: first })).statusCode).toBe(
      401,
    );
    expect(
      (await post('/refresh', { refreshToken: res.body.refreshToken }))
        .statusCode,
    ).toBe(401);
  });

  it('logout revoga o refresh token', async () => {
    const login = await post('/login', { email, password: '12345678' });
    const rt = login.body.refreshToken;
    expect((await post('/logout', { refreshToken: rt })).statusCode).toBe(204);
    expect((await post('/refresh', { refreshToken: rt })).statusCode).toBe(401);
  });

  it('refresh token expirado ou desconhecido dá 401; corpo inválido dá 422', async () => {
    const login = await post('/login', { email, password: '12345678' });
    await prisma.refreshToken.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await post('/refresh', { refreshToken: login.body.refreshToken }))
        .statusCode,
    ).toBe(401);
    expect(
      (await post('/refresh', { refreshToken: 'x'.repeat(60) })).statusCode,
    ).toBe(401);
    expect((await post('/refresh', {})).statusCode).toBe(422);
  });

  it('redefinir a senha revoga os refresh tokens existentes', async () => {
    const login = await post('/login', { email, password: '12345678' });
    await post('/reset-password', { email, password: 'nova-senha-1' });
    expect(
      (await post('/refresh', { refreshToken: login.body.refreshToken }))
        .statusCode,
    ).toBe(401);
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
    // 3 semanais ativos (AAA nasce inativo) x 4 semanas + Royal Rumble + 2 especiais de janeiro
    expect(eps.body.total).toBe(15);
    defaultWrestlers = (
      await request(app).get(`${base()}/wrestlers`).set(authA())
    ).body.total;
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

    // episódio gerado nasce sem planejamento
    expect(
      (await prisma.episode.findUnique({ where: { id: ep } })).status,
    ).toBe('UNPLANNED');

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

  it('status acompanha o card: com lutas vira planejado, sem nenhuma volta a sem planejamento', async () => {
    const status = async () =>
      (await prisma.episode.findUnique({ where: { id: ep } })).status;
    expect(await status()).toBe('PLANNED'); // card montado acima

    // realizado não é mexido ao remover segmentos
    await prisma.episode.update({
      where: { id: ep },
      data: { status: 'DONE' },
    });
    const [first] = await cardOf();
    await request(app).delete(`${base()}/segments/${first.id}`).set(authA());
    expect(await status()).toBe('DONE');

    // esvaziando o card de um episódio não realizado: sem planejamento
    await prisma.episode.update({
      where: { id: ep },
      data: { status: 'PLANNED' },
    });
    for (const s of await cardOf()) {
      await request(app).delete(`${base()}/segments/${s.id}`).set(authA());
    }
    expect(await status()).toBe('UNPLANNED');

    // primeiro segmento volta a planejar
    await request(app)
      .post(`${base()}/segments`)
      .set(authA())
      .send({ episodeId: ep, type: 'PROMO', notes: 'Volta' });
    expect(await status()).toBe('PLANNED');
  });
});

describe('Rivalidades automáticas', () => {
  const ids = {};
  const api = {
    post: (path, body) =>
      request(app).post(`${base()}/${path}`).set(authA()).send(body),
    put: (path, body) =>
      request(app).put(`${base()}/${path}`).set(authA()).send(body),
    get: (path) => request(app).get(`${base()}/${path}`).set(authA()),
    del: (path) => request(app).delete(`${base()}/${path}`).set(authA()),
  };
  const rivalry = async (id) => (await api.get(`rivalries/${id}`)).body;
  const seg = (extra) => ({
    episodeId: ids.ep,
    type: 'MATCH',
    matchTypeId: ids.singles,
    ...extra,
  });
  const sides = (winnerSide) => [
    { wrestlerId: ids.R1, side: 1, isWinner: winnerSide === 1 },
    { wrestlerId: ids.R3, side: 2, isWinner: winnerSide === 2 },
    { wrestlerId: ids.R4, side: 2, isWinner: winnerSide === 2 },
  ];

  it('prepara lutadores, dupla e episódio', async () => {
    const raw = (await api.get('brands')).body.data.find(
      (b) => b.name === 'RAW',
    ).id;
    for (const name of ['Riv1', 'Riv2', 'Riv3', 'Riv4']) {
      const r = await api.post('wrestlers', {
        name,
        gender: 'M',
        brandIds: [raw],
      });
      expect(r.statusCode).toBe(201);
      ids[name.replace('iv', '')] = r.body.id;
    }
    const team = await api.post('teams', {
      name: 'Dupla Riv',
      kind: 'TAG_TEAM',
      memberIds: [ids.R3, ids.R4],
    });
    expect(team.statusCode).toBe(201);
    ids.team = team.body.id;
    ids.singles = (await api.get('match-types')).body.data.find(
      (m) => m.name === 'Singles',
    ).id;
    const show = (await api.get('shows')).body.data.find(
      (x) => x.name === 'RAW',
    ).id;
    ids.ep = (
      await api.get(`episodes?showId=${show}&month=3&week=1`)
    ).body.data[0].id;
  });

  it('luta que começa uma rivalidade cria a rivalidade com os lados (dupla como unidade)', async () => {
    const res = await api.post(
      'segments',
      seg({ startsRivalry: true, participants: sides() }),
    );
    expect(res.statusCode).toBe(201);
    ids.startSeg = res.body.id;
    expect(res.body.rivalryId).toBeTruthy();
    expect(res.body.rivalry.name).toBe('Riv1 vs Dupla Riv');
    ids.rivalry = res.body.rivalryId;
    const r = await rivalry(ids.rivalry);
    expect(r.isActive).toBe(true);
    expect(r.startDate).toBeTruthy();
    expect(r.members).toHaveLength(2);
    expect(r.members.find((m) => m.side === 1).wrestlerId).toBe(ids.R1);
    expect(r.members.find((m) => m.side === 2).teamId).toBe(ids.team);
    expect(r.segments).toHaveLength(1);
  });

  it('começar rivalidade exige lutadores em dois lados', async () => {
    const res = await api.post(
      'segments',
      seg({
        startsRivalry: true,
        participants: [{ wrestlerId: ids.R1, side: 1 }],
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('reconhece a rivalidade quando a luta montada tem os dois lados', async () => {
    const hit = await api.get(
      `rivalries/match?wrestlerIds=${ids.R1},${ids.R3},${ids.R4}`,
    );
    expect(hit.body.map((r) => r.id)).toContain(ids.rivalry);
    const miss = await api.get(
      `rivalries/match?wrestlerIds=${ids.R1},${ids.R2}`,
    );
    expect(miss.body.map((r) => r.id)).not.toContain(ids.rivalry);
    const partial = await api.get(
      `rivalries/match?wrestlerIds=${ids.R1},${ids.R3}`,
    );
    expect(partial.body.map((r) => r.id)).not.toContain(ids.rivalry); // dupla incompleta
  });

  it('regras: começar e encerrar juntos / encerrar sem rivalidade', async () => {
    const both = await api.post(
      'segments',
      seg({
        startsRivalry: true,
        endsRivalry: true,
        rivalryId: ids.rivalry,
        participants: sides(),
      }),
    );
    expect(both.statusCode).toBe(400);
    const none = await api.post(
      'segments',
      seg({ endsRivalry: true, participants: sides() }),
    );
    expect(none.statusCode).toBe(400);
  });

  it('encerrar só vale ao finalizar com vencedor: o lado vencedor vira ganhador', async () => {
    const planned = await api.post(
      'segments',
      seg({ endsRivalry: true, rivalryId: ids.rivalry, participants: sides() }),
    );
    expect(planned.statusCode).toBe(201);
    ids.endSeg = planned.body.id;
    expect((await rivalry(ids.rivalry)).isActive).toBe(true); // ainda não realizada

    const done = await api.put(`segments/${ids.endSeg}`, {
      isDone: true,
      finishType: 'PINFALL',
      participants: sides(1),
    });
    expect(done.statusCode).toBe(200);
    expect(done.body.rivalryApplied).toBe(true);
    const r = await rivalry(ids.rivalry);
    expect(r.isActive).toBe(false);
    expect(r.winnerSide).toBe(1);
    expect(r.endDate).toBeTruthy();
  });

  it('mudar o vencedor recalcula o ganhador; desfazer o resultado reabre', async () => {
    const swap = await api.put(`segments/${ids.endSeg}`, {
      participants: sides(2),
    });
    expect(swap.statusCode).toBe(200);
    expect((await rivalry(ids.rivalry)).winnerSide).toBe(2);

    await api.put(`segments/${ids.endSeg}`, { isDone: false });
    const r = await rivalry(ids.rivalry);
    expect(r.isActive).toBe(true);
    expect(r.winnerSide).toBeNull();
    expect(r.endDate).toBeNull();
  });

  it('empate encerra sem ganhador; outra luta não pode encerrar a mesma rivalidade', async () => {
    await api.put(`segments/${ids.endSeg}`, {
      isDone: true,
      isDraw: true,
      finishType: null,
      participants: sides(),
    });
    const r = await rivalry(ids.rivalry);
    expect(r.isActive).toBe(false);
    expect(r.winnerSide).toBeNull();
    const other = await api.post(
      'segments',
      seg({ endsRivalry: true, rivalryId: ids.rivalry, participants: sides() }),
    );
    expect(other.statusCode).toBe(409);
  });

  it('apagar a luta que encerrou reabre a rivalidade; apagar a que começou apaga a rivalidade', async () => {
    expect((await api.del(`segments/${ids.endSeg}`)).statusCode).toBe(204);
    expect((await rivalry(ids.rivalry)).isActive).toBe(true);
    expect((await api.del(`segments/${ids.startSeg}`)).statusCode).toBe(204);
    expect((await api.get(`rivalries/${ids.rivalry}`)).statusCode).toBe(404);
  });

  it('desmarcar "começa rivalidade" remove a rivalidade criada (se ninguém mais a usa)', async () => {
    const res = await api.post(
      'segments',
      seg({ startsRivalry: true, participants: sides() }),
    );
    const rid = res.body.rivalryId;
    expect(rid).toBeTruthy();
    const upd = await api.put(`segments/${res.body.id}`, {
      startsRivalry: false,
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.body.rivalryId).toBeNull();
    expect((await api.get(`rivalries/${rid}`)).statusCode).toBe(404);
  });

  it('cadastro manual: lados com lutadores e duplas; mesmo lutador nos dois lados é recusado', async () => {
    const ok = await api.post('rivalries', {
      name: 'Manual',
      sideAWrestlerIds: [ids.R1, ids.R2],
      sideBTeamIds: [ids.team],
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.members).toHaveLength(3);
    expect(ok.body.members.filter((m) => m.side === 2)[0].teamId).toBe(
      ids.team,
    );
    const bad = await api.post('rivalries', {
      name: 'Inválida',
      sideAWrestlerIds: [ids.R1],
      sideBWrestlerIds: [ids.R1],
    });
    expect(bad.statusCode).toBe(400);
    const upd = await api.put(`rivalries/${ok.body.id}`, {
      sideAWrestlerIds: [ids.R2],
      sideBTeamIds: [ids.team],
      winnerSide: 1,
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.body.members).toHaveLength(2);
    expect(upd.body.winnerSide).toBe(1);
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
    ).toBeGreaterThan(defaultWrestlers);
    const res = await request(app)
      .post(`${base()}/reset`)
      .set(authA())
      .send({ confirm: true });
    expect(res.statusCode).toBe(200);
    expect(
      (await request(app).get(`${base()}/wrestlers`).set(authA())).body.total,
    ).toBe(defaultWrestlers);
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
