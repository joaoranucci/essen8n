const fs = require('fs');
const path = require('path');
const SCRATCH = __dirname;
const base = require('./transform.js');
const t2 = require('./transform2.js');

function crypto_uuid() {
  // uuid v4 simples, sem depender do modulo crypto global do n8n sandbox
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function buildVariant(trava) {
  const wf = base.clone(base.ORIGINAL);
  base.patchSharedPrelude(wf);
  base.byName(wf, '[CFG] Configuração').parameters.jsCode = base.buildCfgCode(trava);

  t2.patchNode007(wf);
  t2.patchNode009(wf);
  t2.patchNode012(wf);
  t2.patchNode040(wf);
  t2.patchNode042(wf, trava);
  t2.patchNode038(wf, trava);
  t2.patchSwitchAcao(wf);

  // Ordem importa: adicionar a coluna "arquivamento" aos nos de dataTable
  // ANTES de clona-los para os novos nos de arquivamento.
  t2.addArquivamentoColumnToDataTableNodes(wf);

  t2.patchLiberarLinkECopia(wf);
  t2.patchNode034(wf);
  t2.patchNode047(wf);
  t2.patchLock(wf);
  t2.patchArquivamento(wf);
  t2.patchArqPendentes(wf);

  if (trava === 'TESTE') {
    wf.name = 'TESTE - envio PDF (webhook local, sem agendamento)';
    wf.id = 'ENVPDFTSTWH001';
    wf.active = false;
    wf.settings.errorWorkflow = 'ENVPDFTSTWH001';
  } else {
    wf.name = 'PRODUCAO - envio PDF (webhook local, sem agendamento)';
    wf.id = 'ENVPDFPRODWH001';
    wf.active = false; // sempre comeca desativado - so o operador ativa depois de aprovar
    wf.settings.errorWorkflow = 'ENVPDFPRODWH001';
    const webhook = base.byName(wf, 'Webhook de teste');
    webhook.name = 'Webhook de producao';
    webhook.parameters.path = 'envpdf-prod-8c41d2f7a9be';
    webhook.webhookId = '3f6b1c52-7d0e-4a8b-9c15-e2a4b7d90f31';
    // atualiza a chave do webhook nas conexoes (o nome mudou)
    wf.connections['Webhook de producao'] = wf.connections['Webhook de teste'];
    delete wf.connections['Webhook de teste'];
  }
  wf.versionId = require('crypto').createHash('md5').update(JSON.stringify(wf.nodes) + JSON.stringify(wf.connections)).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5');

  return wf;
}

function validar(wf, label) {
  const nomes = new Set(wf.nodes.map((n) => n.name));
  const ids = new Set();
  let erros = 0;
  for (const n of wf.nodes) {
    if (ids.has(n.id)) { console.log('[' + label + '] ID DUPLICADO:', n.id); erros++; }
    ids.add(n.id);
  }
  for (const [from, out] of Object.entries(wf.connections)) {
    if (!nomes.has(from)) { console.log('[' + label + '] conexao sai de no inexistente:', from); erros++; }
    for (const branch of (out.main || [])) {
      for (const c of (branch || [])) {
        if (!nomes.has(c.node)) { console.log('[' + label + '] conexao aponta para no inexistente:', from, '->', c.node); erros++; }
      }
    }
  }
  // todo no (exceto triggers) deve ter pelo menos uma conexao de entrada
  const TRIGGERS = new Set(['Webhook de teste', 'Webhook de producao', 'Execução manual', 'Erro na execução']);
  const temEntrada = new Set();
  for (const out of Object.values(wf.connections)) {
    for (const branch of (out.main || [])) for (const c of (branch || [])) temEntrada.add(c.node);
  }
  for (const n of wf.nodes) {
    if (!TRIGGERS.has(n.name) && !temEntrada.has(n.name)) { console.log('[' + label + '] no orfao (sem entrada):', n.name); erros++; }
  }
  // syntax-check dos code nodes
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.code' && typeof n.parameters.jsCode === 'string') {
      try { new Function('$env', '$execution', '$input', '$', '$itemIndex', n.parameters.jsCode); }
      catch (e) { console.log('[' + label + '] SYNTAX ERROR em', n.name, ':', e.message); erros++; }
    }
  }
  console.log('[' + label + ']', wf.nodes.length, 'nos,', erros, 'erro(s) de validacao');
  return erros;
}

const testeWf = buildVariant('TESTE');
const prodWf = buildVariant('PRODUCAO');

const e1 = validar(testeWf, 'TESTE');
const e2 = validar(prodWf, 'PRODUCAO');

const outDir = path.join(SCRATCH, '..', '..', 'workflows');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
fs.writeFileSync(path.join(outDir, 'ENVIO-PDF-TESTE.json'), JSON.stringify(testeWf, null, 2));
fs.writeFileSync(path.join(outDir, 'ENVIO-PDF-PRODUCAO.json'), JSON.stringify(prodWf, null, 2));
console.log('Escrito em', outDir);
console.log('TOTAL ERROS:', e1 + e2);
