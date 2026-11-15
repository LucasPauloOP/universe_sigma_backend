const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const { render } = require('../scripts/gen-contracts');

// Falha quando schemas/rotas/modelos mudam sem regenerar docs/ (npm run contracts).
describe('Contratos da API', () => {
  const docs = (f) =>
    fs.readFileSync(path.join(__dirname, '../docs', f), 'utf8');

  it('docs/api-contracts.json e API-CONTRACTS.md estão em dia', () => {
    const { json, md } = render();
    expect(docs('api-contracts.json')).toBe(json);
    expect(docs('API-CONTRACTS.md')).toBe(md);
  });

  it('cobre os recursos e as rotas de auth com refresh', () => {
    const c = JSON.parse(docs('api-contracts.json'));
    expect(Object.keys(c.resources)).toEqual(
      expect.arrayContaining([
        'episodes',
        'segments',
        'tournaments',
        'wrestlers',
      ]),
    );
    const refresh = c.endpoints.find((e) => e.path === '/api/auth/refresh');
    expect(refresh.bodySchema.fields.refreshToken.required).toBe(true);
    expect(c.enums.EpisodeStatus).toEqual(['UNPLANNED', 'PLANNED', 'DONE']);
  });
});
