# ADR 0016: WhatsApp por link com código e pela Cloud API

## Status
Aceito. Etapa 6 do [plano v2](../plano-v2/plano.html).

## Data
2026-11-14

## Contexto
Boa parte das vendas dos clientes acontece no WhatsApp. Sem ligar a conversa ao anúncio, a Meta não aprende quem compra, e o CRM não sabe de onde veio o lead. Há dois cenários: quem tem o número na Cloud API oficial da Meta e quem usa o app WhatsApp Business comum (sem API). API não oficial fica de fora pelo risco de banimento do número.

## Decisão
- **Link rastreável** `t.dominio/w/<slug>`: o Worker repassa ao painel com os cookies do visitante; o painel grava um código curto (5 caracteres, sem letras ambíguas) com o `rid` e o `fbc`, registra `Contact` na página de origem e redireciona ao `wa.me` com o código no fim da mensagem.
- O código na primeira mensagem (Cloud API) ou digitado na ficha do contato (app comum) liga a conversa ao clique: o contato herda `rid`, `fbc` e a campanha da última visita com UTM.
- **Cloud API**: webhook com assinatura obrigatória (chave do app). Mensagens cifradas (`seal`), guardadas por 90 dias. Quem vem de anúncio de clique para WhatsApp traz `ctwa_clid`; o primeiro contato vira `LeadSubmitted` e as colunas do CRM viram conversões com `action_source: business_messaging` (WABA + `ctwa_clid`), no lugar do e-mail e telefone.
- **Sugestão de coluna**: regras por palavra-chave por padrão. A IA (Gemini) só roda com `GEMINI_API_KEY` no servidor **e** a opção ligada pelo cliente na tela WhatsApp (desligada por padrão), no máximo uma vez por minuto por contato, lendo as últimas 8 mensagens **depois de anonimizar** links, e-mail, telefone, CPF, CNPJ, CEP e chaves Pix aleatórias. O motivo devolvido fica cifrado. A pessoa aceita ou ignora; nada se move sozinho.
- **Isolamento**: o webhook só processa avisos da WABA cadastrada no site (um app da Meta pode atender vários clientes) e exige a chave do app.
- **Código**: liga uma vez só (atômico) e vale 7 dias. O link pela borda só vale no domínio do próprio site; o `Contact` só é gravado pela borda e respeita o consentimento.
- O número de WhatsApp dos links (`wa_links.phone`) fica em texto: é o número comercial do cliente, público no próprio botão do site.

## Consequências
- Responder pelo painel não existe: a conversa continua no WhatsApp; o painel só lê.
- Ligar a IA manda texto de conversa (anonimizado) para o Google: o cliente precisa saber disso no contrato de tratamento de dados (etapa 10).
- O código pode ser digitado errado pelo cliente; a ficha permite ligar manualmente.
