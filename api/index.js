// Função serverless da Vercel: todas as rotas dinâmicas passam por aqui (veja vercel.json).
// Os arquivos de public/ são servidos direto pela CDN.
export { handler as default } from '../src/app.js';
