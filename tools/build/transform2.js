// Parte 2: aplica todas as demais correcoes sobre o resultado da parte 1
// (step1_TESTE.json / step1_PRODUCAO.json) e escreve os workflows finais.
const fs = require('fs');
const path = require('path');
const SCRATCH = __dirname;

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function byName(wf, name) {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error('No nao encontrado: ' + name);
  return n;
}
function addConn(wf, fromName, fromOut, toName, toIn) {
  wf.connections[fromName] = wf.connections[fromName] || { main: [] };
  const mains = wf.connections[fromName].main;
  while (mains.length <= fromOut) mains.push([]);
  mains[fromOut].push({ node: toName, type: 'main', index: toIn === undefined ? 0 : toIn });
}
function removeConn(wf, fromName, fromOut, toName) {
  const mains = wf.connections[fromName] && wf.connections[fromName].main;
  if (!mains || !mains[fromOut]) return;
  mains[fromOut] = mains[fromOut].filter((c) => c.node !== toName);
}
function rewire(wf, fromName, fromOut, oldTarget, newTarget, newIn) {
  removeConn(wf, fromName, fromOut, oldTarget);
  addConn(wf, fromName, fromOut, newTarget, newIn);
}
function replaceOnce(str, search, replacement, label) {
  if (str.indexOf(search) === -1) throw new Error('Trecho nao encontrado (' + label + ')');
  return str.replace(search, replacement);
}

const POSTGRES_CRED = { postgres: { id: 'ENVPDFLOCKPG01', name: 'Postgres (lock/registro)' } };
const DRIVE_CRED = { googleDriveOAuth2Api: { id: 'jf47z7YDNClFi4Uk', name: 'Google Drive account' } };

function patchNode012(wf) {
  const n = byName(wf, '[SEL] Selecionar PDFs');
  let code = n.parameters.jsCode;
  code = replaceOnce(code,
    `function categoriaDe(pastaId) {\r\n  const caminho = [];\r\n  let id = pastaId;\r\n  for (let n = 0; n < 10 && id && id !== cfg.pasta_raiz_id; n++) {\r\n    const p = pastas[id];\r\n    if (!p) return { categoria: '', caminho: '(pasta fora da arvore)' };\r\n    caminho.unshift(p.nome);\r\n    if (p.pai === cfg.pasta_raiz_id) return { categoria: p.nome, caminho: caminho.join(' / ') };\r\n    id = p.pai;\r\n  }\r\n  return { categoria: '', caminho: '(raiz)' };\r\n}`,
    `function categoriaDe(pastaId) {\r\n  const caminho = [];\r\n  let id = pastaId;\r\n  for (let n = 0; n < 10 && id && id !== cfg.pasta_raiz_id; n++) {\r\n    const p = pastas[id];\r\n    if (!p) return { categoriaId: '', categoria: '', caminho: '(pasta fora da arvore)' };\r\n    caminho.unshift(p.nome);\r\n    if (p.pai === cfg.pasta_raiz_id) return { categoriaId: id, categoria: p.nome, caminho: caminho.join(' / ') };\r\n    id = p.pai;\r\n  }\r\n  return { categoriaId: '', categoria: '', caminho: '(raiz)' };\r\n}`,
    'n012 categoriaDe');
  code = replaceOnce(code,
    `  const cat = categoriaDe(pastaId);\r\n  const modelo = cfg.modelos[nomePasta(cat.categoria)] || null;\r\n  let modeloErro = '';\r\n  if (!cat.categoria) modeloErro = 'PASTA_SEM_MODELO: o PDF esta fora das pastas de categoria (' + cat.caminho + ')';\r\n  else if (!modelo) modeloErro = 'PASTA_SEM_MODELO: a pasta \"' + cat.categoria + '\" nao tem template configurado';\r\n  else if (!modelo.template_id) modeloErro = 'SEM_TEMPLATE: ' + (modelo.motivo || 'pasta sem template');\r\n\r\n  const comum = {\r\n    file_id: f.id, versao, arquivo: txt(f.name), pasta: cat.caminho, categoria: cat.categoria, pasta_id: pastaId,`,
    `  const cat = categoriaDe(pastaId);\r\n  const modelo = cat.categoriaId ? (cfg.modelos[cat.categoriaId] || null) : null;\r\n  let modeloErro = '';\r\n  if (!cat.categoria) modeloErro = 'PASTA_SEM_MODELO: o PDF esta fora das pastas de categoria (' + cat.caminho + ')';\r\n  else if (!modelo) modeloErro = 'PASTA_SEM_MODELO: a pasta \"' + cat.categoria + '\" (id ' + cat.categoriaId + ') nao esta no mapa de templates';\r\n  else if (!modelo.template_id) modeloErro = 'SEM_TEMPLATE: ' + (modelo.motivo || 'pasta sem template');\r\n\r\n  const comum = {\r\n    file_id: f.id, versao, arquivo: txt(f.name), pasta: cat.caminho, categoria: cat.categoria, categoria_id: cat.categoriaId, pasta_id: pastaId,`,
    'n012 comum');
  n.parameters.jsCode = code;
}

