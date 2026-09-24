# Cria no n8n os "encaixes" das credenciais de terceiros, SEM NENHUM SEGREDO:
#   - Google Drive account   (OAuth2: falta Client ID/Secret + clicar em Connect)
#   - Google Sheets account  (OAuth2: idem)
#   - Maxbot API             (token e channel_token com MARCADOR - troque pelos valores novos)
# Os ids sao os que os nos dos workflows ja referenciam, entao os 16 nos ficam vinculados.
#
# Uso: powershell -ExecutionPolicy Bypass -File .\scripts\criar-credenciais-vazias.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$oauthBase = @{
  clientId = ""; clientSecret = ""; grantType = "authorizationCode"
  authUrl = "https://accounts.google.com/o/oauth2/v2/auth"
  accessTokenUrl = "https://oauth2.googleapis.com/token"
  authQueryParameters = "access_type=offline&prompt=consent"
  authentication = "body"; customScopes = $false
}
$maxbotJson = '{' + "`n" + '  "body": {' + "`n" +
  '    "token": "COLE_AQUI_O_TOKEN_NOVO_DO_MAXBOT",' + "`n" +
  '    "channel_token": "COLE_AQUI_O_CHANNEL_TOKEN"' + "`n" + '  }' + "`n" + '}'

$creds = @(
  @{ id = "jf47z7YDNClFi4Uk"; name = "Google Drive account"; type = "googleDriveOAuth2Api"; data = $oauthBase },
  @{ id = "Yv0aH6pz0lEHb6dq"; name = "Google Sheets account"; type = "googleSheetsOAuth2Api"; data = $oauthBase },
  @{ id = "ENVPDFMAXBOT01"; name = "Maxbot API"; type = "httpCustomAuth"; data = @{ json = $maxbotJson } }
)
$json = ConvertTo-Json -InputObject @($creds) -Depth 6

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("envpdf_shell_" + [guid]::NewGuid().ToString("N") + ".json")
try {
  [System.IO.File]::WriteAllText($tmp, $json, [System.Text.UTF8Encoding]::new($false))
  docker compose cp $tmp n8n:/home/node/cred_shells.json
  if ($LASTEXITCODE -ne 0) { throw "Falha ao copiar o arquivo temporario para o container" }
  docker compose exec -T n8n n8n import:credentials --input=/home/node/cred_shells.json
  $code = $LASTEXITCODE
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $tmp
  docker compose exec -T n8n rm -f /home/node/cred_shells.json
}
if ($code -ne 0) { throw "Falha ao importar as credenciais (codigo $code)" }
Write-Host "OK: encaixes criados. Preencha os segredos pela interface do n8n (veja o README)."
