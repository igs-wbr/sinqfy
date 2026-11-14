# Guia de integrações

Na interface, este guia corresponde à tela **Integrações** de cada site. Só Admin e Editor têm acesso a ela.

## 1. Snippet de rastreamento

```html
<script defer data-site="SEU_ID" src="https://t.seudominio.com.br/s.js"></script>
```

Use o subdomínio `t.` servido pelo Worker da borda (veja [deploy](deploy-oracle.md#6-worker-da-borda)). Assim os cookies `_rid`, `_fbp` e `_fbc` são gravados pelo servidor no seu domínio e duram 400 dias, inclusive no Safari. Apontar o snippet direto para o painel ainda funciona, mas sem cookie (visitante por hash diário).

- **Consentimento (LGPD):** com `data-consent="required"` no `<script>`, nenhum cookie é gravado até o banner chamar `rastro('consent')`.
- **Cada evento leva um id** (`event_id`), usado na etapa 2 para deduplicar com o Pixel.
- **Links de checkout e de WhatsApp** (Hotmart, Kiwify, Eduzz, Monetizze, Ticto, Perfect Pay, Braip, Greenn, Yampi, Cartpanda, `pay.*`, `checkout`, `wa.me`) recebem `rid=<id do visitante>`, que liga a venda ao clique na etapa 3. Outro link qualquer só recebe com o atributo `data-rastro-rid`.
- **Domínios do site** (Configurações): com a lista preenchida, beacons de outros domínios são recusados.
- **Limite do Safari:** se o subdomínio `t.` e o site principal ficarem em IPs diferentes, o Safari limita o cookie gravado pelo servidor a 7 dias. Para ter os 400 dias no Safari, o site principal também precisa passar pela Cloudflare.
- **Pixel junto do servidor:** com `data-pixel="mirror"`, o snippet repete cada evento no Pixel (`fbq`) com o mesmo `eventID` do envio pelo servidor, e a Meta conta uma vez só. Nesse caso, apague a linha `fbq('track','PageView')` do código base do Pixel.
- **GA4:** o snippet lê o cookie `_ga` e manda o `client_id`. Só conversões vão pelo servidor (page_view continua com o gtag do site, porque o GA4 não deduplica).
- A aba **Tráfego → Eventos** mostra cada evento com o visitante e os IDs de clique (fbc, fbp, gclid, gbraid, wbraid, ttclid).

O snippet:

- envia uma pageview a cada carregamento e a cada `history.pushState`, o que cobre SPAs;
- dispara eventos em qualquer elemento com `data-rastro="nome"`. Atributos `data-rastro-*` viram propriedades, e `data-rastro-revenue` vira receita. Em `<form>`, o evento conta no submit;
- expõe a API `rastro('evento', { prop: 'valor' }, 97.90)`, e `rastro()` força uma pageview;
- **propaga as UTMs**: ao clicar num link para outro domínio, ele copia as `utm_*` da página atual para o link (sem sobrescrever as que já existem). Para a Hotmart, que só repassa `src` e `sck`, também preenche `src = utm_source` e `sck = utm_campaign`;
- ignora `localhost` e navegadores automatizados. Para excluir as suas próprias visitas, rode `localStorage.rastro_ignore = 1`.

## 2. Template de UTM

Para que vendas e gastos se encontrem, cada anúncio precisa levar a UTM com o **id** da entidade. Na Meta, cole em *Ads Manager → Anúncio → Parâmetros de URL*:

```
utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}
```

O Rastro usa o trecho depois do último `|` como chave:

- `utm_campaign` liga a venda à campanha;
- `utm_medium` liga ao conjunto;
- `utm_content` liga ao anúncio.

Sem `|`, ele usa o texto inteiro e compara com o **nome** da campanha.


## 3. Vendas: plataformas, webhook personalizado e planilha

Cada site tem um token. As URLs aparecem prontas em Integrações:

```
https://app.seudominio.com.br/hooks/<token>/hotmart      (também kiwify, eduzz, shopify, woocommerce, stripe)
https://app.seudominio.com.br/hooks/<token>/generic      formato próprio do Rastro
https://app.seudominio.com.br/hooks/<token>/custom       qualquer JSON, com mapa de campos
https://app.seudominio.com.br/hooks/<token>/sheets       Google Sheets (script pronto na tela)
```

- Respostas: `200` (processado ou ignorado), `400` (payload inválido), `401` (assinatura não confere) ou `404` (token ou plataforma desconhecidos).
- Os últimos 50 resultados aparecem em Integrações, Últimos webhooks, com a origem que a venda recebeu. Só o resultado fica registrado; o payload, não.
- **Gerar novo token** invalida as URLs antigas.
- Dados pessoais do comprador **nunca** são gravados. E-mail e telefone só seguem em hash para a Conversions API (seção 5).

### Como a venda é ligada ao clique

A tela Pedidos mostra a regra que valeu em cada venda (coluna Origem):

1. **Clique (rid):** o snippet põe o id do visitante (`rid`) no link de checkout. A plataforma devolve esse valor no webhook e o Rastro acha o clique: herda as UTMs da última visita com campanha (quando o checkout perdeu as UTMs), e a compra vai à Meta como `website` com `fbc`, `fbp`, user agent e a página, e ao GA4 na sessão do navegador.
2. **UTM:** sem rid, valem as UTMs que a plataforma mandou.
3. **Sem origem:** nenhum dos dois. A compra ainda vai à Meta (como `other`, com e-mail e telefone em hash).

| Plataforma | Onde vai o rid | Eventos tratados | UTMs |
|---|---|---|---|
| Hotmart (Webhook 2.0) | `xcod` (o snippet preenche) | aprovada, pendente, recusada, reembolso, chargeback | `origin.src` e `sck` |
| Kiwify | `sck` (o snippet preenche quando o link não tem) | `paid`, `waiting_payment`, `refused`, `refunded`, `chargedback` | `TrackingParameters.utm_*` |
| Eduzz | não repassa: vale a UTM | webhook novo e legado | `utm.*` |
| Shopify | (loja é o próprio site) `fbclid` e UTMs do `landing_site`, user agent do pedido | `orders/paid` e `orders/updated` (`financial_status`) | do `landing_site` |
| WooCommerce | meta `rastro_rid`, se o tema gravar | `processing`/`completed` pago, `on-hold` pendente, `refunded`, `cancelled`/`failed` | atribuição nativa (`_wc_order_attribution_*`, WooCommerce 8.5+) |
| Stripe (Checkout e Payment Links) | `client_reference_id` (o snippet preenche) | `checkout.session.completed`, `async_payment_*`, `charge.refunded`, `charge.dispute.created` | `metadata.utm_*` |

> Confira cada plataforma com um pedido de teste: a linha em Últimos webhooks mostra se a venda casou pelo clique. O campo exato que algumas plataformas devolvem (`xcod` na Hotmart, `sck` na Kiwify) foi conferido pela documentação disponível, não com pedido real.

### Assinatura dos webhooks

Com o segredo cadastrado em Integrações, Segredos de assinatura, o Rastro recusa (`401`) o que vier sem a assinatura da plataforma. Sem segredo, vale só o token da URL.

| Plataforma | O que conferimos | Onde pegar o segredo |
|---|---|---|
| Hotmart | cabeçalho `X-HOTMART-HOTTOK` | Ferramentas, Webhook, Autenticação (hottok) |
| Shopify | `X-Shopify-Hmac-Sha256` (HMAC-SHA256 do corpo, base64) | Configurações, Notificações, Webhooks |
| WooCommerce | `X-WC-Webhook-Signature` (HMAC-SHA256 do corpo, base64) | WooCommerce, Configurações, Avançado, Webhooks |
| Stripe | `Stripe-Signature` (`t` e `v1`, até 5 min) | Desenvolvedores, Webhooks, Segredo de assinatura (`whsec_...`) |

A Kiwify e a Eduzz não têm assinatura documentada para o webhook de vendas; nelas vale o token da URL.

### Formato genérico

Use com Zapier, Make, n8n ou um sistema próprio:

```json
{
  "order_id": "pedido-123",
  "status": "paid",
  "method": "pix",
  "amount": 197.00,
  "net": 180.50,
  "currency": "BRL",
  "product": "Curso X",
  "created_at": "2026-10-07T14:30:00-03:00",
  "rid": "id do visitante (parâmetro rid do link), opcional",
  "utm_source": "FB",
  "utm_campaign": "Black Friday|120200000",
  "email": "opcional, só para a Conversions API",
  "phone": "opcional"
}
```

- `status`: `paid`, `pending`, `refused`, `refunded` ou `chargeback`.
- `method`: `pix`, `card`, `boleto` ou `other`.
- `amount` e `net`: aceitam número ou texto como `"R$ 1.234,56"`.

Reenvios do mesmo `order_id` atualizam a venda existente. O status muda e os valores só são substituídos quando o novo é maior que zero.

### Webhook personalizado

Para um checkout que não está na lista e manda JSON no formato dele: em Integrações, diga o caminho de cada campo (`data.order.id`, `items[0].name`) e quais valores de status contam como aprovada, pendente, recusada, reembolsada e chargeback. Cole um exemplo do JSON e use **Testar com o exemplo** para ver a venda lida antes de salvar. Status fora da lista é ignorado (responde `200`).

### Google Sheets

Para vendas registradas à mão (WhatsApp, boleto, outro checkout). A tela traz um Apps Script pronto:

1. Aba **Vendas** com cabeçalho na 1ª linha. Colunas reconhecidas (com ou sem acento): `Pedido`, `Status`, `Valor`, `Líquido`, `Moeda`, `Pagamento`, `Produto`, `Data` (dd/mm/aaaa hh:mm), `E-mail`, `Telefone`, `rid`, `utm_*`.
2. Extensões, Apps Script, colar o código e executar `rastroConfigurar` (cria o gatilho de 5 minutos).
3. O script envia as linhas sem "enviado" na coluna **Rastro** e escreve o resultado de cada uma. Para reenviar, apague a célula da coluna Rastro.

Status aceitos: pago, aprovado, confirmado (ou vazio) como aprovada; pendente, aguardando; reembolsado; cancelado, recusado; chargeback.

## 4. Meta Ads (Marketing API, somente leitura)

1. Crie um **usuário do sistema** em Business Manager → Configurações → Usuários do sistema.
2. Gere um token com a permissão `ads_read` e acesso à conta de anúncios.
3. Em Integrações → Meta Ads, informe o id da conta (`act_…`) e o token.

O que acontece depois:

- A sincronização busca campanhas, conjuntos, anúncios (status e orçamento), o gasto diário por anúncio e as **conversões que a Meta reporta**: compras, valor de compra e leads, na janela de atribuição configurada na conta.
- Essas conversões aparecem como **Compras (Meta)** e **ROAS (Meta)** ao lado das vendas reais dos webhooks. A diferença entre os dois mostra o quanto a Meta está atribuindo a mais (ou a menos) do que realmente entrou.
- A primeira traz 30 dias. Depois disso, roda de hora em hora (a cada chamada de `/cron`, veja [deploy-vercel.md](deploy-vercel.md)) e refaz os últimos 3 dias, porque a Meta ainda ajusta gastos recentes. O botão **Sincronizar agora** força na hora.
- A versão da API é configurável em `META_API_VERSION` (padrão `v23.0`).
- O gasto é somado como está, sem conversão de moeda. Se a moeda da conta for diferente da moeda do site, a tela mostra um aviso.

## 5. Envio server-side: Meta (Conversions API) e GA4

**Meta:** informe o id do pixel (conjunto de dados), um token da Conversions API e, para testar, o código de teste do Gerenciador de Eventos (`TEST...`). **GA4:** informe o ID de medição (`G-...`) e um segredo da API do Measurement Protocol (Admin → Fluxos de dados → Measurement Protocol).

A partir daí:

- **Todo evento do site** (PageView, Lead, InitiateCheckout, eventos próprios) entra na fila e vai para os destinos configurados, com `fbc`, `fbp`, IP, user agent e o id do visitante em hash (`external_id`).
- **Cada venda aprovada** via webhook vira um `Purchase` com `event_id` = `plataforma-pedido`, e-mail e telefone **apenas em SHA-256**. Pedidos sem e-mail e sem telefone não vão, porque a Meta exige ao menos um identificador.
- A fila tenta de novo em 1 min, 5 min, 30 min e 6 h. Depois disso, a entrega aparece como falha na aba Eventos, com o motivo e um botão **Reenviar**.
- IP e user agent saem do banco assim que o envio termina ([ADR 0014](adr/0014-fila-de-envio-server-side.md)).
- A tela Integrações mostra quantos eventos foram enviados, estão na fila ou falharam nas últimas 24 h.