function patchNode007(wf) {
  const n = byName(wf, '[DRIVE] Consulta nível 2');
  n.parameters.jsCode = replaceOnce(n.parameters.jsCode,
    `const nivel1 = itens.map((i) => i.json).filter((f) => f && f.id && ID_DRIVE.test(f.id));`,
    `const nivel1 = itens.map((i) => i.json).filter((f) => f && f.id && ID_DRIVE.test(f.id) && f.id !== cfg.pasta_enviados_id && f.id !== cfg.pasta_links_id);`,
    'n007');
}

function patchNode009(wf) {
  const n = byName(wf, '[DRIVE] Consulta de PDFs');
  n.parameters.jsCode = replaceOnce(n.parameters.jsCode,
    `const registrar = (f) => {\n  if (!f || !f.id || !ID_DRIVE.test(f.id) || f.id === cfg.pasta_raiz_id) return;\n  pastas[f.id] = { nome: txt(f.name), pai: (Array.isArray(f.parents) && f.parents[0]) || '' };\n};`,
    `const registrar = (f) => {\n  if (!f || !f.id || !ID_DRIVE.test(f.id) || f.id === cfg.pasta_raiz_id || f.id === cfg.pasta_enviados_id || f.id === cfg.pasta_links_id) return;\n  pastas[f.id] = { nome: txt(f.name), pai: (Array.isArray(f.parents) && f.parents[0]) || '' };\n};`,
    'n009');
}

function patchNode040(wf) {
  const n = byName(wf, '[MAXBOT] Montar cadastro');
  n.parameters.jsCode = replaceOnce(n.parameters.jsCode,
    `if (!falha) {\n  const resp = corpoResposta($input.first().json);\n  if (resp.erro) falha = 'get_contact: ' + resp.erro;\n  else if (Number(resp.body.status) !== 1) falha = 'get_contact recusado: ' + umaLinha(resp.body.msg);\n  else {\n    const lista = Array.isArray(resp.body.data) ? resp.body.data : (resp.body.data ? [resp.body.data] : []);\n    contato = lista.find((c) => soDigitos(c.whatsapp) === envio.destino) || lista[0] || null;\n  }\n}`,
    `if (!falha) {\n  const resp = corpoResposta($input.first().json);\n  if (resp.erro) falha = 'get_contact: ' + resp.erro;\n  else if (Number(resp.body.status) !== 1) falha = 'get_contact recusado: ' + umaLinha(resp.body.msg);\n  else {\n    const lista = Array.isArray(resp.body.data) ? resp.body.data : (resp.body.data ? [resp.body.data] : []);\n    // Aceita SOMENTE correspondencia inequivoca (bater digito a digito com\n    // whatsapp OU mobile_phone). NUNCA usa lista[0] como fallback: um teste em\n    // 23/09/2026 achou contact_id 10656708 com whatsapp=554691359005 (formato\n    // antigo, 8 digitos locais) e mobile_phone=5546991359005 (9 digitos) - o\n    // MESMO numero em dois formatos. Sem bater exatamente com um dos campos,\n    // e tratado como divergencia e bloqueado, nunca adivinhado.\n    const bate = (c) => soDigitos(c.whatsapp) === envio.destino || soDigitos(c.mobile_phone) === envio.destino;\n    const candidatos = lista.filter(bate);\n    if (candidatos.length > 1) {\n      falha = 'CONTATO_AMBIGUO: get_contact devolveu ' + candidatos.length + ' contatos cujo whatsapp/mobile_phone bate com ' + envio.destino;\n    } else if (candidatos.length === 1) {\n      contato = candidatos[0];\n    } else if (lista.length) {\n      const formatos = lista.map((c) => 'id=' + c.id + ' whatsapp=' + txt(c.whatsapp) + ' mobile_phone=' + txt(c.mobile_phone)).join(' | ');\n      falha = 'CONTATO_DIVERGENTE: get_contact achou contato(s) para ' + envio.destino + ', mas nenhum bate digito a digito em whatsapp/mobile_phone (' + formatos + ')';\n    }\n    // lista vazia: sem contato existente -> contato fica null -> put_contact (novo)\n  }\n}`,
    'n040');
}

