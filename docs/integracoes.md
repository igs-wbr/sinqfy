# Guia de integrações

Na interface, este guia corresponde à tela **Integrações** de cada site. Só Admin e Editor têm acesso a ela.

## 1. Snippet de rastreamento

```html
<script defer data-site="SEU_ID" src="https://t.seudominio.com.br/s.js"></script>
```

Use o subdomínio `t.` servido pelo Worker da borda (veja [deploy](deploy-oracle.md#6-worker-da-borda)). Assim os cookies `_rid`, `_fbp` e `_fbc` são gravados pelo servidor no seu domínio e duram 400 dias, inclusive no Safari. Apontar o snippet direto para o painel ainda funciona, mas sem cookie (visitante por hash diário).

- **Consentimento (LGPD):** com `data-consent="required"` no `<script>`, nenhum cookie é gravado até o banner chamar `rastro('consent')`.
- **Cada evento leva um id** (`event_id`), usado na etapa 2 para deduplicar com o Pixel.
- **Links externos** (checkout) recebem `rid=<id do visitante>`, que liga a venda ao clique na etapa 3.
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


## 3. Webhooks de plataformas de venda

Cada site tem um token. As URLs aparecem prontas em Integrações:

```
https://stats.seudominio.com/hooks/<token>/hotmart
https://stats.seudominio.com/hooks/<token>/kiwify
https://stats.seudominio.com/hooks/<token>/eduzz
https://stats.seudominio.com/hooks/<token>/generic
```

- Respostas: `200` (processado ou ignorado), `400` (payload inválido) ou `404` (token ou plataforma desconhecidos).
- Os últimos 50 resultados aparecem em Integrações → Últimos webhooks. Só o resultado fica registrado; o payload, não.
- **Gerar novo token** invalida as URLs antigas.
- Dados pessoais do comprador **nunca** são gravados. E-mail e telefone só seguem em hash para a Conversions API (seção 5).

| Plataforma | Eventos tratados | Valores | UTMs |
|---|---|---|---|
| Hotmart (Webhook 2.0) | `PURCHASE_APPROVED/COMPLETE` → aprovada; `BILLET_PRINTED/DELAYED` → pendente; `CANCELED/EXPIRED` → recusada; `REFUNDED`; `CHARGEBACK`. Os demais são ignorados | `purchase.price.value`; líquido = comissão `PRODUCER` | `purchase.origin.src` → source, `sck` → campaign |
| Kiwify | `order_status`: `paid`, `waiting_payment`, `refused`, `refunded`, `chargedback` | `Commissions.charge_amount` e `my_commission` (centavos) | `TrackingParameters.utm_*` |
| Eduzz | Webhook novo (JSON com `data`) e legado (form `trans_*`, status numérico) | `price.value` / `trans_value` | `data.utm.*` / `utm_*` |
| Genérico | campo `status` | campos `amount` e `net` | campos `utm_*` |

> O formato da Eduzz varia por versão. Depois de configurar, faça um pedido de teste e confira o resultado em "Últimos webhooks". Se a sua versão não for reconhecida, use o formato genérico via Zapier ou Make.

### Formato genérico

Use com Stripe, Zapier, Make, n8n ou qualquer checkout:

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
  "utm_source": "FB",
  "utm_medium": "Lookalike|120200001",
  "utm_campaign": "Black Friday|120200000",
  "utm_content": "Vídeo 1|120200002",
  "utm_term": "feed",
  "email": "opcional, só para a Conversions API",
  "phone": "opcional"
}
```

Campos aceitos:

- `status`: `paid`, `pending`, `refused`, `refunded` ou `chargeback`.
- `method`: `pix`, `card`, `boleto` ou `other`.
- `amount` e `net`: aceitam número ou texto como `"R$ 1.234,56"`.

Reenvios do mesmo `order_id` atualizam a venda existente. O status muda e os valores só são substituídos quando o novo é maior que zero.

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

## 5. Conversions API (rastreamento server-side)

Informe o id do pixel (conjunto de dados) e um token da Conversions API. A partir daí, cada venda que passa a **aprovada** via webhook vira um evento `Purchase` enviado direto do servidor. Isso recupera conversões que bloqueadores e o iOS escondem do pixel.

- `event_id` = `plataforma-pedido`. Se o pixel do navegador mandar o mesmo id, a Meta descarta a duplicata.
- E-mail e telefone são normalizados e enviados **apenas em SHA-256**.
- Pedidos sem e-mail e sem telefone não são enviados, porque a Meta exige ao menos um identificador.
- Envios e falhas aparecem em "Últimos webhooks".
