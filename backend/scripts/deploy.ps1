[CmdletBinding()]
param(
  [string]$ResourceGroup = "rg-next-chapter",
  [string]$Location = "australiaeast",
  [Parameter(Mandatory = $true)]
  [string]$StaticAppUrl,
  [Parameter(Mandatory = $true)]
  [string]$VapidSubject
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $projectRoot
$account = az account show --output json | ConvertFrom-Json
$suffixBytes = [Text.Encoding]::UTF8.GetBytes($account.id)
$suffixHash = [Security.Cryptography.SHA256]::HashData($suffixBytes)
$suffix = ([Convert]::ToHexString($suffixHash)).Substring(0, 10).ToLowerInvariant()
$functionName = "next-chapter-push-$suffix"
$storageName = "nextchapter$($suffix.Substring(0, 10))"
$origin = ([Uri]$StaticAppUrl).GetLeftPart([UriPartial]::Authority)

az group create --name $ResourceGroup --location $Location --output none
$storageExists = az storage account check-name --name $storageName --query nameAvailable --output tsv
if ($storageExists -eq "true") {
  az storage account create --name $storageName --resource-group $ResourceGroup --location $Location --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false --output none
}

$existingFunction = az functionapp show --name $functionName --resource-group $ResourceGroup --query name --output tsv 2>$null
$functionWasCreated = $false
if (-not $existingFunction) {
  az functionapp create --resource-group $ResourceGroup --name $functionName --storage-account $storageName --flexconsumption-location $Location --runtime node --runtime-version 24 --functions-version 4 --instance-memory 2048 --maximum-instance-count 5 --https-only true --disable-app-insights true --output none
  $functionWasCreated = $true
}

if ($functionWasCreated) {
  $vapid = node (Join-Path $PSScriptRoot "generate-vapid.js") | ConvertFrom-Json
  az functionapp config appsettings set --name $functionName --resource-group $ResourceGroup --settings "VAPID_PUBLIC_KEY=$($vapid.publicKey)" "VAPID_PRIVATE_KEY=$($vapid.privateKey)" "VAPID_SUBJECT=$VapidSubject" "ALLOWED_ORIGINS=$origin" "TABLE_NAME=PushReminders" --output none
} else {
  az functionapp config appsettings set --name $functionName --resource-group $ResourceGroup --settings "VAPID_SUBJECT=$VapidSubject" "ALLOWED_ORIGINS=$origin" "TABLE_NAME=PushReminders" --output none
}
az functionapp cors add --name $functionName --resource-group $ResourceGroup --allowed-origins $origin --output none

Push-Location $projectRoot
try {
  func azure functionapp publish $functionName --javascript
} finally {
  Pop-Location
}

$apiBase = "https://$functionName.azurewebsites.net"
@{ apiBase = $apiBase } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $repoRoot "push-config.json") -Encoding utf8NoBOM
Write-Output "Push backend deployed: $apiBase"
Write-Output "Frontend origin allowed: $origin"