function patchNode042(wf, trava) {
  const n = byName(wf, '[MAXBOT] Montar envio');
  n.parameters.jsCode = replaceOnce(n.parameters.jsCode,
    `const modoTeste = lerBool('ENVPDF_MODO_TESTE', true);\nconst telTeste = normalizarTelefone(lerAmbiente('ENVPDF_TELEFONE_TESTE', '5546991359005'));\nconst telAlerta = normalizarTelefone(lerAmbiente('ENVPDF_TELEFONE_ALERTA', '5546991359005'));\nif (!falha && modoTeste && envio.contexto === 'cliente' && !(telTeste.ok && envio.destino === telTeste.numero)) {\n  falha = 'BLOQUEADO_PELO_MODO_TESTE: destino ' + envio.destino + ' nao e o telefone de teste';\n}`,
    `// Trava fixa desta COPIA do workflow (nao vem de variavel de ambiente - ver\n// [CFG] Configuração). Na copia de TESTE, telefone E contact_id do contato de teste\n// sao constantes do codigo: nenhuma variavel de ambiente (nem ENVPDF_MODO_TESTE=false,\n// nem ENVPDF_TELEFONE_TESTE) libera envio a outro destinatario. So a copia de PRODUCAO\n// le as variaveis de verdade.\nconst TRAVA_DE_COPIA = '${trava}';\nconst TESTE_TELEFONE_FIXO = '5546991359005';\nconst TESTE_CONTACT_ID_FIXO = '10656708';\nconst modoTesteEnv = lerBool('ENVPDF_MODO_TESTE', true);\nconst modoTeste = TRAVA_DE_COPIA === 'TESTE' ? true : modoTesteEnv;\nconst telTeste = normalizarTelefone(TRAVA_DE_COPIA === 'TESTE' ? TESTE_TELEFONE_FIXO : lerAmbiente('ENVPDF_TELEFONE_TESTE', '5546991359005'));\nconst telAlerta = normalizarTelefone(TRAVA_DE_COPIA === 'TESTE' ? TESTE_TELEFONE_FIXO : lerAmbiente('ENVPDF_TELEFONE_ALERTA', '5546991359005'));\nif (!falha && TRAVA_DE_COPIA === 'TESTE') {\n  if (envio.destino !== TESTE_TELEFONE_FIXO) {\n    falha = 'BLOQUEADO_PELA_COPIA_TESTE: destino ' + envio.destino + ' nao e o telefone do contato de teste';\n  } else if (String(contactId) !== TESTE_CONTACT_ID_FIXO) {\n    falha = 'BLOQUEADO_PELA_COPIA_TESTE: contact_id ' + contactId + ' nao e o contato de teste (' + TESTE_CONTACT_ID_FIXO + ')';\n  }\n}\nif (!falha && modoTeste && envio.contexto === 'cliente' && !(telTeste.ok && envio.destino === telTeste.numero)) {\n  falha = 'BLOQUEADO_PELO_MODO_TESTE: destino ' + envio.destino + ' nao e o telefone de teste (copia ' + TRAVA_DE_COPIA + ')';\n}`,
    'n042');
}

