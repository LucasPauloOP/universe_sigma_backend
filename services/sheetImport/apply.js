// Grava o plano no banco, em lote (poucas consultas): roda numa transação com tempo limite.
const prisma = require('../../config/database');
const { randomUUID } = require('crypto');
const { seedDefaultDivisions, replaceEntries } = require('../divisionService');

const bulk = (client, model, data, extra = {}) =>
  data.length ? client[model].createMany({ data, ...extra }) : null;

async function applyPlan(plan, universeId, client) {
  const { ops, options } = plan;
  const done = {
    wrestlersCreated: 0,
    teamsCreated: 0,
    linksAdded: 0,
    linksRemoved: 0,
    activated: 0,
    deactivated: 0,
    divisionsFilled: 0,
    divisionsMissing: [],
    plesCreated: 0,
    plesUpdated: 0,
    plesDeactivated: 0,
  };

  // divisões padrão que ainda não existem (a fila é gravada nelas)
  if (ops.divisions.length) await seedDefaultDivisions(universeId, client);

  await bulk(
    client,
    'wrestler',
    ops.newWrestlers.map((w) => ({
      id: w.id,
      universeId,
      name: w.name,
      gender: w.gender,
      contractType: w.contractType,
      isActive: true,
      notes: 'Criado pela importação da planilha',
    })),
  );
  done.wrestlersCreated = ops.newWrestlers.length;

  await bulk(
    client,
    'team',
    ops.newTeams.map((t) => ({
      id: t.id,
      universeId,
      name: t.name,
      kind: 'TAG_TEAM',
    })),
  );
  await bulk(
    client,
    'teamMember',
    ops.newTeams.flatMap((t) =>
      t.memberIds.map((wrestlerId) => ({ teamId: t.id, wrestlerId })),
    ),
    { skipDuplicates: true },
  );
  done.teamsCreated = ops.newTeams.length;

  if (ops.links.remove.length) {
    const r = await client.wrestlerBrand.deleteMany({
      where: { OR: ops.links.remove },
    });
    done.linksRemoved = r.count;
  }
  await bulk(client, 'wrestlerBrand', ops.links.add, { skipDuplicates: true });
  done.linksAdded = ops.links.add.length;

  if (ops.activate.length) {
    done.activated = (
      await client.wrestler.updateMany({
        where: { id: { in: ops.activate } },
        data: { isActive: true },
      })
    ).count;
  }
  if (ops.deactivate.length) {
    done.deactivated = (
      await client.wrestler.updateMany({
        where: { id: { in: ops.deactivate } },
        data: { isActive: false },
      })
    ).count;
  }

  if (ops.divisions.length) {
    const existing = await client.cardDivision.findMany({
      where: { universeId },
      include: { brands: { select: { brandId: true } } },
    });
    for (const d of ops.divisions) {
      const target = existing.find(
        (x) =>
          x.name === d.name &&
          (d.shared || x.brands.some((b) => b.brandId === d.brandId)),
      );
      if (!target) {
        done.divisionsMissing.push(d.name);
        continue;
      }
      await replaceEntries(
        target.id,
        d.keys.map((k) =>
          k.startsWith('w:')
            ? { wrestlerId: k.slice(2) }
            : { teamId: k.slice(2) },
        ),
        client,
      );
      done.divisionsFilled++;
    }
  }

  if (options.importPles) {
    await bulk(
      client,
      'show',
      ops.ples.create.map((p) => ({
        id: randomUUID(),
        universeId,
        name: p.name,
        kind: p.kind,
        ppvMonth: p.ppvMonth,
        ppvWeek: p.ppvWeek,
        isActive: true,
      })),
    );
    done.plesCreated = ops.ples.create.length;
    for (const u of ops.ples.update) {
      await client.show.update({
        where: { id: u.id },
        data: { ppvMonth: u.to.month, ppvWeek: u.to.week },
      });
    }
    done.plesUpdated = ops.ples.update.length;
    if (options.deactivateUnlistedPles && ops.ples.unlisted.length) {
      const ids = ops.ples.unlisted.map((s) => s.id);
      await client.episode.deleteMany({ where: { showId: { in: ids } } });
      await client.show.updateMany({
        where: { id: { in: ids } },
        data: { isActive: false },
      });
      done.plesDeactivated = ids.length;
    }
  }
  return done;
}

async function loadSnapshot(universeId, client = prisma) {
  const [brands, wrestlers, teams, shows] = await Promise.all([
    client.brand.findMany({
      where: { universeId },
      select: { id: true, name: true, isActive: true },
    }),
    client.wrestler.findMany({
      where: { universeId },
      select: {
        id: true,
        name: true,
        gender: true,
        isActive: true,
        brands: { select: { brandId: true } },
      },
    }),
    client.team.findMany({
      where: { universeId },
      select: {
        id: true,
        name: true,
        members: { select: { wrestlerId: true } },
      },
    }),
    client.show.findMany({
      where: { universeId },
      select: {
        id: true,
        name: true,
        kind: true,
        ppvMonth: true,
        ppvWeek: true,
        isActive: true,
      },
    }),
  ]);
  return {
    brands,
    wrestlers: wrestlers.map((w) => ({
      ...w,
      brandIds: w.brands.map((b) => b.brandId),
    })),
    teams: teams.map((t) => ({
      ...t,
      memberIds: t.members.map((m) => m.wrestlerId),
    })),
    shows,
  };
}

module.exports = { applyPlan, loadSnapshot };
