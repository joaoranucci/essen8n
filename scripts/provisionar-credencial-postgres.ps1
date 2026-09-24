# Cria no n8n a credencial "Postgres (lock/registro)" usando POSTGRES_* do .env.
# A senha nunca e exibida nem gravada em disco fora do container (arquivo temporario
# dentro do container e apagado em seguida). O id fixo (ENVPDFLOCKPG01) e o que os nos
# [LOCK] dos workflows ja referenciam, entao ficam vinculados sozinhos.
#
# Uso: powershell -ExecutionPolicy Bypass -File .\scripts\provisionar-credencial-postgres.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$vars = @{}
Get-Content ".env" | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $vars[$Matches[1]] = $Matches[2].Trim() }
}
foreach ($k in "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB") {
  if (-not $vars[$k]) { throw "$k ausente no .env" }
}

$cred = @{
  id = "ENVPDFLOCKPG01"
  name = "Postgres (lock/registro)"
  type = "postgres"
  data = @{
    host = "postgres"; port = 5432; database = $vars["POSTGRES_DB"]
    user = $vars["POSTGRES_USER"]; password = $vars["POSTGRES_PASSWORD"]
    ssl = "disable"; allowUnauthorizedCerts = $false; maxConnections = 100
  }
}
$json = ConvertTo-Json -InputObject @($cred) -Depth 6
# Arquivo temporario (UTF-8 SEM BOM), copiado para o container e apagado dos dois lados.
# (Encaminhar por pipe no PowerShell 5.1 injeta um BOM que o n8n rejeita como JSON invalido.)
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("envpdf_cred_" + [guid]::NewGuid().ToString("N") + ".json")
try {
  [System.IO.File]::WriteAllText($tmp, $json, [System.Text.UTF8Encoding]::new($false))
  docker compose cp $tmp n8n:/home/node/cred_pg.json
  if ($LASTEXITCODE -ne 0) { throw "Falha ao copiar o arquivo temporario para o container" }
  docker compose exec -T n8n n8n import:credentials --input=/home/node/cred_pg.json
  $code = $LASTEXITCODE
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $tmp
  docker compose exec -T n8n rm -f /home/node/cred_pg.json
}
if ($code -ne 0) { throw "Falha ao importar a credencial (codigo $code)" }
Write-Host "OK: credencial 'Postgres (lock/registro)' criada."