function patchNode038(wf, trava) {
  const n = byName(wf, '[MAXBOT] Montar get_contact');
  n.parameters.jsCode = replaceOnce(n.parameters.jsCode,
    `if (!falha && !normalizarTelefone(destino).ok) falha = 'DESTINO_INVALIDO: "' + destino + '"';`,
    `if (!falha && !normalizarTelefone(destino).ok) falha = 'DESTINO_INVALIDO: "' + destino + '"';\n// Copia de TESTE: nada (nem get_contact/put_contact/set_contact) toca outro contato que nao o de teste.\nconst TRAVA_DE_COPIA = '${trava}';\nconst TESTE_TELEFONE_FIXO = '5546991359005';\nif (!falha && TRAVA_DE_COPIA === 'TESTE' && destino !== TESTE_TELEFONE_FIXO) {\n  falha = 'BLOQUEADO_PELA_COPIA_TESTE: destino ' + destino + ' nao e o telefone do contato de teste';\n}`,
    'n038');
}

function patchNode034(wf) {
  const n = byName(wf, '[MAXBOT] Mensagem ao cliente');
  let code = n.parameters.jsCode;
  code = replaceOnce(code,
    `const D = $('[CTRL] Decidir').first().json;\nconst share = $input.first().json || {};`,
    `const D = $('[CTRL] Decidir').first().json;\nconst copia = $('[DRIVE] Copiar para envio').first().json || {};\nconst share = $input.first().json || {};`,
    'n034 vars');
  code = replaceOnce(code,
    `    info1: 'https://drive.google.com/file/d/' + D.file_id + '/view?usp=sharing',`,
    `    info1: 'https://drive.google.com/file/d/' + copia.id + '/view?usp=sharing',`,
    'n034 info1');
  code = replaceOnce(code,
    `// ============================================================\n// [MAXBOT] Mensagem ao cliente\n// Monta o pedido de envio ao cliente. O PDF vai como link do ARQUIVO\n// ORIGINAL do Drive na tag [INFO1] do template da pasta (o canal e WABA:\n// fora da janela de 24h so template passa, e nenhum template da conta tem\n// cabecalho de documento). O link acabou de ser liberado para leitura.\n// ============================================================`,
    `// ============================================================\n// [MAXBOT] Mensagem ao cliente\n// Monta o pedido de envio ao cliente. O PDF vai como link de uma COPIA\n// dedicada (pasta privada ENVPDF_PASTA_LINKS_ID), nao do arquivo original:\n// o original nunca e compartilhado, so a copia recebe leitura publica por\n// link (ver [DRIVE] Copiar para envio / [DRIVE] Liberar link).\n// ============================================================`,
    'n034 comment');
  n.parameters.jsCode = code;
}

function patchNode047(wf) {
  const n = byName(wf, '[CTRL] Resultado do cliente');
  n.parameters.jsCode = replaceOnce(n.parameters.jsCode,
    `const registro = linhaRegistro(e.registro, {\n  estado,\n  maxbot_status: r.maxbot_status === undefined ? '' : r.maxbot_status,\n  maxbot_msg: r.msg || '',\n  maxbot_id: r.id || '',\n  erro: estado === 'ACEITO' ? '' : r.erro,\n  atualizado_em: agoraISO()\n});`,
    `const registro = linhaRegistro(e.registro, {\n  estado,\n  maxbot_status: r.maxbot_status === undefined ? '' : r.maxbot_status,\n  maxbot_msg: r.msg || '',\n  maxbot_id: r.id || '',\n  erro: estado === 'ACEITO' ? '' : r.erro,\n  // So a copia de PRODUCAO arquiva: no modo TESTE o original nunca e movido (arquivamento fica vazio,\n  // e assim o [ARQ] de uma execucao de producao tambem nunca move o que foi "aceito" so em teste).\n  arquivamento: estado === 'ACEITO' && txt(e.registro && e.registro.modo) === 'PRODUCAO' ? 'PENDENTE' : '',\n  atualizado_em: agoraISO()\n});`,
    'n047');
}

function addArquivamentoColumnToDataTableNodes(wf) {
  const schemaSample = clone(byName(wf, '[CTRL] Gravar resultado').parameters.columns.schema[0]);
  const novaColSchema = Object.assign({}, schemaSample, { id: 'arquivamento', displayName: 'arquivamento' });
  const alvos = ['[CTRL] Reservar envio', '[CTRL] Gravar sem aviso', '[CTRL] Gravar resultado', '[CTRL] Gravar aviso', '[ERRO] Gravar aviso geral'];
  for (const nome of alvos) {
    const n = byName(wf, nome);
    n.parameters.columns.value.arquivamento = '={{ $json.registro.arquivamento }}';
    n.parameters.columns.schema.push(clone(novaColSchema));
  }
  // [CTRL] Garantir tabela: adiciona a coluna na criacao da tabela
  const garantir = byName(wf, '[CTRL] Garantir tabela');
  garantir.parameters.columns.column.push({ name: 'arquivamento' });
}

