// Testes de logica: executa o jsCode REAL dos nos (do workflow final) com $-helpers simulados.
const fs = require('fs');
const path = require('path');
const D = __dirname;
const WF = {
  TESTE: JSON.parse(fs.readFileSync(path.join(D, '..', 'workflows', 'ENVIO-PDF-TESTE.json'), 'utf8')),
  PRODUCAO: JSON.parse(fs.readFileSync(path.join(D, '..', 'workflows', 'ENVIO-PDF-PRODUCAO.json'), 'utf8'))
};

let pass = 0, fail = 0;
function check(desc, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + desc); }
  else { fail++; console.log('  FAIL  ' + desc + (extra ? '  -> ' + JSON.stringify(extra) : '')); }
}

const mk = (items) => ({ first: () => items[0], last: () => items[items.length - 1], all: () => items, item: items[0] });
function runNode(variant, name, { nodes = {}, input = [{ json: {} }], env = {}, envBlocked = false } = {}) {
  const code = WF[variant].nodes.find((n) => n.name === name).parameters.jsCode;
  const $ = (n) => { if (!(n in nodes)) throw new Error('sem dados do no ' + n); return mk(nodes[n]); };
  const $input = mk(input);
  const $env = new Proxy({}, { get: (_, k) => { if (envBlocked) throw new Error('access to env vars denied'); return env[k]; } });
  const $execution = { id: 'EXEC1' };
  return new Function('$', '$input', '$env', '$execution', code)($, $input, $env, $execution);
}
const J = (o) => [{ json: o }];

