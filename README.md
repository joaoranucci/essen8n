# ENVIO PDF — n8n local (Maxbot + Google Drive + Sheets)

Lê PDFs das pastas do Drive, identifica o **pagador pelo conteúdo**, acha o cliente na
planilha geral e envia pelo Maxbot o **template da pasta de origem**. Depois de um envio
aceito, registra e move o PDF para `ENVIADOS`.

## Versões instaladas (conferidas na máquina)

| Componente | Versão |
|---|---|
| Windows 10 Home 22H2, x64 | Docker Desktop (Docker 29.8.0, Compose v5.5.1), WSL2 |
| n8n | **2.40.5** (imagem fixada no `compose.yaml`, digest `sha256:9f693fd5…`) |
| Postgres | 16.15 (`postgres:16-alpine`) — o n8n avisa que 17+ é o suportado; 16 funciona ("compatibility support"). Migrar exige dump/restore (não fiz para não mexer no volume que você já usa). |
| Fuso | `America/Sao_Paulo` |

URL local: http://localhost:5678 (somente 127.0.0.1).

## Estado atual e o que ainda falta

Não entro em telas de login nem digito senhas/tokens/chaves — mesmo com autorização, isso fica
com o operador.

**Pronto (verificado em 23/09/2026):**
- n8n 2.40.5 + Postgres de pé; os dois workflows importados, ambos **inativos**.
- **Google Drive e Sheets conectados** (tokens OAuth salvos; os 12 nós usam essas credenciais).
- **Pasta privada de links criada** no seu Drive: `LINKS_ENVIO_PDF`
  (id `1ZKtQ6Upp3jA7S2i_2Bv0w-KkyAzsywY0`, `shared:false`, só você como owner) e já gravada em
  `ENVPDF_PASTA_LINKS_ID` no `.env`. (Havia uma pasta "LINKs" de outro dono, compartilhada — não usada.)
- Credencial Postgres criada por mim (senha gerada localmente, só no `.env`).

- **Maxbot API salvo** (24/09: marcadores substituídos; `channel_token` = "NUMERO CERTO").
- **1º envio de TESTE feito** (execução 24): PDF de PARCELAMENTOS → template 54562 → **ACEITO** pelo
  Maxbot (`status 1`, `wamid` recebido) para o **46 99135-9005** (contact_id 10656708).

**Falta confirmar (só você, olhando o WhatsApp):** o texto recebido — `[NOME]` e `[INFO1]` foram
substituídos? o link abre o PDF certo? "ACEITO" não prova entrega.

**Não é falha do fluxo, mas exige decisão:** as permissões do PDF **original** já são "qualquer pessoa com o
link – editor" **herdadas de uma pasta pai** (`inherited:true`); o fluxo não mexe nelas. Vale revisar o
compartilhamento da pasta raiz/PARCELAMENTOS no Drive.

Estado do ambiente: TESTE e PRODUÇÃO **inativos**; o registro guarda 1 linha `ACEITO/TESTE` (é o que impede
reenvio); tabela de lock vazia.

## O que foi corrigido no workflow