function patchSwitchAcao(wf) {
  // [CTRL] Ação já tem 4 saídas pelo padrão do node (numberOutputs default = 4): nada a alterar.
}

function patchLiberarLinkECopia(wf) {
  const copiar = {
    parameters: {
      operation: 'copy',
      fileId: { __rl: true, mode: 'id', value: "={{ $('[CTRL] Decidir').first().json.file_id }}" },
      name: "={{ 'ENVIO - ' + $('[CTRL] Decidir').first().json.arquivo }}",
      sameFolder: false,
      driveId: { __rl: true, mode: 'list', value: 'My Drive' },
      folderId: { __rl: true, mode: 'id', value: "={{ $('[CFG] Configuração').first().json.pasta_links_id }}" },
      options: {}
    },
    id: 'n101',
    name: '[DRIVE] Copiar para envio',
    type: 'n8n-nodes-base.googleDrive',
    typeVersion: 3,
    position: [6280, -208],
    alwaysOutputData: true,
    credentials: clone(DRIVE_CRED),
    onError: 'continueRegularOutput'
  };
  wf.nodes.push(copiar);

  const liberar = byName(wf, '[DRIVE] Liberar link');
  liberar.parameters.fileId.value = '={{ $json.id }}';
  liberar.parameters.permissionsUi.permissionsValues.allowFileDiscovery = false;

  rewire(wf, '[CTRL] Reservar envio', 0, '[DRIVE] Liberar link', '[DRIVE] Copiar para envio', 0);
  addConn(wf, '[DRIVE] Copiar para envio', 0, '[DRIVE] Liberar link', 0);
}

