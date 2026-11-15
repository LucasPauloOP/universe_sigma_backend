Projeto backend de um crud para suportar o universe dos jogos da wwe o projeto foi iniciado 29/03/2026 entao para jogos anteriores ou futuros pode estar desatualizado ou com erro
# Universe Sigma Backend

Este é o projeto de backend responsável por gerenciar o sistema de CRUD para suporte ao modo Universe dos jogos da franquia WWE.

## 📌 Sobre o Projeto

O objetivo deste sistema é fornecer uma API para organização e persistência de dados relacionados a shows, lutadores, títulos e rivalidades, auxiliando na gestão personalizada do modo Universe.

> **Nota:** O projeto foi iniciado em **29/03/2026**. Devido às mudanças frequentes nas mecânicas e elencos dos jogos da WWE, a compatibilidade com versões muito antigas ou lançamentos futuros pode exigir ajustes.

## 🚀 Funcionalidades (Em Desenvolvimento)

- [ ] Gerenciamento de Superstars (CRUD completo).
- [ ] Controle de Títulos e Histórico de Campeões.
- [ ] Agendamento e organização de Shows/PPVs.
- [ ] Registro de Rivalidades e Facções.

## 🛠️ Tecnologias

- Node.js + Express 5
- PostgreSQL + Prisma ORM
- JWT (autenticação) e Joi (validação)

## ⚙️ Como Executar

1. `npm install` (já roda `prisma generate`)
2. Copie `template.env` para `development.env` e preencha `DATABASE_URL` e `JWT_SECRET`
3. `npx prisma migrate dev` (cria as tabelas)
4. `npm run dev`

Testes: configure `DATABASE_URL` em `test.env` (use um banco separado) e rode `npm run test:ci`.

## 🔌 API (resumo)

Tudo em `/api`. Exceto `/auth/register` e `/auth/login`, envie `Authorization: Bearer <token>`.

| Rota | O que faz |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Conta (o cadastro já cria um universe padrão) |
| `GET/POST /universes` | Lista / cria universes (`useTemplate: false` cria vazio) |
| `POST /universes/:id/reset` | Volta ao padrão (body `{ "confirm": true }`) — apaga tudo |
| `/universes/:id/{brands,wrestlers,teams,titles,title-reigns,seasons,shows,episodes,segments,match-types,alignments,divisions,weight-classes,rivalries,tournaments,tournament-entrants,tournament-matches}` | CRUD completo (GET, POST, GET/:id, PUT/PATCH/:id, DELETE/:id) |
| `POST .../episodes/generate` | Cria os episódios que faltam (semanas/meses) de uma temporada |
| `GET .../episodes/:id/card` | Card do episódio, ordenado |
| `POST .../episodes/:id/segments` | Monta o card inteiro de uma vez (`{ segments: [...], replace?: true }`), na ordem do array |
| `POST .../segments` (com `position`) | Insere no card na posição pedida; os demais descem. Sem `position`, vai para o fim |
| `PUT .../segments/:id` (com `position`) | Move o segmento para outra posição; `DELETE` fecha o buraco |
| `PUT .../episodes/:id/segments/order` | Reordena o card inteiro (`{ order: [ids] }`) |

Cada episódio (show ou PLE) tem **no máximo um main event** (`isMainEvent`): marcar um novo tira o posto do anterior. O banco também garante isso com um índice único parcial.
| `GET .../tournaments/:id/bracket`, `POST .../generate-bracket` | Chave do torneio / gerar chave |
| `GET .../wrestlers/:id/record`, `GET .../titles/:id/history` | Estatísticas calculadas |

Listagens aceitam `?limit=&offset=` e filtros (ex.: `/wrestlers?gender=W&isInjured=false`, `/episodes?month=1&showId=...`).
