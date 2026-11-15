# Documentação do Trackify

## Comece por aqui

| Documento | Para quem | O que tem |
|---|---|---|
| [Guia do iniciante](guia-iniciante.md) | Quem vai configurar pela primeira vez | Passo a passo do zero ao rastreamento funcionando, onde pegar cada token e ID, problemas comuns |
| [Manual](manual.md) | Quem usa o painel no dia a dia | O que o sistema faz, para que serve cada tela, glossário, recursos opcionais, papéis |
| [Servidor na Oracle](deploy-oracle.md) | Quem vai hospedar | VPS grátis ligada 24 horas, Docker, `.env`, backup, atualização |
| [Cloudflare](guia-cloudflare.md) | Quem vai hospedar | Domínio, túnel do painel, subdomínio `t.`, domínio dos clientes, R2 |

## Referência técnica

| Documento | O que tem |
|---|---|
| [integracoes.md](integracoes.md) | Detalhe de cada integração: script, UTM, webhooks por plataforma, assinaturas, formato genérico, Meta, CAPI, GA4, CRM, WhatsApp |
| [SPEC.md](SPEC.md) | Definições das métricas, modelo de dados, fora do escopo |
| [design-system.md](design-system.md) | Cores, tipografia, componentes e a marca |
| [deploy-vercel.md](deploy-vercel.md) | Instalação antiga na Vercel (legado) |
| [fluxo-com-skills.md](fluxo-com-skills.md) | Qual skill do Claude Code usar em cada tipo de tarefa |
| [adr/](adr/) | Decisões de arquitetura (0001 a 0017) e por que foram tomadas |

## Diagramas

| Imagem | Mostra |
|---|---|
| [img/fluxo-dos-dados.svg](img/fluxo-dos-dados.svg) | Do clique no anúncio até a venda voltar para a Meta |
| [img/hospedagem.svg](img/hospedagem.svg) | Onde cada peça roda: Cloudflare e VPS da Oracle |
| [img/caminho-do-iniciante.svg](img/caminho-do-iniciante.svg) | As 7 etapas da configuração |