function patchLock(wf) {
  const garantirLock = {
    parameters: {
      operation: 'executeQuery',
      query: 'CREATE TABLE IF NOT EXISTS envio_pdf_lock (\n  destino TEXT PRIMARY KEY,\n  chave TEXT,\n  execucao TEXT,\n  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()\n);',
      options: {}
    },
    id: 'n112', name: '[LOCK] Garantir tabela', type: 'n8n-nodes-base.postgres', typeVersion: 2.5,
    position: [560, 300], credentials: clone(POSTGRES_CRED), onError: 'continueRegularOutput'
  };
  const reservar = {
    parameters: {
      operation: 'executeQuery',
      query: "INSERT INTO envio_pdf_lock (destino, chave, execucao, criado_em)\nVALUES ($1, $2, $3, now())\nON CONFLICT (destino) DO UPDATE\n  SET chave = EXCLUDED.chave, execucao = EXCLUDED.execucao, criado_em = now()\n  WHERE envio_pdf_lock.criado_em < now() - ($4 || ' minutes')::interval\nRETURNING destino, $5::text AS payload;",
      options: {
        // Sem $('[CFG] Configuração'): este no tambem roda na execucao do fluxo de ERRO, onde [CFG] nao existe.
        // O 5o parametro devolve o item original ($json) pela propria consulta: o node Postgres SUBSTITUI
        // o item pela linha retornada, entao [LOCK] Restaurar item recompoe o item para o resto do fluxo.
        queryReplacement: "={{ [ $json.envio.destino, ($json.registro && $json.registro.chave) || '', String($execution.id), String($env.ENVPDF_ENVIO_TRAVADO_MINUTOS || 30), $json ] }}"
      }
    },
    id: 'n102', name: '[LOCK] Reservar destino', type: 'n8n-nodes-base.postgres', typeVersion: 2.5,
    position: [6832, 96], alwaysOutputData: true, credentials: clone(POSTGRES_CRED), onError: 'continueRegularOutput'
  };
  const adquirido = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{
          id: 'lockok',
          leftValue: "={{ $json.lock_adquirido === true }}",
          rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true }
        }],
        combinator: 'and'
      },
      options: {}
    },
    id: 'n103', name: '[LOCK] Adquirido?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [7040, 96]
  };
  const duplicado = {
    parameters: {
      jsCode: "// [LOCK] Nao adquirido\n// Chega aqui quando [LOCK] Reservar destino NAO devolveu o destino:\n//  - o Postgres respondeu com erro  -> falha de infraestrutura: PARA a execucao (o aviso de erro geral avisa o operador);\n//  - lock ja em uso por outra execucao (DUPLICADO) -> nada e enviado nem gravado:\n//      * no laco de PDFs segue para o proximo arquivo;\n//      * no fluxo de ERRO (aviso geral) simplesmente termina.\nconst e = $input.first().json || {};\nif (e.error) {\n  const er = e.error;\n  throw new Error('Falha ao reservar o lock de envio no Postgres: ' + String((er && (er.message || er.description)) || JSON.stringify(er)).slice(0, 300));\n}\nconst contexto = e.envio && e.envio.contexto;\nif (contexto === 'erro_geral') return [];\nreturn [{ json: Object.assign({}, e, { lock: 'DUPLICADO_IGNORADO' }) }];\n"
    },
    id: 'n105', name: '[LOCK] Não adquirido', type: 'n8n-nodes-base.code', typeVersion: 2, position: [7040, 320]
  };
  const liberar = {
    parameters: {
      operation: 'executeQuery',
      query: 'DELETE FROM envio_pdf_lock WHERE destino = $1;',
      options: { queryReplacement: '={{ [ $json.envio.destino ] }}' }
    },
    id: 'n104', name: '[LOCK] Liberar destino', type: 'n8n-nodes-base.postgres', typeVersion: 2.5,
    position: [8480, 0], alwaysOutputData: true, credentials: clone(POSTGRES_CRED), onError: 'continueRegularOutput'
  };
  const restaurar = {
    parameters: {
      jsCode: "// [LOCK] Restaurar item (apos reservar)\n// O node Postgres troca o item de entrada pela linha do RETURNING. Aqui o item ORIGINAL\n// ({envio, registro, ...}) volta, com a marca lock_adquirido:\n//  - linha devolvida (destino + payload)  -> lock ADQUIRIDO, item = payload;\n//  - erro do Postgres                      -> lock_adquirido=false e o erro segue adiante;\n//  - nenhuma linha (alwaysOutputData devolve o item de entrada) -> lock EM USO por outra execucao.\nconst r = $input.first().json || {};\nif (r.error) return [{ json: { error: r.error, lock_adquirido: false } }];\nif (r.destino && r.payload) {\n  const original = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;\n  return [{ json: Object.assign({}, original, { lock_adquirido: true }) }];\n}\nreturn [{ json: Object.assign({}, r, { lock_adquirido: false }) }];\n"
    },
    id: 'n113', name: '[LOCK] Restaurar item', type: 'n8n-nodes-base.code', typeVersion: 2, position: [6936, 96]
  };
  const retomar = {
    parameters: {
      jsCode: "// [LOCK] Retomar avaliacao\n// [LOCK] Liberar destino (DELETE) devolve so {success:true}. O resultado do envio que segue\n// o fluxo e o de [MAXBOT] Avaliar envio, que sempre roda antes da liberacao (cliente, alerta e erro geral).\nreturn [{ json: $('[MAXBOT] Avaliar envio').first().json }];\n"
    },
    id: 'n114', name: '[LOCK] Retomar avaliação', type: 'n8n-nodes-base.code', typeVersion: 2, position: [8536, 0]
  };
  wf.nodes.push(garantirLock, reservar, restaurar, adquirido, duplicado, liberar, retomar);

  // Garantir tabela lock roda logo apos garantir a data table normal
  rewire(wf, '[CTRL] Garantir tabela', 0, '[DRIVE] Subpastas nível 1', '[LOCK] Garantir tabela', 0);
  addConn(wf, '[LOCK] Garantir tabela', 0, '[DRIVE] Subpastas nível 1', 0);

  // Os 3 produtores de "envio" passam a alimentar o lock antes do get_contact
  rewire(wf, '[MAXBOT] Mensagem ao cliente', 0, '[MAXBOT] Montar get_contact', '[LOCK] Reservar destino', 0);
  rewire(wf, '[ALERTA] Preparar aviso', 0, '[MAXBOT] Montar get_contact', '[LOCK] Reservar destino', 0);
  rewire(wf, '[ERRO] Decidir aviso', 0, '[MAXBOT] Montar get_contact', '[LOCK] Reservar destino', 0);
  addConn(wf, '[LOCK] Reservar destino', 0, '[LOCK] Restaurar item', 0);
  addConn(wf, '[LOCK] Restaurar item', 0, '[LOCK] Adquirido?', 0);
  addConn(wf, '[LOCK] Adquirido?', 0, '[MAXBOT] Montar get_contact', 0);
  addConn(wf, '[LOCK] Adquirido?', 1, '[LOCK] Não adquirido', 0);
  addConn(wf, '[LOCK] Não adquirido', 0, '[FIM] Próximo arquivo', 0);

  // Libera o lock logo apos avaliar o envio, antes de rotear por contexto
  rewire(wf, '[MAXBOT] Avaliar envio', 0, '[MAXBOT] Origem do envio', '[LOCK] Liberar destino', 0);
  addConn(wf, '[LOCK] Liberar destino', 0, '[LOCK] Retomar avaliação', 0);
  addConn(wf, '[LOCK] Retomar avaliação', 0, '[MAXBOT] Origem do envio', 0);
}

