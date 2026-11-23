# Como contribuir

Obrigado por querer ajudar o Sinqfy. Este guia explica o caminho mais curto até um pull request aceito.

## Antes de começar

- **Bug:** abra uma issue com o modelo "Bug", dizendo o que fez, o que esperava e o que aconteceu.
- **Ideia ou mudança grande:** abra uma issue com o modelo "Sugestão" antes de escrever código, para combinar o caminho.
- **Falha de segurança:** não abra issue. Siga o [SECURITY.md](SECURITY.md).

## Ambiente

1. Faça um fork e clone o repositório.
2. Suba o PostgreSQL e o servidor como no [README](README.md#rodar-localmente).
3. Rode `npm test` e confira que tudo passa antes de mudar qualquer coisa.

## Regras do código

As regras completas estão no [CLAUDE.md](CLAUDE.md). As principais:

- A única dependência é `pg`. Não adicione pacotes sem combinar na issue.
- Toda consulta é `await db.…`; consultas independentes vão em `Promise.all`.
- Mudança de schema é aditiva (`ADD COLUMN IF NOT EXISTS`) no fim de `migrate()`.
- HTML sempre pelo template `html`, que escapa por padrão.
- Nunca grave IP, e-mail ou telefone fora dos casos descritos nos ADRs.
- Interface em português do Brasil, seguindo o [design system](docs/design-system.md).
- Decisão de arquitetura nova ganha um ADR em `docs/adr/`.

## Pull request

1. Crie uma branch a partir da `main` com um nome curto (`corrige-funil-vazio`).
2. Um assunto por PR. Mudanças pequenas são revisadas mais rápido.
3. Inclua ou ajuste o teste que falharia sem a sua mudança.
4. Rode `npm test` e preencha o modelo do PR.
5. Mensagens de commit no imperativo, em português: `Corrige o total do funil sem visitas`.

Ao enviar um PR, você concorda que a sua contribuição será publicada sob a [licença do projeto](LICENSE) (FCL-1.0-MIT) e autoriza o autor do Sinqfy a distribuí-la também sob outras licenças, para que o projeto possa mudar de licença no futuro sem pedir de novo a cada contribuidor.