| Requisito | Situação |
|---|---|
| Template pela **pasta** (ID), não pelo conteúdo/nome | Mapa ID→template no `[CFG]`; `[SEL]` sobe até a pasta de categoria e casa pelo **ID**. Pasta renomeada continua valendo. PDF na raiz / pasta desconhecida → bloqueia (sem aproximar). |
| Registrar pasta de origem, categoria e template | Vão para o registro (`pasta`, `tipo`, `template_id`) e para o diagnóstico. |
| `ENVIADOS` fora da busca | Excluída em `[DRIVE] Consulta nível 2` e `[DRIVE] Consulta de PDFs` (e portanto suas subpastas). |
| Sem fallback `lista[0]` no `get_contact` | Só aceita contato cujo `whatsapp` **ou** `mobile_phone` bata dígito a dígito. Vários batem → `CONTATO_AMBIGUO`; existe contato mas nenhum bate (seu caso 8 vs 9 dígitos) → `CONTATO_DIVERGENTE` mostrando os dois formatos. Ambos bloqueiam sem escrever no cadastro. |
| Trava de teste | Na cópia **TESTE**, telefone (`5546991359005`) **e** `contact_id` (`10656708`) são constantes do código, conferidas antes de `get_contact/put/set_contact` **e** de novo logo antes do `send_template_integration`. `ENVPDF_MODO_TESTE=false` ou trocar `ENVPDF_TELEFONE_TESTE` no `.env` não a destrava. |
| Produção separada, inativa | `workflows/ENVIO-PDF-PRODUCAO.json`, `active:false`, webhook próprio. |
| Link do PDF sem expor o original | `[DRIVE] Copiar para envio` copia (**fora** da pasta de origem: `sameFolder=false`) para a pasta privada de links; só a **cópia** recebe "qualquer pessoa com o link – leitor". O original nunca é compartilhado. |
| Arquivar após ACEITO | `[DRIVE] Mover para ENVIADOS` só no ramo ACEITO **e só na cópia de PRODUÇÃO** (porteiro `[DRIVE] Só arquiva em produção?`): em TESTE o original nunca é movido e `arquivamento` fica vazio; o `[ARQ]` só busca `modo=PRODUCAO`. Falha → `arquivamento=PENDENTE` (+ `ARQUIVAMENTO_PENDENTE` no erro). INCERTO/erro/alerta nunca arquivam. (Lacuna que eu tinha deixado e corrigi em 23/09 antes do primeiro teste real.) |
| Retomar arquivamento sem reenviar | `[ARQ]` no início de cada execução: busca `ACEITO`+`PENDENTE`, só move e grava — sem nenhum nó Maxbot. |
| Execução única / reserva atômica | Lock no **Postgres** por telefone de destino (`INSERT … ON CONFLICT … WHERE vencido RETURNING`), antes do `get_contact`, liberado após `Avaliar envio`. Cobre o mesmo PDF 2× **e** duas mensagens ao mesmo cliente cruzando o `tag_info1`. Lock esquecido expira em `ENVPDF_ENVIO_TRAVADO_MINUTOS` (30). |
| Switch `[CTRL] Ação` com 4 saídas | **Já estava correto** (ENVIAR/ALERTAR/REGISTRAR/PULAR, 4 saídas é o padrão do nó). Uma "correção" minha anterior era no-op; foi removida. |
| PARCELAMENTOS 54562, 1 PDF/mensagem | Confirmado; `54563/54564` não aparecem em lugar nenhum. |

### Bloqueado (registrado no próprio workflow, gera alerta ao operador)
- **COBRANÇA 2 EM ATRASO (54581)** exige 2 PDFs do mesmo cliente (Honorário 1→INFO2, Honorário 2→INFO1).
  Não implementei o agrupamento nesta entrega; a pasta fica bloqueada e **nunca** cai no 54566.
- **CANCELAMENTOS**: sem template aprovado; bloqueado.

## Achados desta rodada (n8n 2.x) — já corrigidos
1. **`$env` bloqueado nos Code nodes** (n8n 2.x): todas as `ENVPDF_*` cairiam nos padrões em silêncio.
   → `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` no compose (contrapartida documentada lá) **e** o `[CFG]`
   agora aborta com mensagem clara se o acesso estiver bloqueado.
2. **Nó de cópia do Drive tem `sameFolder=true` por padrão** → copiaria o PDF *dentro* da pasta de
   origem (e o robô o leria como novo PDF). Corrigido (`sameFolder=false`, `driveId`, `folderId`),
   conferido no código-fonte do nó da versão instalada.
3. **Bug meu no `[CFG]`** (faltava `TABELA_REGISTRO`) — pego pelos testes de lógica.
4. **Nó Postgres substitui o item** pela linha do `RETURNING` → o `envio` sumia após o lock
   (`DESTINO_INVALIDO`) e o `contexto` após a liberação. Corrigido com `[LOCK] Restaurar item` /
   `[LOCK] Retomar avaliação` — pego por execução no motor real, não por teste unitário.
5. **Fluxo de erro roda em execução separada** (sem `[CFG]`): meu lock referenciava `[CFG]` e o aviso
   "a automação parou" nunca sairia. Corrigido + teste estático que varre o caminho de erro.

## Evidências (o que foi realmente executado)