// ---------- CNPJ validos ----------
function cnpjDV(base12) {
  const dv = (b) => { const p = b.length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; let s = 0; for (let i = 0; i < b.length; i++) s += Number(b[i]) * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(base12); const d2 = dv(base12 + d1); return base12 + d1 + d2;
}
const CNPJ_A = cnpjDV('112223330001');   // cliente A
const CNPJ_B = cnpjDV('998887770001');   // cliente B
const CNPJ_C = cnpjDV('554443330001');   // fora da planilha
const DOCLA = '41491198000130';
const fmt = (c) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

const ENV_OK = { ENVPDF_MODO_TESTE: 'true', ENVPDF_TELEFONE_TESTE: '5546991359005', ENVPDF_TELEFONE_ALERTA: '5546991359005',
  ENVPDF_PASTA_LINKS_ID: '1LinksFolderPrivadaXX', ENVPDF_PASTA_ENVIADOS_ID: '1w1OyGbL6pcv6-IRH0Ka2Yg9Y5JJwNcec' };

const ROOT = '1py_-XOuvDYGNDp0LRDMYtQWQTK5NO41_';
const ENVIADOS = '1w1OyGbL6pcv6-IRH0Ka2Yg9Y5JJwNcec';
const F = { FGTS: '1i4Pw_DvHEWBSLH3SoiavHgp5psceDyQ6', COB1: '150n_5cpTtH8PyGSfhAwRWzuuiXS2EA8K', COB2: '1elHfAGdeA6oXDnggmCxlh_GQ5pxeYnfZ',
  HON: '1bq9phqCZz_YjP82YCXqlITd7tLH7bHVl', PARC: '1Z_qIyNpMLHRL08ukwd6Jx2K2OeEJ1BhN', CANC: '143ffyNr63M0kcTk7VwrWK_MFYVVMkCXy' };

// =====================================================================
console.log('\n[1] [CFG] Configuracao');
let cfgT, cfgP;
{
  cfgT = runNode('TESTE', '[CFG] Configuração', { env: ENV_OK })[0].json;
  check('mapa por ID tem as 13 pastas', Object.keys(cfgT.modelos).length === 13, Object.keys(cfgT.modelos).length);
  const esperado = { [F.COB1]: 54566, [F.HON]: 54622, [F.PARC]: 54562, '1zIY4ayahlosNMFIi4EhsQTAhmI0GO4ZW': 54558, '1__OPZmwSpbgpPKDT2hyL8thrZ0SVMS3m': 54572,
    [F.FGTS]: 54556, '1mA-FgNeJH-G_bIC2vFiy71Qj29nci9bm': 54559, '1gL8hQJQqaZ_eFW_nmgOvuNEm0r8BgUB5': 54560, '1X-CA4faTv9rn8wqHKwwpJhfEMcZH7Jxz': 54561,
    '1NSwEt6pOS24sDN7OC1opEeijIemH2Jlg': 54620, '1qtvyMaLmTU7TQLkdMwot1m3DNa4hjvsN': 55004 };
  check('IDs de pasta -> template conferem com a tabela do operador', Object.entries(esperado).every(([id, t]) => cfgT.modelos[id] && cfgT.modelos[id].template_id === t));
  check('COBRANCA 2 sem template (54581 exige 2 PDFs) e nunca aponta 54566', cfgT.modelos[F.COB2].template_id === null && !JSON.stringify(cfgT.modelos[F.COB2]).includes('"template_id":54566'));
  check('CANCELAMENTOS sem template', cfgT.modelos[F.CANC].template_id === null);
  check('54563/54564 (parcelamento 2/3 links) nao usados', !JSON.stringify(cfgT.modelos).includes('5456'+'3') && !JSON.stringify(cfgT.modelos).includes('5456'+'4'));
  check('cfg TESTE: modo TESTE', cfgT.modo === 'TESTE' && cfgT.trava_de_copia === 'TESTE');
  const cfgTf = runNode('TESTE', '[CFG] Configuração', { env: Object.assign({}, ENV_OK, { ENVPDF_MODO_TESTE: 'false' }) })[0].json;
  check('cfg TESTE continua TESTE mesmo com ENVPDF_MODO_TESTE=false', cfgTf.modo === 'TESTE' && cfgTf.modo_teste === true);
  cfgP = runNode('PRODUCAO', '[CFG] Configuração', { env: Object.assign({}, ENV_OK, { ENVPDF_MODO_TESTE: 'false' }) })[0].json;
  check('cfg PRODUCAO com MODO_TESTE=false vira PRODUCAO', cfgP.modo === 'PRODUCAO');
  let msg = ''; try { runNode('TESTE', '[CFG] Configuração', { env: ENV_OK, envBlocked: true }); } catch (e) { msg = e.message; }
  check('env bloqueado pelo n8n -> erro claro (nao cai em silencio nos padroes)', /N8N_BLOCK_ENV_ACCESS_IN_NODE/.test(msg), msg);
  msg = ''; try { runNode('TESTE', '[CFG] Configuração', { env: Object.assign({}, ENV_OK, { ENVPDF_PASTA_LINKS_ID: '' }) }); } catch (e) { msg = e.message; }
  check('sem ENVPDF_PASTA_LINKS_ID -> recusa rodar', /PASTA_LINKS_ID/.test(msg), msg);
}

// =====================================================================
console.log('\n[2] Descoberta de PDFs: ENVIADOS excluida');
{
  const nivel1 = [{ id: F.FGTS, name: 'FGTS' }, { id: ENVIADOS, name: 'ENVIADOS' }, { id: F.CANC, name: 'CANCELAMENTOS' }];
  const q2 = runNode('TESTE', '[DRIVE] Consulta nível 2', { nodes: { '[CFG] Configuração': J(cfgT) }, input: nivel1.map((f) => ({ json: f })) });
  const txt2 = q2.map((i) => i.json.q).join(' ');
  check('consulta nivel 2 NAO inclui ENVIADOS como pai', !txt2.includes(ENVIADOS) && txt2.includes(F.FGTS), txt2.slice(0, 120));
  const nivel2 = [{ id: 'subFGTS2026abcdefg', name: '2026-09', parents: [F.FGTS] }];
  const q3 = runNode('TESTE', '[DRIVE] Consulta de PDFs', { nodes: { '[CFG] Configuração': J(cfgT), '[DRIVE] Subpastas nível 1': nivel1.map((f) => ({ json: Object.assign({ parents: [ROOT] }, f) })) }, input: nivel2.map((f) => ({ json: f })) });
  const qq = q3[0].json;
  check('consulta de PDFs NAO busca dentro de ENVIADOS', !qq.q.includes(ENVIADOS), qq.q.slice(0, 200));
  check('consulta de PDFs busca nas categorias e subpastas', qq.q.includes(F.FGTS) && qq.q.includes('subFGTS2026abcdefg'));
  check('mapa de pastas nao contem ENVIADOS', !(ENVIADOS in qq.pastas));
  // LINKS_ENVIO_PDF (copias de link) tambem fora da descoberta, mesmo que alguem a coloque sob a raiz
  const LINKS = cfgT.pasta_links_id;
  const n1b = nivel1.concat([{ id: LINKS, name: 'LINKS_ENVIO_PDF' }]);
  const q2b = runNode('TESTE', '[DRIVE] Consulta nível 2', { nodes: { '[CFG] Configuração': J(cfgT) }, input: n1b.map((f) => ({ json: f })) });
  check('consulta nivel 2 NAO inclui LINKS_ENVIO_PDF como pai', !q2b.map((i) => i.json.q).join(' ').includes(LINKS));
  const q3b = runNode('TESTE', '[DRIVE] Consulta de PDFs', { nodes: { '[CFG] Configuração': J(cfgT), '[DRIVE] Subpastas nível 1': n1b.map((f) => ({ json: Object.assign({ parents: [ROOT] }, f) })) }, input: [{ json: { id: 'subXYZ0123456789', name: 's', parents: [LINKS] } }] });
  check('consulta de PDFs NAO busca em LINKS_ENVIO_PDF (nem no mapa de pastas)', !q3b[0].json.q.includes(LINKS) && !(LINKS in q3b[0].json.pastas), q3b[0].json.q.slice(0, 160));
}

// =====================================================================
console.log('\n[3] [SEL] Selecionar PDFs: template pela PASTA (id), categoria pelo ancestral');
let sel;
{
  const pastas = {
    [F.FGTS]: { nome: 'FGTS', pai: ROOT }, 'subFGTS2026abcdefg': { nome: '2026-09', pai: F.FGTS },
    [F.CANC]: { nome: 'CANCELAMENTOS', pai: ROOT }, [F.COB2]: { nome: 'COBRANCA 2 EM ATRASO', pai: ROOT },
    [F.COB1]: { nome: 'qualquer nome renomeado', pai: ROOT },   // renomeada: o ID ainda decide
    'pastaDesconhecida0001': { nome: 'OUTROS', pai: ROOT }
  };
  const mkf = (id, parent, t) => ({ json: { id, name: id + '.pdf', parents: [parent], md5Checksum: 'md5' + id, createdTime: t, size: '100', webViewLink: 'https://x/' + id } });
  const files = [mkf('fArquivoFGTS0001', F.FGTS, '2026-09-01T10:00:00Z'), mkf('fArquivoSubFGTS02', 'subFGTS2026abcdefg', '2026-09-01T10:01:00Z'),
    mkf('fArquivoRaiz0003', ROOT, '2026-09-01T10:02:00Z'), mkf('fArquivoCanc0004', F.CANC, '2026-09-01T10:03:00Z'),
    mkf('fArquivoCob20005', F.COB2, '2026-09-01T10:04:00Z'), mkf('fArquivoCob10006', F.COB1, '2026-09-01T10:05:00Z'),
    mkf('fArquivoDesc0007', 'pastaDesconhecida0001', '2026-09-01T10:06:00Z')];
  const cfg = Object.assign({}, cfgT, { max_pdfs: 20 });
  const out = runNode('TESTE', '[SEL] Selecionar PDFs', { nodes: { '[CFG] Configuração': J(cfg), '[DRIVE] Listar PDFs': files, '[DRIVE] Consulta de PDFs': J({ pastas }) }, input: [{ json: {} }] });
  sel = Object.fromEntries(out.map((i) => [i.json.file_id, i.json]));
  check('FGTS direto -> 54556', sel.fArquivoFGTS0001.template_id === 54556 && sel.fArquivoFGTS0001.modelo_erro === '', sel.fArquivoFGTS0001);
  check('PDF em subpasta de FGTS -> categoria ancestral FGTS, 54556', sel.fArquivoSubFGTS02.template_id === 54556 && sel.fArquivoSubFGTS02.categoria === 'FGTS' && /FGTS \/ 2026-09/.test(sel.fArquivoSubFGTS02.pasta), sel.fArquivoSubFGTS02);
  check('PDF na raiz -> sem template (nao aproxima)', sel.fArquivoRaiz0003.template_id === null && /^PASTA_SEM_MODELO/.test(sel.fArquivoRaiz0003.modelo_erro), sel.fArquivoRaiz0003.modelo_erro);
  check('CANCELAMENTOS -> sem template, pendencia registrada', sel.fArquivoCanc0004.template_id === null && /^SEM_TEMPLATE/.test(sel.fArquivoCanc0004.modelo_erro), sel.fArquivoCanc0004.modelo_erro);
  check('COBRANCA 2 -> bloqueada, cita 54581, nunca 54566', sel.fArquivoCob20005.template_id === null && /54581/.test(sel.fArquivoCob20005.modelo_erro) && sel.fArquivoCob20005.template_id !== 54566, sel.fArquivoCob20005.modelo_erro);
  check('pasta renomeada mas mesmo ID -> ainda 54566 (ID manda, nome nao)', sel.fArquivoCob10006.template_id === 54566 && sel.fArquivoCob10006.template_nome === 'ENVIO COBRANÇA 1 EM ATRASO', sel.fArquivoCob10006);
  check('pasta fora do mapa -> PASTA_SEM_MODELO com o id', sel.fArquivoDesc0007.template_id === null && /pastaDesconhecida0001/.test(sel.fArquivoDesc0007.modelo_erro), sel.fArquivoDesc0007.modelo_erro);
  check('registra pasta de origem + categoria', sel.fArquivoSubFGTS02.pasta_id === 'subFGTS2026abcdefg' && sel.fArquivoSubFGTS02.categoria_id === F.FGTS);
}

// =====================================================================
console.log('\n[4] [BASE] + [ID]: identificar o PAGADOR pelo conteudo');
const sheet = [
  { row_number: 2, CNPJ: CNPJ_A, Name: 'CLIENTE EXEMPLO LTDA', 'NUMERO DE TELEFONE': '(46) 99999-1111' },
  { row_number: 3, CNPJ: CNPJ_B, Name: 'OUTRA EMPRESA ME', 'NUMERO DE TELEFONE': '46 98888-2222' },
  { row_number: 4, CNPJ: cnpjDV('123450000001'), Name: 'SEM TELEFONE SA', 'NUMERO DE TELEFONE': '' }
];
let base;
function identificar(variant, texto, arquivo, extra) {
  const loop = Object.assign({ file_id: 'fID000000001', versao: 'v1', arquivo: arquivo || 'boleto.pdf', pasta: 'COBRANCA 1', categoria: 'COBRANCA 1 EM ATRASO', link_drive: 'https://x', template_id: 54566, template_nome: 'ENVIO COBRANÇA 1 EM ATRASO', template_erro: '' }, extra || {});
  const cfg = variant === 'TESTE' ? cfgT : cfgP;
  return runNode(variant, '[ID] Identificar cliente', { nodes: { '[CFG] Configuração': J(cfg), '[BASE] Indexar clientes': J(base), '[LOOP] Um PDF por vez': J(loop), '[PDF] Extrair texto': J({ text: texto, file_id: loop.file_id }), '[DRIVE] Baixar PDF': J({ file_id: loop.file_id }) }, input: J({ file_id: loop.file_id }) })[0].json;
}
{
  base = runNode('TESTE', '[BASE] Indexar clientes', { nodes: { '[CFG] Configuração': J(cfgT) }, input: sheet.map((r) => ({ json: r })) })[0].json;
  check('planilha indexada (3 documentos)', base.stats.documentos_distintos === 3, base.stats);
  const boleto = (pagador) => `Recibo do Pagador\nBeneficiário\nDOCLA CONTABILIDADE LTDA   CNPJ ${fmt(DOCLA)}\nHonorários Contábeis\nVencimento 10/10/2026\nPagador\nNOME DO PAGADOR\nCNPJ: ${fmt(pagador)}\n`;
  let r = identificar('TESTE', boleto(CNPJ_A));
  check('boleto DOCLA/beneficiaria + pagador A -> cliente A (nao o escritorio)', r.ok && r.cnpj === CNPJ_A && r.cliente === 'CLIENTE EXEMPLO LTDA', r);
  check('TESTE: destino = telefone de teste (nunca o do cliente)', r.destino === '5546991359005' && r.telefone_cliente === '5546999991111', { d: r.destino, t: r.telefone_cliente });
  let rp = identificar('PRODUCAO', boleto(CNPJ_A));
  check('PRODUCAO (modo do cfg): destino = telefone do cliente', cfgP.modo === 'PRODUCAO' && rp.destino === '5546999991111', rp.destino);
  check('documentos do escritorio nao viram cliente', !r.diagnostico.documentos_no_texto.some((d) => d.startsWith('41.491.198')));
  r = identificar('TESTE', boleto(CNPJ_B));
  check('pagador B -> cliente B, template inalterado (pasta manda)', r.ok && r.cnpj === CNPJ_B && r.template_id === 54566, r);
  r = identificar('TESTE', boleto(CNPJ_C));
  check('pagador fora da planilha -> bloqueia CLIENTE_NAO_ENCONTRADO', !r.ok && r.motivo_codigo === 'CLIENTE_NAO_ENCONTRADO', r.motivo_codigo);
  r = identificar('TESTE', `Beneficiário DOCLA CNPJ ${fmt(DOCLA)}\nHonorários`);
  check('so CNPJ do escritorio -> bloqueia SO_DOCUMENTO_DO_ESCRITORIO', !r.ok && r.motivo_codigo === 'SO_DOCUMENTO_DO_ESCRITORIO', r.motivo_codigo);
  r = identificar('TESTE', boleto(CNPJ_A), 'guia.pdf', { template_erro: 'SEM_TEMPLATE: nao existe template' });
  check('pasta sem template bloqueia mesmo com cliente certo', !r.ok && r.motivo_codigo === 'SEM_TEMPLATE', r.motivo_codigo);
  r = identificar('TESTE', boleto(cnpjDV('123450000001')));
  check('cliente sem telefone -> bloqueia TELEFONE_AUSENTE', !r.ok && /TELEFONE_AUSENTE/.test(r.motivo_codigo), r.motivo_codigo);
  r = identificar('TESTE', boleto(CNPJ_A), 'NOME-' + CNPJ_B + '.pdf');
  check('nome do arquivo aponta outro cliente -> DUVIDA_TITULAR (nome nao identifica, mas desmente)', !r.ok && r.motivo_codigo === 'DUVIDA_TITULAR', r.motivo_codigo);
  r = identificar('TESTE', `Pagador ${fmt(CNPJ_A)} e Pagador ${fmt(CNPJ_B)}`);
  check('dois clientes como pagador -> MAIS_DE_UM_CLIENTE (nao chuta)', !r.ok && r.motivo_codigo === 'MAIS_DE_UM_CLIENTE', r.motivo_codigo);
  r = identificar('TESTE', `   \n  `);
  check('sem texto -> PDF_SEM_TEXTO (vai para OCR/alerta)', !r.ok && r.motivo_codigo === 'PDF_SEM_TEXTO', r.motivo_codigo);
}

// =====================================================================
console.log('\n[5] [CTRL] Decidir -> ENVIAR / ALERTAR / REGISTRAR / PULAR');
{
  const ok = identificar('TESTE', `Pagador\nCNPJ: ${fmt(CNPJ_A)}`);
  const dec = (I, registros, variant) => runNode(variant || 'TESTE', '[CTRL] Decidir', { nodes: { '[CFG] Configuração': J(variant === 'PRODUCAO' ? cfgP : cfgT), '[ID] Identificar cliente': J(I) }, input: registros.length ? registros.map((r) => ({ json: r })) : [{ json: {} }] })[0].json;
  let d = dec(ok, []);
  check('cliente ok, sem registro -> ENVIAR (ENVIANDO, tentativa 1)', d.acao === 'ENVIAR' && d.registro.estado === 'ENVIANDO' && d.registro.tentativas === 1, d.acao);
  d = dec(ok, [{ chave: ok.chave, estado: 'ACEITO', execucao: '9' }]);
  check('ja ACEITO -> PULAR (sem reenvio)', d.acao === 'PULAR', d.acao);
  d = dec(ok, [{ chave: ok.chave, estado: 'INCERTO', execucao: '9' }]);
  check('INCERTO -> PULAR (nunca repete sozinho)', d.acao === 'PULAR', d.acao);
  d = dec(ok, [{ chave: ok.chave, estado: 'ENVIANDO', execucao: '9' }]);
  check('ENVIANDO (em andamento) -> PULAR', d.acao === 'PULAR', d.acao);
  d = dec(ok, [{ chave: ok.chave, estado: 'ERRO_ENVIO', tentativas: 3, execucao: '9' }]);
  check('ERRO_ENVIO com tentativas esgotadas -> PULAR', d.acao === 'PULAR', d.acao);
  d = dec(ok, [{ chave: ok.chave, estado: 'ERRO_ENVIO', tentativas: 1, execucao: '9' }]);
  check('ERRO_ENVIO com tentativas sobrando -> ENVIAR (tentativa 2)', d.acao === 'ENVIAR' && d.registro.tentativas === 2, d.acao);
  const bloq = identificar('TESTE', boletoTexto(CNPJ_C));
  function boletoTexto(c) { return `Pagador\nCNPJ: ${fmt(c)}`; }
  d = dec(bloq, []);
  check('bloqueio novo -> ALERTAR + registro BLOQUEADO', d.acao === 'ALERTAR' && d.registro.estado === 'BLOQUEADO', d.acao);
  d = dec(bloq, [{ chave: bloq.chave, estado: 'BLOQUEADO', erro: bloq.motivo_codigo + ': ' + bloq.motivo, alerta: 'ENVIADO 2026-09-23', execucao: '9' }]);
  check('mesmo bloqueio ja avisado -> REGISTRAR (nao reavisa)', d.acao === 'REGISTRAR', d.acao);
  // switch usa esta ordem
  const ordem = ['ENVIAR', 'ALERTAR', 'REGISTRAR', 'PULAR'];
  const sw = WF.TESTE.nodes.find((n) => n.name === '[CTRL] Ação').parameters.output;
  check('Switch [CTRL] Acao: 4 saidas na ordem ENVIAR/ALERTAR/REGISTRAR/PULAR', sw.includes("['ENVIAR', 'ALERTAR', 'REGISTRAR', 'PULAR']"));
  const conns = WF.TESTE.connections['[CTRL] Ação'].main.map((b) => b.map((c) => c.node)[0]);
  check('Switch ligado: 0->Reservar, 1->Alerta, 2->Gravar sem aviso, 3->Proximo', conns[0] === '[CTRL] Reservar envio' && conns[1] === '[ALERTA] Preparar aviso' && conns[2] === '[CTRL] Gravar sem aviso' && conns[3] === '[FIM] Próximo arquivo', conns);
}

// =====================================================================
console.log('\n[6] Link do PDF: a COPIA e compartilhada, o original nunca');
{
  const D0 = { file_id: 'ORIGINALfile0001', destino: '5546991359005', cliente: 'CLIENTE EXEMPLO LTDA', telefone_cliente: '5546999991111', template_id: 54566, template_nome: 'ENVIO COBRANÇA 1 EM ATRASO', cnpj: CNPJ_A, registro: { chave: 'k' } };
  const out = runNode('TESTE', '[MAXBOT] Mensagem ao cliente', { nodes: { '[CFG] Configuração': J(cfgT), '[CTRL] Decidir': J(D0), '[DRIVE] Copiar para envio': J({ id: 'COPIAfile00000009', name: 'ENVIO - x.pdf' }) }, input: J({ id: 'perm1', role: 'reader', type: 'anyone' }) })[0].json;
  check('info1 usa o ID da COPIA', out.envio.info1.includes('COPIAfile00000009'), out.envio.info1);
  check('info1 NAO contem o ID do original', !out.envio.info1.includes('ORIGINALfile0001'));
  check('sem falha previa quando o compartilhamento da copia deu certo', out.falha_previa === '');
  const out2 = runNode('TESTE', '[MAXBOT] Mensagem ao cliente', { nodes: { '[CFG] Configuração': J(cfgT), '[CTRL] Decidir': J(D0), '[DRIVE] Copiar para envio': J({ error: { message: 'x' } }) }, input: J({ error: { message: 'File not found: undefined' } }) })[0].json;
  check('copia/compartilhamento falhou -> LINK_NAO_LIBERADO (nao manda link quebrado)', /^LINK_NAO_LIBERADO/.test(out2.falha_previa), out2.falha_previa);
  const wfN = WF.TESTE.nodes;
  const lib = wfN.find((n) => n.name === '[DRIVE] Liberar link').parameters;
  check('[DRIVE] Liberar link atua sobre o item da copia ($json.id), nao sobre o original', lib.fileId.value === '={{ $json.id }}' && lib.permissionsUi.permissionsValues.type === 'anyone' && lib.permissionsUi.permissionsValues.role === 'reader');
  const cp = wfN.find((n) => n.name === '[DRIVE] Copiar para envio').parameters;
  check('copia NAO fica na mesma pasta (sameFolder=false) e vai para a pasta privada de links', cp.sameFolder === false && /pasta_links_id/.test(cp.folderId.value));
  check('caminho: Reservar envio -> Copiar -> Liberar link -> Mensagem', WF.TESTE.connections['[CTRL] Reservar envio'].main[0][0].node === '[DRIVE] Copiar para envio' && WF.TESTE.connections['[DRIVE] Copiar para envio'].main[0][0].node === '[DRIVE] Liberar link' && WF.TESTE.connections['[DRIVE] Liberar link'].main[0][0].node === '[MAXBOT] Mensagem ao cliente');
}

// =====================================================================
console.log('\n[7] Maxbot: contato SEM lista[0], whatsapp x mobile_phone');
function cadastro(contatos, destino, envioExtra) {
  const envio = Object.assign({ contexto: 'cliente', destino, info1: 'https://drive.google.com/file/d/COPIA/view', contato_nome: 'X', contato_sobrenome: 'Y', obs: 'o' }, envioExtra || {});
  return runNode('TESTE', '[MAXBOT] Montar cadastro', { nodes: { '[MAXBOT] Montar get_contact': J({ envio, registro: { chave: 'k' }, falha_previa: '' }) }, input: J({ statusCode: 200, body: { status: 1, data: contatos } }) })[0].json;
}
{
  const MEU = { id: '10656708', whatsapp: '554691359005', mobile_phone: '5546991359005' };
  let r = cadastro([MEU], '5546991359005');
  check('seu contato: bate em mobile_phone (9 digitos) -> aceito, contact_id 10656708', r.contato_id === '10656708' && !r.falha_previa && r.maxbot_payload.cmd === 'set_contact', r);
  r = cadastro([MEU], '554691359005');
  check('bate em whatsapp (formato antigo) -> aceito', r.contato_id === '10656708' && !r.falha_previa, r);
  r = cadastro([{ id: '999', whatsapp: '5511988887777', mobile_phone: '5511988887777' }], '5546991359005');
  check('devolveu OUTRO contato (nada bate) -> CONTATO_DIVERGENTE, NAO usa lista[0]', /^CONTATO_DIVERGENTE/.test(r.falha_previa) && r.contato_id === '', r.falha_previa);
  check('  ...e o payload vira get_status (nada e enviado/alterado)', r.maxbot_payload.cmd === 'get_status');
  r = cadastro([{ id: '1', whatsapp: '5546991359005', mobile_phone: '' }, { id: '2', whatsapp: '', mobile_phone: '5546991359005' }], '5546991359005');
  check('dois contatos batem -> CONTATO_AMBIGUO (bloqueia)', /^CONTATO_AMBIGUO/.test(r.falha_previa), r.falha_previa);
  r = cadastro([{ id: '5', whatsapp: '5546977776666', mobile_phone: '5546999991111' }], '5546999991111');
  check('bate so no mobile_phone (whatsapp diferente) -> aceito', r.contato_id === '5' && !r.falha_previa, r);
  r = cadastro([], '5546999991111');
  check('lista vazia -> put_contact (cria contato novo)', r.maxbot_payload.cmd === 'put_contact' && r.maxbot_payload.whatsapp === '5546999991111', r.maxbot_payload);
  r = cadastro([MEU, { id: '77', whatsapp: '5546911112222', mobile_phone: '' }], '5546991359005');
  check('varios retornados, so um bate -> usa esse, ignora lista[0] aleatorio', r.contato_id === '10656708', r.contato_id);
  r = cadastro([{ id: '88', whatsapp: '5546911112222', mobile_phone: '' }, MEU], '5546991359005');
  check('  ...mesmo se o certo NAO for o primeiro da lista', r.contato_id === '10656708', r.contato_id);
}

// =====================================================================
console.log('\n[8] Trava de TESTE no ponto imediatamente anterior ao envio');
function montarEnvio(variant, env, destino, contexto, contactId) {
  const envio = { contexto, destino, template_id: 54566, template_nome: 'T', nome_tag: 'n', info1: 'https://x/copia' };
  return runNode(variant, '[MAXBOT] Montar envio', { env, nodes: { '[MAXBOT] Montar cadastro': J({ envio, registro: { chave: 'k' }, falha_previa: '', contato_id: contactId || '555', maxbot_payload: { cmd: 'set_contact' } }) }, input: J({ statusCode: 200, body: { status: 1 } }) })[0].json;
}
{
  const CLIENTE = '5546999991111', MEU = '5546991359005';
  let r = montarEnvio('TESTE', ENV_OK, CLIENTE, 'cliente');
  check('TESTE + destino cliente real -> BLOQUEADO', !r.pode_enviar && /BLOQUEADO_PELA_COPIA_TESTE|BLOQUEADO_PELO_MODO_TESTE/.test(r.falha_previa), r.falha_previa);
  r = montarEnvio('TESTE', Object.assign({}, ENV_OK, { ENVPDF_MODO_TESTE: 'false' }), CLIENTE, 'cliente');
  check('TESTE + ENVPDF_MODO_TESTE=false + cliente real -> AINDA BLOQUEADO (env sozinha nao vira producao)', !r.pode_enviar && /BLOQUEADO_PELA_COPIA_TESTE|copia TESTE/.test(r.falha_previa), r.falha_previa);
  r = montarEnvio('TESTE', Object.assign({}, ENV_OK, { ENVPDF_MODO_TESTE: 'false', ENVPDF_TELEFONE_TESTE: CLIENTE, ENVPDF_TELEFONE_ALERTA: CLIENTE }), CLIENTE, 'cliente');
  check('TESTE + env com TELEFONE_TESTE trocado para o cliente + MODO_TESTE=false -> AINDA BLOQUEADO (telefone fixo no codigo)', !r.pode_enviar && /BLOQUEADO_PELA_COPIA_TESTE/.test(r.falha_previa), r.falha_previa);
  r = montarEnvio('TESTE', ENV_OK, MEU, 'cliente', '10656708');
  check('TESTE + telefone de teste + contact_id 10656708 -> pode enviar (send_template_integration com esse contact_id)', r.pode_enviar && r.maxbot_payload.cmd === 'send_template_integration' && r.maxbot_payload.contact_id === '10656708' && r.maxbot_payload.whatsapp === MEU, r.maxbot_payload);
  r = montarEnvio('TESTE', ENV_OK, MEU, 'cliente', '424242');
  check('TESTE + telefone de teste MAS contact_id diferente (ex.: contato errado) -> BLOQUEADO', !r.pode_enviar && /contact_id 424242/.test(r.falha_previa), r.falha_previa);
  r = montarEnvio('TESTE', ENV_OK, CLIENTE, 'alerta', '10656708');
  check('TESTE: ate alertas so para o contato de teste', !r.pode_enviar && /BLOQUEADO_PELA_COPIA_TESTE/.test(r.falha_previa), r.falha_previa);
  // antes de qualquer escrita no cadastro (get_contact/set_contact)
  const gc = (variant, destino) => runNode(variant, '[MAXBOT] Montar get_contact', { input: J({ envio: { contexto: 'cliente', destino, info1: 'https://x' }, registro: { chave: 'k' } }) })[0].json;
  let g = gc('TESTE', CLIENTE);
  check('TESTE: cliente real nem chega ao get_contact/set_contact (payload get_status, sem escrita)', /BLOQUEADO_PELA_COPIA_TESTE/.test(g.falha_previa) && g.maxbot_payload.cmd === 'get_status', g.falha_previa);
  g = gc('TESTE', MEU);
  check('TESTE: telefone de teste segue para get_contact', !g.falha_previa && g.maxbot_payload.cmd === 'get_contact' && g.maxbot_payload.whatsapp === MEU);
  g = gc('PRODUCAO', CLIENTE);
  check('PRODUCAO: get_contact normal para o cliente', !g.falha_previa && g.maxbot_payload.cmd === 'get_contact');
  r = montarEnvio('PRODUCAO', Object.assign({}, ENV_OK, { ENVPDF_MODO_TESTE: 'true' }), CLIENTE, 'cliente');
  check('PRODUCAO com ENVPDF_MODO_TESTE=true -> tambem bloqueia cliente (rede de seguranca)', !r.pode_enviar, r.falha_previa);
  r = montarEnvio('PRODUCAO', Object.assign({}, ENV_OK, { ENVPDF_MODO_TESTE: 'false' }), CLIENTE, 'cliente');
  check('PRODUCAO com modo=false -> libera o cliente (somente aqui)', r.pode_enviar === true, r.falha_previa);
  r = montarEnvio('PRODUCAO', Object.assign({}, ENV_OK, { ENVPDF_MODO_TESTE: 'false' }), '5511900001111', 'alerta');
  check('alerta so pode ir para ENVPDF_TELEFONE_ALERTA', !r.pode_enviar && /BLOQUEADO: aviso/.test(r.falha_previa), r.falha_previa);
}

// =====================================================================
console.log('\n[9] Resultado do envio: ACEITO / FALHA / INCERTO + arquivamento');
function avaliar(resp) {
  const M = { pode_enviar: true, envio: { contexto: 'cliente', destino: '5546991359005' }, registro: { chave: 'k', file_id: 'ORIG' }, contato_id: '1' };
  return runNode('TESTE', '[MAXBOT] Avaliar envio', { nodes: { '[MAXBOT] Montar envio': J(M) }, input: J(resp) })[0].json.resultado;
}
{
  check('status 1 -> ACEITO', avaliar({ statusCode: 200, body: { status: 1, msg: 'ok' } }).estado === 'ACEITO');
  check('status 2 (processando) -> ACEITO', avaliar({ statusCode: 200, body: { status: 2 } }).estado === 'ACEITO');
  check('recusa da API -> ERRO_ENVIO (pode retentar)', avaliar({ statusCode: 200, body: { status: 0, msg: 'invalido' } }).estado === 'ERRO_ENVIO');
  check('HTTP 500 -> INCERTO (nao repete sozinho)', avaliar({ statusCode: 500, body: {} }).estado === 'INCERTO');
  check('timeout apos enviar -> INCERTO', avaliar({ error: { message: 'timeout of 60000ms exceeded' } }).estado === 'INCERTO');
  check('DNS/conexao nao abriu -> ERRO_ENVIO (seguro retentar)', avaliar({ error: { message: 'getaddrinfo ENOTFOUND app.maxbot.com.br' } }).estado === 'ERRO_ENVIO');
  const res = (estado, modo) => runNode('TESTE', '[CTRL] Resultado do cliente', { input: J({ registro: { chave: 'k', file_id: 'ORIG', estado: 'ENVIANDO', modo: modo || 'PRODUCAO' }, resultado: { estado } }) })[0].json.registro;
  check('PRODUCAO: ACEITO -> registro com arquivamento=PENDENTE (aguarda mover)', res('ACEITO', 'PRODUCAO').arquivamento === 'PENDENTE');
  check('TESTE: ACEITO -> arquivamento VAZIO (original nunca e movido em teste)', res('ACEITO', 'TESTE').arquivamento === '');
  const gate = WF.TESTE.nodes.find((n) => n.name === '[DRIVE] Só arquiva em produção?');
  const gateExpr = gate.parameters.conditions.conditions[0].leftValue;
  const avalia = (modo) => new Function('$', 'return ' + gateExpr.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, ''))((n) => ({ first: () => ({ json: { registro: { modo } } }) }));
  check('porteiro: modo TESTE -> false (nao move) ; PRODUCAO -> true', avalia('TESTE') === false && avalia('PRODUCAO') === true);
  const cc = WF.TESTE.connections;
  check('Aceito?[true] -> porteiro; porteiro[true] -> Mover; porteiro[false] -> Pausa (sem tocar no Drive)', cc['[CTRL] Aceito?'].main[0][0].node === '[DRIVE] Só arquiva em produção?' && cc['[DRIVE] Só arquiva em produção?'].main[0][0].node === '[DRIVE] Mover para ENVIADOS' && cc['[DRIVE] Só arquiva em produção?'].main[1][0].node === '[FIM] Pausa entre envios');
  const fb = WF.TESTE.nodes.find((n) => n.name === '[ARQ] Buscar pendentes').parameters.filters.conditions;
  check('[ARQ] Buscar pendentes so pega modo=PRODUCAO (aceito so em teste nunca e arquivado)', fb.some((c) => c.keyName === 'modo' && c.keyValue === 'PRODUCAO'));
  check('INCERTO -> arquivamento vazio (NAO arquiva)', res('INCERTO').arquivamento === '');
  check('ERRO_ENVIO -> arquivamento vazio (NAO arquiva)', res('NAO_TENTADO').arquivamento === '' && res('ERRO_ENVIO').arquivamento === '');
  // grafo: so o ramo "true" de Aceito? leva ao mover
  const c = WF.TESTE.connections;
  check('Aceito?[false] -> Falha no envio (sem mover)', c['[CTRL] Aceito?'].main[1][0].node === '[CTRL] Falha no envio');
  const mv = WF.TESTE.nodes.find((n) => n.name === '[DRIVE] Mover para ENVIADOS');
  check('mover atua no arquivo ORIGINAL (file_id do registro) para a pasta ENVIADOS', /registro\.file_id/.test(mv.parameters.fileId.value) && /pasta_enviados_id/.test(mv.parameters.folderId.value) && mv.parameters.operation === 'move');
  const reg = (mov) => runNode('TESTE', '[DRIVE] Registrar arquivamento', { nodes: { '[CTRL] Resultado do cliente': J({ registro: { chave: 'k', file_id: 'ORIG', estado: 'ACEITO', arquivamento: 'PENDENTE', erro: '' } }) }, input: J(mov) })[0].json.registro;
  check('mover OK -> arquivamento=OK, estado segue ACEITO', reg({ id: 'ORIG', parents: [ENVIADOS] }).arquivamento === 'OK' && reg({ id: 'ORIG' }).estado === 'ACEITO');
  const f = reg({ error: { message: 'insufficientFilePermissions' } });
  check('mover FALHOU -> arquivamento=PENDENTE + ARQUIVAMENTO_PENDENTE no erro, estado continua ACEITO (sem reenvio)', f.arquivamento === 'PENDENTE' && /ARQUIVAMENTO_PENDENTE/.test(f.erro) && f.estado === 'ACEITO', f);
  const pend = [{ json: { chave: 'a', file_id: 'F1', estado: 'ACEITO', arquivamento: 'PENDENTE' } }, { json: { chave: 'b', file_id: 'F2', estado: 'ACEITO', arquivamento: 'PENDENTE' } }];
  const prep = runNode('TESTE', '[ARQ] Preparar gravação', { nodes: { '[ARQ] Buscar pendentes': pend }, input: [{ json: { id: 'F1', parents: [ENVIADOS] } }, { json: { error: { message: 'x' } } }] });
  check('retomada: F1 movido -> OK ; F2 falhou -> continua PENDENTE (pareado por posicao)', prep[0].json.registro.arquivamento === 'OK' && prep[1].json.registro.arquivamento === 'PENDENTE' && prep[1].json.registro.file_id === 'F2', prep.map((p) => p.json.registro.arquivamento));
  check('retomada: nenhum no de Maxbot na sub-cadeia [ARQ] (so move, nunca reenvia)', ['[ARQ] Buscar pendentes', '[ARQ] Há pendentes?', '[ARQ] Mover pendente', '[ARQ] Preparar gravação', '[ARQ] Gravar arquivamento'].every((n) => !/MAXBOT/.test(n)) && !JSON.stringify(WF.TESTE.connections['[ARQ] Mover pendente']).includes('MAXBOT'));
}