function upsertRegistroNode(base, id, name, position) {
  const n = clone(base);
  n.id = id;
  n.name = name;
  n.position = position;
  return n;
}

function patchArquivamento(wf) {
  const gravarResultadoBase = byName(wf, '[CTRL] Gravar resultado');

  const mover = {
    parameters: {
      operation: 'move',
      fileId: { __rl: true, mode: 'id', value: "={{ $('[CTRL] Resultado do cliente').first().json.registro.file_id }}" },
      driveId: { __rl: true, mode: 'list', value: 'My Drive' },
      folderId: { __rl: true, mode: 'id', value: "={{ $('[CFG] Configuração').first().json.pasta_enviados_id }}" }
    },
    id: 'n106', name: '[DRIVE] Mover para ENVIADOS', type: 'n8n-nodes-base.googleDrive', typeVersion: 3,
    position: [9472, -320], alwaysOutputData: true, credentials: clone(DRIVE_CRED), onError: 'continueRegularOutput'
  };
  const registrar = {
    parameters: {
      jsCode: "// [DRIVE] Registrar arquivamento\n// So chega aqui quando o estado ja e ACEITO. Sucesso: arquivamento=OK.\n// Falha ao mover: arquivamento continua PENDENTE (a proxima execucao tenta\n// so o movimento, sem reenviar - ver [ARQ] Buscar pendentes).\nconst base = $('[CTRL] Resultado do cliente').first().json.registro;\nconst mov = $input.first().json || {};\nconst falhou = !!mov.error;\nreturn [{ json: { registro: Object.assign({}, base, {\n  arquivamento: falhou ? 'PENDENTE' : 'OK',\n  erro: falhou ? (base.erro ? base.erro + ' | ARQUIVAMENTO_PENDENTE: ' : 'ARQUIVAMENTO_PENDENTE: ') +\n    (mov.error.message || mov.error.description || JSON.stringify(mov.error)) : base.erro\n}) } }];\n"
    },
    id: 'n107', name: '[DRIVE] Registrar arquivamento', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [9472, -420]
  };
  const gravar = upsertRegistroNode(gravarResultadoBase, 'n108', '[DRIVE] Gravar arquivamento', [9472, -520]);
  gravar.parameters.filters.conditions[0].keyValue = '={{ $json.registro.chave }}';

  wf.nodes.push(mover, registrar, gravar);
  // Porteiro: so PRODUCAO move o original. Em TESTE, ACEITO segue direto para a pausa, sem tocar no Drive.
  const soProd = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{
          id: 'modoprod',
          leftValue: "={{ $('[CTRL] Resultado do cliente').first().json.registro.modo === 'PRODUCAO' }}",
          rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true }
        }],
        combinator: 'and'
      },
      options: {}
    },
    id: 'n115', name: '[DRIVE] Só arquiva em produção?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [9360, -320]
  };
  wf.nodes.push(soProd);
  rewire(wf, '[CTRL] Aceito?', 0, '[FIM] Pausa entre envios', '[DRIVE] Só arquiva em produção?', 0);
  addConn(wf, '[DRIVE] Só arquiva em produção?', 0, '[DRIVE] Mover para ENVIADOS', 0);
  addConn(wf, '[DRIVE] Só arquiva em produção?', 1, '[FIM] Pausa entre envios', 0);
  addConn(wf, '[DRIVE] Mover para ENVIADOS', 0, '[DRIVE] Registrar arquivamento', 0);
  addConn(wf, '[DRIVE] Registrar arquivamento', 0, '[DRIVE] Gravar arquivamento', 0);
  addConn(wf, '[DRIVE] Gravar arquivamento', 0, '[FIM] Pausa entre envios', 0);
}