| Teste | Como | Resultado |
|---|---|---|
| 112 verificações de lógica (código **real** de cada nó, com `$`-helpers simulados): mapa por ID, ancestral, ENVIADOS, identificação do pagador (DOCLA≠cliente), contato sem `lista[0]`, trava de teste, link pela cópia, ACEITO/FALHA/INCERTO, arquivamento, cadeia do lock, caminho de erro | `node tests/logic_tests.js` (saída em `tests/resultado-logic-tests.txt`) | **112 PASS / 0 FAIL** |
| Nós `[LOCK]` **dentro do n8n 2.40.5**: reservar → duplicado → liberar → reservar; roubo de lock vencido | 2 workflows temporários (removidos) via `n8n execute` | ADQUIRIDO / DUPLICADO / LIBERADO / ADQUIRIDO / ADQUIRIDO |
| **Dois disparos simultâneos** do n8n, mesmo destino | 2 execuções em paralelo | 1 ADQUIRIDO, 1 DUPLICADO |
| 30 sessões SQL simultâneas, mesmo destino | `bash tests/lock-concorrencia.sh 30` | **1 de 30** adquire |
| Workflow TESTE, via webhook no servidor, **já com Google conectado** | 1 disparo; parada esperada no Maxbot (token ainda é marcador) | `[CFG]`→Data Table→`[LOCK]`→`[ARQ]` (0 pendentes)→**Drive real** (14 pastas, 201 PDFs)→`[SEL]`: 1 candidato = PARCELAMENTOS/54562→**planilha real** (5.207 linhas, 3.766 com documento, 422 com telefone)→`get_template` do Maxbot: "Unauthorized… inactive" — **como esperado**. Nada foi copiado, compartilhado, movido nem enviado. |
| **Envio real de TESTE, ponta a ponta** (exec. 24, 24/09, com Google + Maxbot conectados) | 1 disparo do webhook | Descoberta (201 PDFs) → 1 candidato PARCELAMENTOS/54562 → identificação do pagador → `ENVIAR` → **cópia** criada na pasta `LINKS_ENVIO_PDF` e liberada (`anyone/reader`, sem descoberta) → lock → `get_contact` casou o contact_id **10656708** → `set_contact` → trava de teste liberou (destino = seu telefone) → `send_template_integration` → **ACEITO** (`status 1`, `wamid`) → lock liberado → registro `ACEITO/TESTE`, `arquivamento` vazio → porteiro **não** moveu o original |
| Conferência no Drive após o envio | leitura por API | **Original**: continua em PARCELAMENTOS, fora de `ENVIADOS`, fora da lixeira, permissões intactas. **Cópia**: só na pasta de links (fora da pasta do original), `anyone/reader/discovery=false` + owner, PDF de 161.147 bytes. `ENVIADOS`: 0 itens. |
| Acesso do destinatário ao link **sem login** | `curl` anônimo | download sem cookies: **HTTP 200**, assinatura `%PDF-` |
| **Teste 2 — reexecução sem reenvio** (com **reinício do container** no meio) | restringi a execução ao mesmo PDF e disparei | `ja_aceitos:1`, `candidatos:0` → parou em `[FIM] Nada a processar`, **nenhum nó de Maxbot/cópia/lock executou** |
| Verificação **somente leitura** da fonte real (workflow temporário, removido) | `n8n execute` com a credencial Google | Os **13 IDs de pasta existem** sob a raiz (14ª = `ENVIADOS`, sob a raiz); PDFs diretos: COBRANÇA 1 = 110, PARCELAMENTOS = 79, DAS = 10, HONORARIOS = 2; planilha tem `CNPJ`, `Name`, `NUMERO DE TELEFONE` |

### Teste por categoria (24/09, TESTE → só para o contato 10656708 / 46 99135-9005)
Triagem somente leitura (mesmo código de identificação, sem enviar) + envio real dos válidos. `LINKS_ENVIO_PDF` agora
também é excluída da descoberta (além de `ENVIADOS`).

| Pasta | PDFs | Template esperado | Utilizado | Resultado |
|---|---|---|---|---|
| PARCELAMENTOS | 79 (8 triados, 8 válidos) | 54562 ENVIO PARCELAMENTO | 54562 ENVIO PARCELAMENTO | **ACEITO** (`msg_id 22974256`) — 22:53:53 |
| DAS | 10 (8 triados, 7 válidos) | 54558 ENVIO DASMEI | 54558 ENVIO DASMEI | **ACEITO** (`msg_id 22974257`) — 22:54:07 |
| COBRANÇA 1 EM ATRASO | 110 (todos triados) | 54566 ENVIO COBRANÇA 1 EM ATRASO | 54566 ENVIO COBRANÇA 1 EM ATRASO | 1ª triagem: 0 válidos (46 sem telefone, 64 fora da planilha). Depois que o operador pôs telefone na linha da cliente de teste (nome e CNPJ omitidos), 1 PDF ficou válido → **ACEITO** (`msg_id 22974300`) às 23:18:04. Restantes: 45 `TELEFONE_AUSENTE` + 64 `CLIENTE_NAO_ENCONTRADO` |
| HONORARIOS | 2 | 54622 | — | **Não enviado**: `SO_DOCUMENTO_DO_ESCRITORIO` (1 boleto de honorário com pagador = DOCLA; 1 doc. PGFN só com o CNPJ do escritório — não são de cliente) |
| COBRANÇA 2 / CANCELAMENTOS | 0 / 0 | — | — | sem PDFs; bloqueadas por desenho (54581 exige 2 PDFs; sem template) |
| DCTFWEB, ADIANTAMENTOS, FOLHA DE PAGAMENTO, ISS, IMPOSTOS GENERICOS, ICMS, FGTS | 0 | — | — | sem PDFs |

