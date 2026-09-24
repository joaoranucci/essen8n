#!/usr/bin/env bash
# Prova a atomicidade do lock: N sessoes SQL simultaneas disputando o MESMO destino;
# exatamente UMA deve adquirir. Usa a mesma consulta do no [LOCK] Reservar destino.
# Uso (na pasta do projeto, com o stack de pe): bash tests/lock-concorrencia.sh [N]
set -u
N="${1:-30}"
DEST="5546990000777"
dk() { MSYS_NO_PATHCONV=1 docker compose "$@"; }

dk exec -T postgres psql -U n8n -d n8n -qc "CREATE TABLE IF NOT EXISTS envio_pdf_lock (destino TEXT PRIMARY KEY, chave TEXT, execucao TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT now()); DELETE FROM envio_pdf_lock WHERE destino='$DEST';"
Q="INSERT INTO envio_pdf_lock (destino, chave, execucao, criado_em) VALUES ('$DEST','c','e',now()) ON CONFLICT (destino) DO UPDATE SET chave=EXCLUDED.chave, criado_em=now() WHERE envio_pdf_lock.criado_em < now() - ('30' || ' minutes')::interval RETURNING destino;"
TMP="$(mktemp -d)"
for i in $(seq 1 "$N"); do ( dk exec -T postgres psql -U n8n -d n8n -tA -c "$Q" > "$TMP/$i.txt" 2>&1 ) & done
wait
GANHOU=$(cat "$TMP"/*.txt | grep -c "$DEST")
dk exec -T postgres psql -U n8n -d n8n -qc "DELETE FROM envio_pdf_lock WHERE destino='$DEST';"
rm -rf "$TMP"
echo "sessoes que adquiriram o lock: $GANHOU de $N (esperado: 1)"
[ "$GANHOU" = "1" ] && echo "PASS" || { echo "FAIL"; exit 1; }
