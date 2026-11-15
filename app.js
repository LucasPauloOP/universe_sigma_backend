const express = require('express');
const cors = require('cors');
const loadEnv = require('./utils/loadEnv.config');
const env = loadEnv() || {};
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);

app.use((req, res) =>
  res.status(404).json({ success: false, message: 'Rota não encontrada' }),
);
app.use(errorHandler);

// Só sobe o servidor quando executado direto (npm run dev), não nos testes.
if (require.main === module) {
  const PORT = process.env.PORT || env.PORT || 3000;
  app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}

module.exports = app;
