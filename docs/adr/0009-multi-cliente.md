# ADR 0009: Produto multi-cliente (agência, projetos, papéis)

## Status
Aceito. Implementação a partir da etapa 4 do [plano v2](../plano-v2/plano.html). Até lá, `sites` continua sendo a unidade de isolamento.

## Data
2026-11-14

## Contexto
O Rastro nasceu para uso pessoal. O plano v2 transforma o painel num serviço vendido para gestores de tráfego e infoprodutores, que atendem vários clientes, e cada cliente final precisa ver só o que é dele.

## Decisão
- Hierarquia: **agência** (quem paga) → **projetos** (um por cliente ou oferta; hoje chamados de `sites`) → fontes e destinos.
- Papéis por agência: Dono, Gestor e Cliente (só leitura do próprio projeto). Os papéis atuais (admin, editor, leitor) viram Dono, Gestor e Cliente.
- Toda tabela com dado de cliente leva `project_id` (hoje `site`) e é filtrada por ele em toda consulta. Na etapa 4, as tabelas novas ganham política de segurança por linha (RLS) no Postgres como segunda barreira.

## Consequências
- Rotas e consultas continuam recebendo o projeto explicitamente; nada de "projeto atual" em memória.
- Cobrança (etapa 10) é por agência, com limite de projetos e eventos.

## Implementação (etapa 4, 2026-11-14)
- Tabela `agencies`; `users.agency_id` e `sites.agency_id`. O que existia antes foi para a agência 1.
- `users.platform = 1`: dono da instalação. Só ele vê a página Agências e cria agências; o dono de cada agência entra por convite.
- Papéis na tela: Dono (`admin`), Gestor (`editor`), Cliente (`viewer`), sempre dentro da própria agência.
- O isolamento é feito na aplicação: `allowedSites` e `canView` (`src/auth.js`) filtram pela agência, e equipe, convites e liberação de sites também. Testado em `tests/onboarding.test.js`.
- RLS no Postgres (segunda barreira) ainda não foi ligado: fica para quando as tabelas de CRM (etapa 5) entrarem, junto com um usuário de banco por papel.
