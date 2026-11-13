const path = require('path');
const dotenv = require('dotenv');

// Cada ambiente tem o seu arquivo completo: development.env, homologation.env,
// production.env (e test.env nos testes), escolhido por NODE_ENV. Variáveis
// já definidas no ambiente (host, CI) têm prioridade sobre o arquivo.
// O `.env.local` gerado pela CLI da Neon NÃO é lido de propósito, para que um
// ambiente nunca caia por engano no banco de outro.
module.exports = () => {
  const ambiente = process.env.NODE_ENV || 'development';
  const arquivoEnv = `${ambiente}.env`;
  const resultado = dotenv.config({
    path: path.resolve(__dirname, '../', arquivoEnv),
    quiet: true,
  });

  if (resultado.error) {
    console.error(
      `❌ Erro: Não foi possível encontrar o arquivo ${arquivoEnv}`,
    );
    return undefined;
  }
  return resultado.parsed;
};