Conferido depois: originais nas pastas de origem (não movidos, fora da lixeira), `ENVIADOS` com 0 itens, 3 cópias em
`LINKS_ENVIO_PDF` (todas `anyone/reader`, sem descoberta), 2 novas abrem anonimamente (HTTP 200, `%PDF-`).
Aceitação pela API ≠ entrega: a conferência visual no WhatsApp é do operador.

### Observações sobre os dados reais (decida antes da produção)
- **Só 422 de 3.766 linhas com documento têm telefone.** Na produção a maioria dos PDFs vira alerta
  `TELEFONE_AUSENTE` ao operador (um por PDF novo).
- A planilha tem colunas que o fluxo **não considera**: `Group` (ex.: `INATIVOS`), `STATUS` e, por
  obrigação, valores como `NÃO MANDAR` (colunas `DAS`, `DIV ATIV`, `DASN`…). Um cliente inativo/"NÃO MANDAR"
  **com telefone** receberia a mensagem normalmente. Se essas colunas são regra de negócio, é preciso
  incluí-las no bloqueio antes de ativar a produção (preciso que você defina a regra por categoria).
- 770 documentos aparecem em mais de uma linha; com telefones diferentes o fluxo bloqueia (`TELEFONES_DIVERGENTES`).
| Fluxo de **erro geral** ponta a ponta no motor | disparado pela falha acima | lock adquirido→restaurado→`get_contact` (Maxbot respondeu "inactive": token ainda é marcador)→avaliação→lock liberado→registro gravado |

### NÃO comprovado ainda (depende dos seus segredos)
- Nenhuma chamada real ao Drive/Sheets; nenhum envio real ao Maxbot; nenhum PDF lido/movido.
- Testes 1–5 do pedido (2 clientes, reexecução sem reenvio, cliente fora da planilha, disparo
  simultâneo **fim a fim**, movimentação) — só depois das credenciais.
- Se `tag_info1` no cadastro do contato é necessário (o workflow original assume que sim; mantive e
  protegi com lock por destino). Precisa de 1 envio real para confirmar a substituição de `[INFO1]`
  no WhatsApp; se não for necessário, removemos `put/set_contact`.
- Que o link da **cópia** abre o PDF certo para o destinatário e continua válido depois de
  arquivar (a cópia não muda de lugar; o original é o que vai para `ENVIADOS`).

## Testes a rodar depois das credenciais (workflow TESTE, só para o seu contato)
1. Dois PDFs de clientes diferentes → conferir nome, link e template no seu WhatsApp.
2. Rodar de novo → nenhum reenvio.
3. PDF de cliente fora da planilha → alerta ao operador e a execução segue.
4. Dois disparos simultâneos do mesmo arquivo → só um envia.
5. Movimentação: no modo TESTE o original **não** é movido nem tem permissão alterada; para testar o
   move de verdade usaremos um PDF descartável.

**Nenhum envio a cliente real acontece antes de eu te mostrar o resumo
(destinatários, arquivos, templates, links) e você aprovar.**

## Comandos

```bash
docker compose up -d                      # sobe/recria (lê o .env)
docker compose logs -f n8n
docker compose exec n8n n8n --version
powershell -ExecutionPolicy Bypass -File .\scripts\importar-workflows.ps1        # reimporta os dois workflows
node tools/build/build_final.js           # regenera workflows/ a partir do export original (determinístico)
node tests/logic_tests.js                 # 112 verificações
bash tests/lock-concorrencia.sh 30        # prova do lock atômico
```

Ao reimportar um workflow **publicado**, despublique antes
(`docker compose exec n8n n8n unpublish:workflow --id=<ID>`).

## Arquivos
- `compose.yaml`, `.env.example`, `.gitignore` — infraestrutura (`.env` fica fora do Git).
- `workflows/ENVIO-PDF-TESTE.json` (id `ENVPDFTSTWH001`) e `ENVIO-PDF-PRODUCAO.json` (id `ENVPDFPRODWH001`, inativo).
- `scripts/` — `importar-workflows.ps1`, `provisionar-credencial-postgres.ps1`, `criar-credenciais-vazias.ps1`.
- `tests/` — testes e o resultado; `tools/build/` — gerador + export original.
