# 0017. Recursos liga/desliga, envio pelo WhatsApp e checkout com Pix

Data: 15/11/2026 · Situação: aceita

## Contexto

Comparando com o [funil-aberto](https://github.com/thiagopatzdorf/funil-aberto) (MIT), faltavam ao Sinqfy cinco peças da operação de venda: recuperação de venda pendente, públicos para remarketing, retenção de vídeo, robô por palavra-chave e um checkout próprio. Nem todo site precisa de todas, e algumas mandam mensagem em nome do cliente.

## Decisão

- **Recursos por site** (`src/modules.js`, coluna `sites.modules`). Rota com `module` responde 404 e o item some do menu quando o recurso está desligado. CRM e WhatsApp continuam ligados por padrão; os cinco novos vêm desligados. Um recurso pode depender de outro (`needs`).
- **O Sinqfy passa a enviar mensagens**, só pelo WhatsApp (Cloud API oficial, token cifrado com a `DATA_KEY`). Fora da janela de 24 horas, só modelos aprovados pela Meta. E-mail continua fora ([ADR 0008](0008-sem-email.md)).
- **Recuperação**: venda pendente com telefone vira contato (cifrado, [ADR 0013](0013-dados-pessoais-criptografados.md)) e entra em `pending_orders`. A sequência para quando a venda é paga ou recusada, ou quando a pessoa responde no WhatsApp (a conversa segue com gente).
- **Públicos**: CSV com e-mail, telefone e primeiro nome em SHA-256 para subir à mão na Meta. Nada é escrito na conta de anúncios ([ADR 0004](0004-meta-somente-leitura-e-csv.md)). Cada download vai para o `audit_log`.
- **Retenção de vídeo**: eventos `video_25` a `video_100` do snippet, só no painel (funis). Não vão para a Meta nem para o GA4.
- **Checkout com Pix**: BR Code estático na chave do vendedor e QR em SVG no servidor (qrcode-generator, MIT, em `src/vendor`). O preço vem sempre do produto no painel. A confirmação vem do botão "Marcar como pago" ou do webhook do banco (`/hooks/<token>/pix`, formato do genérico) e segue o caminho de qualquer venda (Conversions API, GA4, CRM).

## Consequências

- O snippet passou de 3 KB para cerca de 3,2 KB (limite dos testes: 3.328 bytes).
- O Pix estático não confirma sozinho: sem webhook do banco, alguém precisa marcar como pago. Pix com cobrança (txid do PSP) e cartão ficam para depois.
- O robô responde uma regra por mensagem, sem fluxo de vários passos.