function patchArqPendentes(wf) {
  const buscar = {
    parameters: {
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'envio_pdf_registro' },
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'estado', keyValue: 'ACEITO' },
        { keyName: 'arquivamento', keyValue: 'PENDENTE' },
        { keyName: 'modo', keyValue: 'PRODUCAO' }
      ] },
      returnAll: true
    },
    id: 'n108b', name: '[ARQ] Buscar pendentes', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [560, 320], alwaysOutputData: true
  };
  const haPendentes = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{
          id: 'haarq',
          leftValue: '={{ $json.chave }}', rightValue: '',
          operator: { type: 'string', operation: 'exists', singleValue: true }
        }],
        combinator: 'and'
      },
      options: {}
    },
    id: 'n109', name: '[ARQ] Há pendentes?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [784, 320]
  };
  const moverPendente = {
    parameters: {
      operation: 'move',
      fileId: { __rl: true, mode: 'id', value: '={{ $json.file_id }}' },
      driveId: { __rl: true, mode: 'list', value: 'My Drive' },
      folderId: { __rl: true, mode: 'id', value: "={{ $('[CFG] Configuração').first().json.pasta_enviados_id }}" }
    },
    id: 'n110', name: '[ARQ] Mover pendente', type: 'n8n-nodes-base.googleDrive', typeVersion: 3,
    position: [1008, 240], alwaysOutputData: true, credentials: clone(DRIVE_CRED), onError: 'continueRegularOutput'
  };
  const gravarPendente = {
    parameters: {
      jsCode: "// [ARQ] Preparar gravação\n// Roda uma vez para TODOS os itens (varias linhas PENDENTE podem chegar juntas).\n// Junta cada linha original (antes do move) com o resultado do move dela.\nconst antes = $('[ARQ] Buscar pendentes').all();\nconst movs = $input.all();\nreturn movs.map((mov, i) => {\n  const base = antes[i] ? antes[i].json : {};\n  const falhou = !!(mov.json && mov.json.error);\n  return { json: { registro: Object.assign({}, base, { arquivamento: falhou ? 'PENDENTE' : 'OK' }) } };\n});\n"
    },
    id: 'n111', name: '[ARQ] Preparar gravação', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1232, 240]
  };
  const gravar = upsertRegistroNode(byName(wf, '[CTRL] Gravar resultado'), 'n111b', '[ARQ] Gravar arquivamento', [1456, 240]);
  gravar.parameters.filters.conditions[0].keyValue = '={{ $json.registro.chave }}';

  wf.nodes.push(buscar, haPendentes, moverPendente, gravarPendente, gravar);

  rewire(wf, '[LOCK] Garantir tabela', 0, '[DRIVE] Subpastas nível 1', '[ARQ] Buscar pendentes', 0);
  addConn(wf, '[ARQ] Buscar pendentes', 0, '[ARQ] Há pendentes?', 0);
  addConn(wf, '[ARQ] Há pendentes?', 0, '[ARQ] Mover pendente', 0);
  addConn(wf, '[ARQ] Há pendentes?', 1, '[DRIVE] Subpastas nível 1', 0);
  addConn(wf, '[ARQ] Mover pendente', 0, '[ARQ] Preparar gravação', 0);
  addConn(wf, '[ARQ] Preparar gravação', 0, '[ARQ] Gravar arquivamento', 0);
  addConn(wf, '[ARQ] Gravar arquivamento', 0, '[DRIVE] Subpastas nível 1', 0);
}

module.exports = {
  patchNode012, patchNode007, patchNode009, patchNode040, patchNode042, patchNode034, patchNode047,
  addArquivamentoColumnToDataTableNodes, patchSwitchAcao, patchLiberarLinkECopia, patchLock, patchArquivamento,
  patchArqPendentes, patchNode038, byName, addConn, removeConn, rewire, clone
};
