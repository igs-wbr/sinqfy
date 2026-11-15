// Recursos que cada site liga ou desliga em Configurações (coluna sites.modules, JSON { id: true|false }).
// Sem escolha gravada, vale o padrão: CRM e WhatsApp ligados (como antes), os recursos novos desligados.
// Rota com `module` responde 404 quando o recurso está desligado; o item some do menu (ui.js, NAV).
export const MODULES = {
  crm: { label: 'CRM e contatos', desc: 'Quadro de vendas, contatos com dados cifrados e conversão por coluna.', on: true },
  whatsapp: { label: 'WhatsApp', desc: 'Links rastreáveis, Cloud API oficial e conversas.', on: true },
  video: { label: 'Retenção de vídeo', desc: 'Eventos video_25, video_50, video_75 e video_100 dos vídeos do site, para usar nos funis (evento:video_50).', on: false },
  audiences: { label: 'Públicos para remarketing', desc: 'CSV com e-mail e telefone em SHA-256 de compradores, de quem não pagou e de cada coluna do CRM, para subir como público na Meta.', on: false, needs: 'crm' },
  recovery: { label: 'Recuperação de venda pendente', desc: 'Sequência de mensagens no WhatsApp para quem gerou boleto ou Pix e não pagou. Para sozinha quando o pagamento chega ou a pessoa responde.', on: false, needs: 'whatsapp' },
  bot: { label: 'Robô por palavra-chave', desc: 'Responde no WhatsApp quando a mensagem recebida tem uma palavra-chave.', on: false, needs: 'whatsapp' },
  checkout: { label: 'Checkout com Pix', desc: 'Página de pagamento própria com Pix copia e cola na sua chave, sem intermediador.', on: false },
};

const choices = site => { try { return JSON.parse(site?.modules || '{}') || {}; } catch { return {}; } };
/** A escolha do site para o recurso (ou o padrão), sem olhar dependências. É o que a caixa de Configurações mostra. */
export function chosen(site, id) {
  const c = choices(site);
  return Object.hasOwn(MODULES, id) && !!(Object.hasOwn(c, id) ? c[id] : MODULES[id].on);
}
/** O recurso está ligado no site (e o recurso de que ele depende também)? */
export const enabled = (site, id) => !!site && chosen(site, id) && (!MODULES[id].needs || enabled(site, MODULES[id].needs));
/** Escolhas do formulário (lista de ids marcados) → JSON para a coluna sites.modules. */
export const fromForm = ids => JSON.stringify(Object.fromEntries(Object.keys(MODULES).map(id => [id, ids.includes(id)])));
