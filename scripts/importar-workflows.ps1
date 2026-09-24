# Importa os dois workflows (TESTE e PRODUCAO) para dentro do n8n ja rodando.
# Uso (depois de "docker compose up -d" e o container "n8n" saudavel):
#   powershell -ExecutionPolicy Bypass -File .\scripts\importar-workflows.ps1

$ErrorActionPreference = "Stop"

Write-Host "Importando workflow de TESTE..."
docker compose exec -T n8n n8n import:workflow --input=/workflows/ENVIO-PDF-TESTE.json
if ($LASTEXITCODE -ne 0) { throw "Falha ao importar ENVIO-PDF-TESTE.json" }

Write-Host "Importando workflow de PRODUCAO (fica inativo ate voce ativar manualmente)..."
docker compose exec -T n8n n8n import:workflow --input=/workflows/ENVIO-PDF-PRODUCAO.json
if ($LASTEXITCODE -ne 0) { throw "Falha ao importar ENVIO-PDF-PRODUCAO.json" }

Write-Host "OK. Abra http://localhost:5678 e confirme as duas automacoes na lista de Workflows."