// =====================================================================
console.log('\n[10] Fluxo de ERRO (execucao separada: [CFG] e o laco NAO existem) + lock');
for (const variant of ['TESTE', 'PRODUCAO']) {
  const wf = WF[variant];
  const trigger = 'Erro na execução';
  // alcance do caminho de erro, seguindo so as saidas realmente tomadas nele
  const follow = { '[MAXBOT] Origem do envio': [2], '[LOCK] Adquirido?': [0] };
  const R = new Set([trigger]);
  const q = [trigger];
  while (q.length) {
    const cur = q.shift();
    const mains = (wf.connections[cur] && wf.connections[cur].main) || [];
    mains.forEach((branch, idx) => {
      if (follow[cur] && !follow[cur].includes(idx)) return;
      (branch || []).forEach((c) => { if (!R.has(c.node)) { R.add(c.node); q.push(c.node); } });
    });
  }
  const bad = [];
  for (const n of wf.nodes.filter((x) => R.has(x.name))) {
    const src = JSON.stringify(n.parameters);
    for (const m of src.matchAll(/\$\(\\?'([^'\\]+)\\?'\)/g)) if (!R.has(m[1])) bad.push(n.name + ' -> $(' + m[1] + ')');
  }
  check(variant + ': nos do caminho de ERRO so referenciam nos que rodam nesse caminho', bad.length === 0, bad);
  check(variant + ': [LOCK] Reservar destino nao depende de [CFG]', !JSON.stringify(wf.nodes.find((n) => n.name === '[LOCK] Reservar destino').parameters).includes('[CFG]'));
}
{
  const nao = (input) => runNode('TESTE', '[LOCK] Não adquirido', { input });
  let thrown = ''; try { nao(J({ error: { message: 'connection refused' }, envio: { contexto: 'cliente' } })); } catch (e) { thrown = e.message; }
  check('falha do Postgres no lock -> PARA a execucao com mensagem clara (nao finge duplicado)', /Falha ao reservar o lock/.test(thrown), thrown);
  check('duplicado no fluxo de ERRO -> termina em silencio (sem cair no laco de PDFs)', nao(J({ envio: { contexto: 'erro_geral' }, registro: {} })).length === 0);
  const dupe = nao(J({ envio: { contexto: 'cliente', destino: '5546991359005' }, registro: { chave: 'k' } }));
  check('duplicado de cliente -> segue para "Proximo arquivo" sem enviar nem gravar', dupe.length === 1 && dupe[0].json.lock === 'DUPLICADO_IGNORADO');
  check('[LOCK] Adquirido?: true -> Montar get_contact ; false -> Nao adquirido', WF.TESTE.connections['[LOCK] Adquirido?'].main[0][0].node === '[MAXBOT] Montar get_contact' && WF.TESTE.connections['[LOCK] Adquirido?'].main[1][0].node === '[LOCK] Não adquirido');
  check('os 3 produtores (cliente, alerta, erro geral) passam pelo lock antes do get_contact', ['[MAXBOT] Mensagem ao cliente', '[ALERTA] Preparar aviso', '[ERRO] Decidir aviso'].every((n) => WF.TESTE.connections[n].main[0][0].node === '[LOCK] Reservar destino'));
  check('lock e liberado logo apos Avaliar envio, antes do roteamento por contexto', WF.TESTE.connections['[MAXBOT] Avaliar envio'].main[0][0].node === '[LOCK] Liberar destino' && WF.TESTE.connections['[LOCK] Liberar destino'].main[0][0].node === '[LOCK] Retomar avaliação' && WF.TESTE.connections['[LOCK] Retomar avaliação'].main[0][0].node === '[MAXBOT] Origem do envio');
}

{
  // Simula o contrato do node Postgres: ele SUBSTITUI o item pela linha do RETURNING.
  const producer = { registro: { chave: 'k1', file_id: 'ORIG' }, envio: { contexto: 'cliente', destino: '5546991359005', info1: 'https://drive.google.com/file/d/COPIA/view', template_id: 54566 }, falha_previa: '' };
  const linhaPg = { destino: '5546991359005', payload: JSON.stringify(producer) };
  let r = runNode('TESTE', '[LOCK] Restaurar item', { input: J(linhaPg) })[0].json;
  check('Restaurar item: lock adquirido devolve o item ORIGINAL (envio/registro intactos) + lock_adquirido=true', r.lock_adquirido === true && r.envio.destino === '5546991359005' && r.registro.chave === 'k1' && r.envio.contexto === 'cliente', r);
  const g = runNode('TESTE', '[MAXBOT] Montar get_contact', { input: J(r) })[0].json;
  check('CADEIA: item restaurado alimenta [MAXBOT] Montar get_contact normalmente (era o bug: DESTINO_INVALIDO)', !g.falha_previa && g.maxbot_payload.cmd === 'get_contact' && g.maxbot_payload.whatsapp === '5546991359005', g);
  r = runNode('TESTE', '[LOCK] Restaurar item', { input: J(producer) })[0].json;
  check('Restaurar item: nenhuma linha (lock em uso; alwaysOutputData devolve a entrada) -> lock_adquirido=false, item preservado', r.lock_adquirido === false && r.envio.destino === '5546991359005', r);
  r = runNode('TESTE', '[LOCK] Restaurar item', { input: J({ error: { message: 'boom' } }) })[0].json;
  check('Restaurar item: erro do Postgres -> lock_adquirido=false com o erro', r.lock_adquirido === false && !!r.error);
  const ifn = WF.TESTE.nodes.find((n) => n.name === '[LOCK] Adquirido?').parameters.conditions.conditions[0].leftValue;
  check('[LOCK] Adquirido? decide por lock_adquirido === true', /lock_adquirido === true/.test(ifn));
  const q = WF.TESTE.nodes.find((n) => n.name === '[LOCK] Reservar destino').parameters;
  check('Reservar devolve o item original pela propria consulta (RETURNING ... payload; 5o parametro = $json)', q.query.includes('RETURNING destino, $5::text AS payload') && /\$json \] \}\}$/.test(q.options.queryReplacement), q.options.queryReplacement);
  const av = { contexto: 'cliente', envio: { contexto: 'cliente', destino: '5546991359005' }, registro: { chave: 'k1' }, resultado: { estado: 'ACEITO' } };
  const ret = runNode('TESTE', '[LOCK] Retomar avaliação', { nodes: { '[MAXBOT] Avaliar envio': J(av) }, input: J({ success: true }) })[0].json;
  check('Retomar avaliacao: apos o DELETE ({success:true}) o resultado do envio volta para o roteamento por contexto', ret.contexto === 'cliente' && ret.resultado.estado === 'ACEITO', ret);
  check('Origem do envio consegue rotear o item retomado (contexto cliente -> saida 0)', ['cliente', 'alerta', 'erro_geral'].indexOf(ret.contexto) === 0);
}

console.log('\n==========================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
