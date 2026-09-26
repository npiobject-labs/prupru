<#
.SYNOPSIS
  Peripateticos: monta una app nueva en las cuentas del usuario, una sola vez,
  desde su PC con Windows. Repositorio en su organizacion de GitHub (desde la
  plantilla), web en GitHub Pages y servidor en Fly.io, con las llaves puestas.

  Lo hace el script : ayudantes, llaves, repositorio, web, servidor, comprobacion.
  Lo hace el usuario: dos inicios de sesion en el navegador (GitHub y Fly.io).

  Normalmente no se ejecuta a mano: lo lanza el archivo montar-<app>.cmd que
  genera docs/pc.html, que fija PERI_APP, PERI_ORG, PERI_USUARIO y, si el
  usuario dio una carpeta de Google Drive, PERI_DRIVE. Drive nunca se toca: solo
  se anota su id en CLAUDE.md, y son las sesiones de Claude las que suben ahi
  sus copias.

.EXAMPLE
  $env:PERI_APP='recetas'; $env:PERI_ORG='apps-de-maria'; irm <url>/peripateticos.ps1 | iex
  .\peripateticos.ps1 -App recetas -Org apps-de-maria -Drive https://drive.google.com/drive/folders/1AbC...
  .\peripateticos.ps1 -App recetas -Org apps-de-maria
  .\peripateticos.ps1 -App recetas -Org apps-de-maria -Simular   # ensena el plan y no toca nada

.NOTES
  Windows PowerShell 5.1: sin ternarios ni "??", $ErrorActionPreference
  "Continue" y $LASTEXITCODE tras cada comando nativo. Solo ASCII: con
  "irm | iex" y sin charset, PowerShell 5.1 leeria mal cualquier acento.
  No usa "exit": lanzado con "irm | iex" cerraria la ventana del usuario.

  Reanudable: cada paso mira primero si ya esta hecho. Si algo falla a mitad,
  volver a abrir el mismo .cmd sigue por donde iba.

  Al final deja en el PC una copia de seguridad de la app, de solo lectura:
  Documentos\Peripateticos\<app>\ (o -Local) con repo\ (el repositorio entero,
  bajado como zip: no hace falta git), la ficha, accesos directos, un LEEME y
  "Actualizar copia.cmd" para volver a traer la ultima version cuando se quiera.

  Solo para pruebas: PERI_URL_WEB y PERI_URL_SERVIDOR sustituyen las URLs que
  se comprueban al final, PERI_URL_ZIP la del zip del repositorio,
  PERI_INTERVALO los segundos entre consultas y PERI_SIN_NAVEGADOR evita abrir
  el navegador.
#>
[CmdletBinding()]
param(
  [string]$App       = $env:PERI_APP,
  [string]$Org       = $env:PERI_ORG,
  [string]$Usuario   = $env:PERI_USUARIO,
  [string]$Drive     = $env:PERI_DRIVE,
  [string]$Plantilla = $(if ($env:PERI_PLANTILLA) { $env:PERI_PLANTILLA } else { "npiobject-labs/DesdeMovil" }),
  [string]$FlyOrg    = $env:PERI_FLY_ORG,
  [string]$Bin       = $env:PERI_BIN,
  [string]$Local     = $env:PERI_LOCAL,
  [int]$TimeoutMin   = 20,
  [switch]$Simular
)

$ErrorActionPreference = "Continue"
$ProgressPreference    = "SilentlyContinue"   # la barra de progreso de 5.1 hace lentisimas las descargas
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

$script:inicio    = Get-Date
$script:intervalo = 10
if ($env:PERI_INTERVALO) { $script:intervalo = [int]$env:PERI_INTERVALO }
$script:ayuda     = @()
$script:hecho     = [ordered]@{}

# ---------------------------------------------------------------- Salida por pantalla
function Paso([string]$t)  { $script:tPaso = Get-Date; Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Seg() {
  if (-not $script:tPaso) { return "" }
  return " ({0})" -f (Tiempo $script:tPaso)
}
function Tiempo([datetime]$desde) {
  $s = [int]((Get-Date) - $desde).TotalSeconds
  if ($s -lt 60) { return "${s}s" }
  return "{0}m {1:00}s" -f [Math]::Floor($s / 60), ($s % 60)
}
function Ok([string]$t)    { Write-Host "   OK  $t$(Seg)" -ForegroundColor Green }
function Aviso([string]$t) { Write-Host "   !!  $t" -ForegroundColor Yellow }
function Nota([string]$t)  { Write-Host "   ..  $t" -ForegroundColor DarkGray }
function Dice([string]$t)  { Write-Host "   $t" }
function Fuerte([string]$t){ Write-Host "   $t" -ForegroundColor White }

# Error que para el montaje. La ayuda son las lineas de "que hacer ahora".
function Falla([string]$t, [string[]]$ayuda = @()) {
  $script:ayuda = $ayuda
  throw $t
}

function Abrir([string]$url) {
  if ($env:PERI_SIN_NAVEGADOR) { Nota "(se abriria $url)"; return }
  try { Start-Process $url } catch { Aviso "Abre tu navegador en: $url" }
}
function Copiar([string]$t) { try { Set-Clipboard -Value $t -ErrorAction Stop } catch { } }

# ---------------------------------------------------------------- Nombres
# Mismas reglas que la pagina del movil: minusculas, digitos y guiones, 15
# caracteres, y si hay que cortar no se parte una palabra.
function Slug([string]$v) {
  $x = "$v".Trim().ToLowerInvariant()
  $x = $x -replace '[\s_.]+', '-'
  $x = $x -replace '[^a-z0-9-]', ''
  $x = $x -replace '-{2,}', '-'
  $x = $x.Trim('-')
  if ($x.Length -gt 15) {
    $x = $x.Substring(0, 15)
    if ($x.IndexOf('-') -gt 0) { $x = $x -replace '-[^-]*$', '' }
  }
  return $x.TrimEnd('-')
}
# Mismas reglas que deploy.yml: <repo>-<owner> en minusculas, [a-z0-9-], 30, sin guion final.
function NombreFly([string]$v) {
  $x = "$v".ToLowerInvariant() -replace '[^a-z0-9-]', '-'
  if ($x.Length -gt 30) { $x = $x.Substring(0, 30) }
  return $x.TrimEnd('-')
}

# Id de una carpeta de Drive a partir de su enlace o del id pelado. Vacio si no lo parece.
# Los ids de carpeta miden unos 33 caracteres: con menos de 25 no se da por bueno.
function IdDrive([string]$v) {
  $v = "$v".Trim().Trim('"').Trim("'")
  if ($v -match '/folders/([A-Za-z0-9_-]+)') { $v = $Matches[1] }
  elseif ($v -match '[?&]id=([A-Za-z0-9_-]+)') { $v = $Matches[1] }
  if ($v -cmatch '^[A-Za-z0-9_-]{25,}$') { return $v }
  return ""
}

# ---------------------------------------------------------------- Comandos nativos
# Devuelve ok, codigo y texto. -SoloSalida descarta stderr (avisos de version,
# barras de progreso) para poder leer JSON o valores limpios.
function Nativo([string]$exe, [string[]]$a, [switch]$SoloSalida) {
  if ($SoloSalida) { $salida = & $exe @a 2>$null } else { $salida = & $exe @a 2>&1 }
  $codigo = $LASTEXITCODE
  $txt = (@($salida) | ForEach-Object { "$_" }) -join "`n"
  return [pscustomobject]@{ ok = ($codigo -eq 0); codigo = $codigo; texto = $txt.Trim() }
}
function Gh([string[]]$a, [switch]$SoloSalida)  { return Nativo $script:gh  $a -SoloSalida:$SoloSalida }
function Fly([string[]]$a, [switch]$SoloSalida) { return Nativo $script:fly $a -SoloSalida:$SoloSalida }

# Repite $listo cada $script:intervalo segundos hasta que devuelva algo o se acabe el tiempo.
function Esperar([string]$que, [scriptblock]$listo, [double]$minutos) {
  $t0 = Get-Date
  $limite = $t0.AddMinutes($minutos)
  $ultimaNota = $t0
  while ((Get-Date) -lt $limite) {
    $r = & $listo
    if ($r) { return $r }
    # Una linea cada 30 s como mucho: que se vea que sigue vivo sin llenar la ventana.
    if (((Get-Date) - $ultimaNota).TotalSeconds -ge 30) { $ultimaNota = Get-Date; Nota ("{0}: {1}" -f $que, (Tiempo $t0)) }
    Start-Sleep -Seconds $script:intervalo
  }
  return $null
}

# ---------------------------------------------------------------- Ayudantes (gh y flyctl)
function Buscar-Exe([string[]]$nombres, [string[]]$rutas) {
  foreach ($n in $nombres) {
    $c = Get-Command $n -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return $c.Path }
  }
  foreach ($r in $rutas) { if ($r -and (Test-Path $r)) { return $r } }
  return $null
}

# Descarga el zip de la ultima version desde las releases de GitHub y deja el
# .exe (y sus .dll) en $Bin. Sin permisos de administrador ni winget.
function Instalar-Ayudante([string]$repo, [string]$patron, [string]$exe, [string]$reserva) {
  $url = $null
  try {
    $rel = Invoke-RestMethod -UseBasicParsing -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "peripateticos" } -TimeoutSec 30
    $asset = @($rel.assets | Where-Object { $_.name -match $patron }) | Select-Object -First 1
    if ($asset) { $url = $asset.browser_download_url }
  } catch { }
  if (-not $url) { $url = $reserva; Nota "usando la version conocida de $exe" }
  $tmp = [IO.Path]::GetTempPath()
  $zip = Join-Path $tmp "peri-$exe.zip"
  $dir = Join-Path $tmp "peri-$exe"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip -TimeoutSec 600
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  Expand-Archive -Path $zip -DestinationPath $dir -Force
  Get-ChildItem -Path $dir -Recurse -Include "$exe.exe", "*.dll" | Copy-Item -Destination $Bin -Force
  Remove-Item -Force $zip -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
  $destino = Join-Path $Bin "$exe.exe"
  if (-not (Test-Path $destino)) { Falla "No se pudo instalar $exe." @("Comprueba que el PC tiene internet y vuelve a abrir el archivo.") }
  return $destino
}

# ---------------------------------------------------------------- GitHub: runs y ficheros
function Runs([string]$wf) {
  $jq = '.[] | [.databaseId, .status, (.conclusion // ""), .event, .createdAt, .url] | @tsv'
  $r = Gh @("run", "list", "-R", $script:repo, "--workflow", $wf, "--limit", "20",
            "--json", "databaseId,status,conclusion,event,createdAt,url", "--jq", $jq) -SoloSalida
  $lista = @()
  if (-not $r.ok -or -not $r.texto) { return $lista }
  foreach ($l in ($r.texto -split "`n")) {
    $c = $l.Trim() -split "`t"
    if ($c.Count -ge 6) {
      $lista += [pscustomobject]@{ id = $c[0]; status = $c[1]; conclusion = $c[2]; event = $c[3]; creado = $c[4]; url = $c[5] }
    }
  }
  return $lista
}

# Garantiza un run en verde de $wf lanzado por workflow_dispatch despues de
# $desde (hora de GitHub, ISO). Si el que encuentra falla y no lo lanzo este
# script, lanza uno propio; si el propio falla, para.
function Asegurar-Run([string]$wf, [string]$desde, [string]$etiqueta, [double]$minutos) {
  $propio = $false
  $wfLocal = $wf; $desdeLocal = $desde
  $run = Esperar $etiqueta { Runs $wfLocal | Where-Object { $_.event -eq "workflow_dispatch" -and $_.creado -ge $desdeLocal } | Select-Object -First 1 } 1.5
  while ($true) {
    if (-not $run) {
      if ($propio) { Falla "GitHub no arranca $wf." @("Vuelve a abrir el archivo dentro de unos minutos.") }
      $antes = @(Runs $wf | ForEach-Object { $_.id })
      $l = Gh @("workflow", "run", $wf, "-R", $script:repo, "--ref", "main")
      if (-not $l.ok) { Falla "No se pudo lanzar $wf : $($l.texto)" }
      $propio = $true
      $run = Esperar $etiqueta { Runs $wfLocal | Where-Object { $antes -notcontains $_.id } | Select-Object -First 1 } 2
      continue
    }
    $id = $run.id
    $fin = Esperar $etiqueta { Runs $wfLocal | Where-Object { $_.id -eq $id -and $_.status -eq "completed" } | Select-Object -First 1 } $minutos
    if (-not $fin) { Falla "$etiqueta lleva mas de $minutos minutos." @("Mira lo que pasa aqui: $($run.url)", "Vuelve a abrir el archivo: sigue donde lo dejo.") }
    if ($fin.conclusion -eq "success") { return $fin }
    if ($propio) { Falla "$etiqueta ha fallado." @("Detalle: $($fin.url)", "Haz una foto de esa pagina y pegasela a Claude, o vuelve a abrir el archivo.") }
    Nota "el intento anterior no salio bien ($($fin.conclusion)); lo lanzo otra vez"
    $run = $null
  }
}

function Leer-Fichero([string]$ruta) {
  $r = Gh @("api", "repos/$($script:repo)/contents/$ruta", "--jq", '[.sha, .content] | @tsv') -SoloSalida
  if (-not $r.ok -or -not $r.texto) { return $null }
  $p = $r.texto -split "`t", 2
  $b64 = $p[1] -replace '\\n', ''
  return [pscustomobject]@{ sha = $p[0]; texto = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) }
}
function Escribir-Fichero([string]$ruta, [string]$texto, [string]$sha, [string]$mensaje) {
  $cuerpo = [ordered]@{ message = $mensaje; content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($texto)) }
  if ($sha) { $cuerpo.sha = $sha }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("peri-" + [guid]::NewGuid().ToString("N") + ".json")
  # Sin BOM: el lector JSON de gh no lo acepta.
  [IO.File]::WriteAllText($tmp, ($cuerpo | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false))
  $r = Gh @("api", "-X", "PUT", "repos/$($script:repo)/contents/$ruta", "--input", $tmp, "--silent")
  Remove-Item -Force $tmp -ErrorAction SilentlyContinue
  return $r.ok
}

function Http([string]$url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 30 -Headers @{ "Cache-Control" = "no-cache" }
    # Bytes a UTF-8 a mano: sin charset, 5.1 decodificaria en ISO-8859-1.
    $txt = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    return [pscustomobject]@{ codigo = [int]$r.StatusCode; texto = $txt }
  } catch { return $null }
}

# ---------------------------------------------------------------- Copia en el PC
# Baja el zip de la rama main (repositorio publico: sin credenciales ni git) y
# deja su contenido en $destino, sustituyendo lo que hubiera: es un espejo.
function Bajar-Repo([string]$url, [string]$destino) {
  $tmp = [IO.Path]::GetTempPath()
  $zip = Join-Path $tmp "peri-copia.zip"
  $dir = Join-Path $tmp "peri-copia"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip -TimeoutSec 300
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  Expand-Archive -Path $zip -DestinationPath $dir -Force
  $raiz = Get-ChildItem -Path $dir | Select-Object -First 1   # el zip trae <repo>-main/
  if (-not $raiz) { throw "el zip del repositorio viene vacio" }
  if (Test-Path $destino) { Remove-Item -Recurse -Force $destino }
  Move-Item -Path $raiz.FullName -Destination $destino
  Remove-Item -Force $zip -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}
function Acceso([string]$carpeta, [string]$nombre, [string]$url) {
  [IO.File]::WriteAllLines((Join-Path $carpeta "$nombre.url"), [string[]]@("[InternetShortcut]", "URL=$url"))
}

# ================================================================ Montaje
function Principal {
  Write-Host ""
  Write-Host "  +--------------------------------------------------------+" -ForegroundColor Cyan
  Write-Host ("  |  Peripateticos  ::  montar la app {0,-21}|" -f ('"' + $script:App + '"')) -ForegroundColor Cyan
  Write-Host "  +--------------------------------------------------------+" -ForegroundColor Cyan
  Write-Host "  |  Lo hace el PC : GitHub + web + servidor + llaves       |" -ForegroundColor DarkGray
  Write-Host "  |  Lo pones tu   : dos inicios de sesion en el navegador  |" -ForegroundColor DarkGray
  Write-Host "  +--------------------------------------------------------+" -ForegroundColor Cyan
  Write-Host ""
  Fuerte "No cierres esta ventana. Puedes minimizarla."
  Dice   "No tienes que escribir nada aqui."

  $App = $script:App; $Org = $script:Org
  $flyApp   = NombreFly "$App-$Org"
  $orgMin   = $Org.ToLowerInvariant()
  $web      = "https://$orgMin.github.io/$App/"
  $servidor = "https://$flyApp.fly.dev/"
  $script:repo = "$Org/$App"

  if ($Simular) {
    Write-Host ""
    Write-Host "== Plan (-Simular: no se toca nada)" -ForegroundColor Cyan
    Dice "App          : $App"
    Dice "Repositorio  : https://github.com/$($script:repo)  (publico, desde $Plantilla)"
    Dice "Web          : $web"
    Dice "Servidor     : $servidor  (app de Fly '$flyApp')"
    if ($script:Drive) { Dice "Drive        : https://drive.google.com/drive/folders/$($script:Drive)  (solo se anota)" }
    Dice "Ayudantes en : $Bin"
    return
  }

  # ------------------------------------------------------------ 1/6 Ayudantes
  Paso "1/7 Ayudantes"
  if (-not (Test-Path $Bin)) { New-Item -ItemType Directory -Force $Bin | Out-Null }
  $arm = ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64")
  $script:gh = Buscar-Exe @("gh") @((Join-Path $Bin "gh.exe"), "$env:ProgramFiles\GitHub CLI\gh.exe")
  if ($script:gh) { Ok "Ayudante de GitHub: ya estaba" }
  else {
    $p = '_windows_amd64\.zip$'; if ($arm) { $p = '_windows_arm64\.zip$' }
    $script:gh = Instalar-Ayudante "cli/cli" $p "gh" "https://github.com/cli/cli/releases/download/v2.60.0/gh_2.60.0_windows_amd64.zip"
    Ok "Ayudante de GitHub instalado"
  }
  $script:fly = Buscar-Exe @("flyctl", "fly") @((Join-Path $Bin "flyctl.exe"), "$env:USERPROFILE\.fly\bin\flyctl.exe")
  if ($script:fly) { Ok "Ayudante de Fly.io: ya estaba" }
  else {
    $p = '_Windows_x86_64\.zip$'; if ($arm) { $p = '_Windows_arm64\.zip$' }
    $script:fly = Instalar-Ayudante "superfly/flyctl" $p "flyctl" "https://github.com/superfly/flyctl/releases/download/v0.3.40/flyctl_0.3.40_Windows_x86_64.zip"
    Ok "Ayudante de Fly.io instalado"
  }
  $script:hecho.ayudantes = $true

  # ------------------------------------------------------------ 2/6 GitHub
  Paso "2/7 Entrar en GitHub"
  $estado = Gh @("auth", "status", "--hostname", "github.com")
  $faltan = $true
  if ($estado.ok -and $estado.texto -match "Token scopes:\s*(.*)") {
    $sc = $Matches[1]
    $faltan = -not (($sc -match "admin:org") -and ($sc -match "(^|[\s',])repo([\s',]|$)") -and ($sc -match "workflow"))
  }
  if ($faltan) {
    Dice "Se va a abrir tu navegador en GitHub."
    Dice "Cuando te pida un codigo, escribe el que sale aqui abajo"
    Dice "(tambien lo tienes copiado: puedes pegarlo)."
    $script:codigoVisto = $false
    $script:lineasLogin = @()
    # Con la entrada y la salida redirigidas, gh no espera a que se pulse Intro
    # ni abre el navegador: el codigo se lee de su salida y el navegador lo
    # abre este script.
    "" | & $script:gh auth login --hostname github.com --git-protocol https --web --scopes "repo,workflow,admin:org" 2>&1 | ForEach-Object {
      $l = "$_"
      $script:lineasLogin += $l
      if (-not $script:codigoVisto -and $l -match '\b([A-Z0-9]{4}-[A-Z0-9]{4})\b') {
        $script:codigoVisto = $true
        Write-Host ""
        Write-Host ("            " + $Matches[1] + "            ") -ForegroundColor Black -BackgroundColor Yellow
        Write-Host ""
        Copiar $Matches[1]
        Abrir "https://github.com/login/device"
        Nota "Esperando a que lo autorices en el navegador (tienes 15 minutos)"
      }
    }
    if ($LASTEXITCODE -ne 0) {
      $detalle = @($script:lineasLogin | Where-Object { $_ -and $_ -notmatch 'one-time code|Open this URL' } | Select-Object -Last 2)
      Falla "No se completo la entrada en GitHub." (@("Vuelve a abrir el archivo y, en GitHub, pulsa 'Authorize'.") + $detalle)
    }
  }
  $login = (Gh @("api", "user", "-q", ".login") -SoloSalida).texto
  if (-not $login) { Falla "GitHub no responde con tu usuario." @("Vuelve a abrir el archivo.") }
  Ok "Hola, $login"
  if ($Usuario -and ($Usuario -ne $login)) { Aviso "En el movil escribiste '$Usuario'; has entrado como '$login'. Sigo con '$login'." }

  $o = Gh @("api", "orgs/$Org", "-q", ".login") -SoloSalida
  if (-not $o.ok -or -not $o.texto) {
    Falla "No encuentro la organizacion '$Org' en GitHub." @("Creala en https://github.com/organizations/plan (plan Free) y vuelve a abrir el archivo.")
  }
  $Org = $o.texto; $script:Org = $Org; $script:repo = "$Org/$App"
  $rol = Gh @("api", "user/memberships/orgs/$Org", "-q", ".role") -SoloSalida
  if (-not $rol.ok -or $rol.texto -ne "admin") {
    Falla "Tu usuario '$login' no administra la organizacion '$Org'." @("Entra en GitHub con la cuenta que creo la organizacion, o pide a quien la creo que te haga 'Owner'.")
  }
  Ok "Organizacion $Org encontrada; tienes permiso de administracion"
  # La app de GitHub de Claude, en la organizacion. Si solo tiene permiso en
  # "los repositorios elegidos", el de esta app hay que anadirselo al crearlo:
  # pasa desde la segunda app de la misma organizacion.
  $jqClaude = '.installations[] | select(.app_slug | test("claude")) | [.id, .repository_selection] | @tsv'
  $inst = Gh @("api", "orgs/$Org/installations", "--jq", $jqClaude) -SoloSalida
  $claudeId = ""; $claudeSel = ""
  if ($inst.ok -and $inst.texto) { $p = (($inst.texto -split "`n")[0]).Trim() -split "`t"; $claudeId = $p[0]; if ($p.Count -gt 1) { $claudeSel = $p[1] } }
  $claude = [bool]$claudeId
  $claudeUrl = "https://github.com/apps/claude/installations/new"
  if ($claude) { $claudeUrl = "https://github.com/organizations/$Org/settings/installations/$claudeId" }
  if ($claude -and $claudeSel -eq "all") { Ok "Claude ya tiene permiso en $Org (en todos sus repositorios)" }
  elseif ($claude) { Ok "Claude tiene permiso en $Org en los repositorios elegidos; le anado el de esta app" }
  else {
    Aviso "Claude aun no tiene permiso en $Org. No hace falta para montar la app;"
    Aviso "hara falta para pedirle cosas. Dale permiso aqui (elige $Org):"
    Dice  $claudeUrl
  }

  # ------------------------------------------------------------ 3/6 Fly.io
  Paso "3/7 Entrar en Fly.io"
  $w = Fly @("auth", "whoami") -SoloSalida
  if (-not $w.ok) {
    Dice "Se abre el navegador otra vez, ahora en Fly.io. Pulsa 'Authorize'."
    & $script:fly auth login
    $w = Fly @("auth", "whoami") -SoloSalida
    if (-not $w.ok) { Falla "No se completo la entrada en Fly.io." @("Vuelve a abrir el archivo y, en Fly.io, pulsa 'Authorize'.") }
  }
  $cuenta = (($w.texto -split "`n") | Select-Object -Last 1).Trim()
  Ok "Cuenta de Fly.io: $cuenta"
  if (-not $FlyOrg) {
    $l = Fly @("orgs", "list", "--json") -SoloSalida
    $slugs = @()
    try {
      $j = $l.texto | ConvertFrom-Json
      if ($j -is [array]) { $slugs = @($j | ForEach-Object { $_.slug }) }
      else { $slugs = @($j.PSObject.Properties | ForEach-Object { $_.Name }) }
    } catch { }
    if ($slugs -contains "personal") { $FlyOrg = "personal" } elseif ($slugs.Count -gt 0) { $FlyOrg = $slugs[0] }
    if (-not $FlyOrg) { Falla "No encuentro ninguna organizacion en tu cuenta de Fly.io." @("Entra en https://fly.io/dashboard y vuelve a abrir el archivo.") }
  }
  Nota "organizacion de Fly.io: $FlyOrg"

  # ------------------------------------------------------------ 4/6 Llaves
  Paso "4/7 Llaves"
  # El token se crea y se guarda sin pasar por la pantalla ni por el disco.
  $salida = & $script:fly tokens create org -o $FlyOrg -n "peripateticos-$Org" -x 87600h 2>$null
  $token = @($salida | ForEach-Object { "$_".Trim() } | Where-Object { $_ -match '^(FlyV1 |fm\d_)' }) | Select-Object -Last 1
  if (-not $token) { Falla "Fly.io no ha dado la llave del servidor." @("Vuelve a abrir el archivo.") }
  $r = $token | & $script:gh secret set FLY_API_TOKEN --org $Org --visibility all 2>&1
  $okSecreto = ($LASTEXITCODE -eq 0)
  $token = $null; $salida = $null
  if (-not $okSecreto) { Falla "No se pudo guardar la llave en tu organizacion de GitHub: $r" @("Vuelve a abrir el archivo.") }
  Ok "Llave del servidor creada (solo vale para tu organizacion de Fly.io)"
  Ok "Guardada en $Org como secreto (no se muestra)"
  $v = Gh @("variable", "set", "FLY_ORG", "--org", $Org, "--visibility", "all", "--body", $FlyOrg)
  if (-not $v.ok) { Aviso "No se pudo guardar FLY_ORG en la organizacion; lo pongo en el repositorio." }
  Fuerte "Ya no te voy a pedir nada mas. Puedes ir a por un cafe."

  # ------------------------------------------------------------ 5/6 Tu app
  Paso "5/7 Tu app"
  $c = Fly @("apps", "create", $flyApp, "--org", $FlyOrg)
  if (-not $c.ok -and $c.texto -match "payment|credit card|billing|trial") {
    Aviso "Fly.io pide una tarjeta antes de crear servidores."
    Dice  "Se abre la pagina para anadirla. No cobra nada mientras la app sea pequena."
    Abrir "https://fly.io/dashboard/$FlyOrg/billing"
    [void](Read-Host "   Cuando la hayas anadido, pulsa Intro aqui")
    $c = Fly @("apps", "create", $flyApp, "--org", $FlyOrg)
  }
  if ($c.ok) { Ok "Nombre '$flyApp' reservado en Fly.io" }
  elseif ($c.texto -match "taken|already|exists") {
    $mias = Fly @("apps", "list", "--org", $FlyOrg, "--json") -SoloSalida
    if ($mias.texto -match ('"' + [regex]::Escape($flyApp) + '"')) { Ok "El nombre '$flyApp' ya era tuyo en Fly.io" }
    else { Falla "El nombre '$flyApp' esta cogido por otra persona en Fly.io. No se ha creado nada." @("Vuelve al movil, cambia el nombre en el paso 1 y descarga el archivo nuevo.") }
  } else { Falla "Fly.io no deja crear el servidor: $($c.texto)" @("Vuelve a abrir el archivo. Si se repite, haz una foto y pegasela a Claude.") }
  $script:hecho.fly = $flyApp

  $existe = Gh @("repo", "view", $script:repo, "--json", "name", "-q", ".name") -SoloSalida
  if ($existe.ok) { Ok "$($script:repo) ya existia: sigo donde lo deje" }
  else {
    $cr = Gh @("repo", "create", $script:repo, "--template", $Plantilla, "--public", "--description", "App creada con Peripateticos")
    if (-not $cr.ok) { Falla "No se pudo crear $($script:repo): $($cr.texto)" @("Vuelve a abrir el archivo.") }
    Ok "$($script:repo) creada a partir del molde"
  }
  $script:hecho.repo = $script:repo
  $creado = (Gh @("api", "repos/$($script:repo)", "-q", ".created_at") -SoloSalida).texto
  if ($claude -and $claudeSel -ne "all") {
    $rid = (Gh @("api", "repos/$($script:repo)", "-q", ".id") -SoloSalida).texto
    $add = Gh @("api", "-X", "PUT", "user/installations/$claudeId/repositories/$rid", "--silent")
    if ($add.ok) { Ok "Claude tiene acceso a $($script:repo)" }
    else {
      $claude = $false
      Aviso "No he podido dar a Claude acceso a $($script:repo). Anadelo aqui, en 'Repository access':"
      Dice  $claudeUrl
    }
  }

  $okVars = (Gh @("variable", "set", "FLY_APP", "-R", $script:repo, "--body", $flyApp)).ok
  $okVars = (Gh @("variable", "set", "FLY_ORG", "-R", $script:repo, "--body", $FlyOrg)).ok -and $okVars
  if (-not $okVars) { Falla "No se pudieron guardar los datos del servidor en el repositorio." @("Vuelve a abrir el archivo.") }

  # Pages con origen "GitHub Actions". Justo despues de crear el repositorio
  # GitHub aun esta copiando el molde, asi que se reintenta un minuto.
  $repoLocal = $script:repo
  $pages = Esperar "Activando la web" {
    if ((Gh @("api", "-X", "POST", "repos/$repoLocal/pages", "-f", "build_type=workflow", "--silent")).ok) { return $true }
    if ((Gh @("api", "-X", "PUT",  "repos/$repoLocal/pages", "-f", "build_type=workflow", "--silent")).ok) { return $true }
    return $null
  } 1.5
  if (-not $pages) { Falla "No se pudo activar la web de $($script:repo)." @("Vuelve a abrir el archivo en unos minutos.") }
  Ok "Web activada"

  $init = Esperar "Poniendo tu nombre en todo" {
    $m = Gh @("api", "repos/$repoLocal/contents/.plantilla-pendiente", "--silent")
    if (-not $m.ok -and $m.texto -match "404|Not Found") { return "ok" }
    $u = Runs "init-plantilla.yml" | Select-Object -First 1
    if ($u -and $u.status -eq "completed" -and $u.conclusion -ne "success") { return $u.url }
    return $null
  } $TimeoutMin
  if (-not $init) { Falla "Poner el nombre lleva demasiado." @("Vuelve a abrir el archivo en unos minutos.") }
  if ($init -ne "ok") { Falla "No se pudo poner el nombre a la app." @("Detalle: $init", "Haz una foto de esa pagina y pegasela a Claude.") }
  Ok "Tu nombre puesto en todo: web, servidor, textos"

  # Parametros de CLAUDE.md, que leen las sesiones de Claude: la app de Fly y,
  # si se dio, la carpeta de Drive donde cada sesion deja su resumen.
  $cm = Leer-Fichero "CLAUDE.md"
  if ($cm) {
    $nuevo = [regex]::Replace($cm.texto, '(?m)^(\| App de Fly\.io \|).*$', ('$1 `' + $flyApp + '` |'))
    if ($script:Drive) { $nuevo = [regex]::Replace($nuevo, '(?m)^(\| Carpeta de Drive \(id\) \|).*$', ('$1 `' + $script:Drive + '` |')) }
    if ($nuevo -ne $cm.texto) {
      $msg = "Anotar la app de Fly.io"; if ($script:Drive) { $msg = "Anotar la app de Fly.io y la carpeta de Drive" }
      if (Escribir-Fichero "CLAUDE.md" $nuevo $cm.sha $msg) {
        Ok "Ficha del proyecto anotada para Claude"
        if ($script:Drive) { Ok "Carpeta de Drive anotada: ahi dejara Claude el resumen de cada sesion" }
      }
      else { Aviso "No se pudo anotar la ficha en CLAUDE.md (no es grave)" }
    }
  }

  Nota "Construyendo el servidor. La primera vez tarda entre 2 y 5 minutos; no es un fallo."
  $dep = Asegurar-Run "deploy.yml" $creado "Construyendo el servidor" $TimeoutMin
  Ok "Servidor construido ($($dep.url))"
  $pag = Asegurar-Run "pages.yml" $creado "Publicando la web" 10
  Ok "Web publicada"

  # ------------------------------------------------------------ 6/6 Comprobacion
  Paso "6/7 Comprobacion"
  $urlWeb = $web; if ($env:PERI_URL_WEB) { $urlWeb = $env:PERI_URL_WEB }
  $urlSrv = $servidor; if ($env:PERI_URL_SERVIDOR) { $urlSrv = $env:PERI_URL_SERVIDOR }
  $appLocal = $App
  $w = Esperar "Esperando a tu web" { $h = Http $urlWeb; if ($h -and $h.codigo -eq 200 -and $h.texto -match [regex]::Escape($appLocal)) { $h } } 5
  if ($w) { Ok "Web viva: $web" } else { Aviso "La web aun no responde (a veces tarda unos minutos mas): $web" }
  $hola = Esperar "Preguntandole si esta viva" {
    $h = Http ($urlSrv + "hola")
    if ($h -and $h.codigo -eq 200) { try { $h.texto | ConvertFrom-Json } catch { $null } }
  } 3
  if (-not $hola) { Falla "El servidor no contesta en $($servidor)hola." @("Vuelve a abrir el archivo dentro de unos minutos.") }
  if ("$($hola.app)" -ne $App) { Aviso "Contesta '$($hola.app)' en vez de '$App'." }
  Ok ('"' + $hola.mensaje + '"')
  # PowerShell 7 convierte la fecha ISO en [datetime]; 5.1 la deja como texto.
  $fecha = $hola.fecha
  if ($fecha -is [datetime]) { $fecha = $fecha.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss") } else { $fecha = "$fecha" -replace 'T', ' ' -replace 'Z', '' }
  $version = "$($hola.version)"; if ($version.Length -gt 7) { $version = $version.Substring(0, 7) }
  Dice ("    {0} UTC - {1} - version {2}" -f $fecha, $hola.region, $version)

  # Registro publico del nacimiento: lo lee el movil para dar por verificados
  # Fly.io y Claude, y la portada de la app para saber su fecha y su servidor.
  # docs/ es publico: nada de correos ni datos personales.
  $nac = [ordered]@{
    app = $App; org = $Org; repo = $script:repo; usuario = $login
    fly_app = $flyApp; fly_org = $FlyOrg; web = $web; servidor = $servidor
    drive = [bool]$script:Drive
    creado = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
    instalador = "peripateticos.ps1 v1"
    verificado = [ordered]@{ github = $true; org = $true; fly = $true; claude = [bool]$claude }
    hola = [ordered]@{ mensaje = $hola.mensaje; fecha = $fecha.Replace(' ', 'T') + 'Z'; region = $hola.region; version = $hola.version }
  }
  $prev = Leer-Fichero "docs/nacimiento.json"
  $shaPrev = $null; if ($prev) { $shaPrev = $prev.sha }
  if (Escribir-Fichero "docs/nacimiento.json" ($nac | ConvertTo-Json -Depth 4) $shaPrev "Registrar el nacimiento de la app") { Ok "Nacimiento registrado" }
  else { Aviso "No se pudo registrar el nacimiento (el movil lo comprobara por su cuenta)" }

  # ------------------------------------------------------------ 7/7 Copia en el PC
  Paso "7/7 Copia en tu PC"
  $lineas = @(
    ("Web         " + $web),
    ("Servidor    " + $servidor),
    ("Saludo      " + $servidor + "hola"),
    ("Donde vive  https://github.com/" + $script:repo),
    ("Bitacora    " + $web + "bitacora.html")
  )
  if ($script:Drive) { $lineas += ("Drive       https://drive.google.com/drive/folders/" + $script:Drive) }
  $carpeta = $Local
  if (-not $carpeta) {
    $docs = [Environment]::GetFolderPath("MyDocuments")
    if (-not $docs) { $docs = $HOME }
    $carpeta = Join-Path (Join-Path $docs "Peripateticos") $App
  }
  $urlZip = "https://github.com/$($script:repo)/archive/refs/heads/main.zip"
  if ($env:PERI_URL_ZIP) { $urlZip = $env:PERI_URL_ZIP }
  $copia = $null
  try {
    if (-not (Test-Path $carpeta)) { New-Item -ItemType Directory -Force $carpeta | Out-Null }
    # Recien hechos los commits, el zip puede tardar unos segundos en traerlos.
    $destinoRepo = Join-Path $carpeta "repo"
    $copia = Esperar "Bajando la copia" { try { Bajar-Repo $urlZip $destinoRepo; "ok" } catch { $script:errCopia = $_.Exception.Message; $null } } 1
    if ($copia) { Ok "Copia del repositorio en $destinoRepo" }
    else { Aviso "No se pudo bajar la copia ($($script:errCopia)). Luego: doble clic en 'Actualizar copia.cmd'." }

    $txt = @("Tu app $App", ("=" * 60), "") + $lineas + @("",
      "Nacida el $($nac.creado) con Peripateticos.",
      "Para cambiarla: Claude en el movil -> Code -> $($script:repo).")
    [IO.File]::WriteAllLines((Join-Path $carpeta "$App.txt"), [string[]]$txt)

    Acceso $carpeta "Web de $App" $web
    Acceso $carpeta "Servidor de $App" ($servidor + "hola")
    Acceso $carpeta "Bitacora de $App" ($web + "bitacora.html")
    Acceso $carpeta "Codigo en GitHub" ("https://github.com/" + $script:repo)
    Acceso $carpeta "Claude Code" "https://claude.ai/code"
    if ($script:Drive) { Acceso $carpeta "Carpeta de Drive" ("https://drive.google.com/drive/folders/" + $script:Drive) }

    [IO.File]::WriteAllLines((Join-Path $carpeta "LEEME.txt"), [string[]]@(
      "Copia de seguridad de $App",
      ("=" * 60),
      "",
      "Esta carpeta es una COPIA de tu app. No edites nada aqui: tu app se",
      "cambia desde el movil, pidiendoselo a Claude. Lo que cambies aqui se",
      "pierde la proxima vez que actualices la copia.",
      "",
      "repo\                    todo el repositorio: CLAUDE.md, documentacion,",
      "                         paginas (docs\) y servidor (app\).",
      "$App.txt                 la ficha: donde vive cada cosa.",
      "Actualizar copia.cmd     doble clic: trae la ultima version de GitHub.",
      "*.url                    accesos directos a la web, el servidor, la",
      "                         bitacora, el codigo, Claude y tu Drive."))

    # Actualizar la copia: autosuficiente, no depende de esta web ni del instalador.
    $ps = "try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; " +
          "`$ProgressPreference = 'SilentlyContinue'; `$d = `$env:PERI_DIR.TrimEnd('\'); `$z = Join-Path `$env:TEMP 'peri-copia.zip'; `$t = Join-Path `$env:TEMP 'peri-copia'; " +
          "Write-Host 'Bajando la ultima version de $($script:repo)...'; Invoke-WebRequest -UseBasicParsing -Uri `$env:PERI_ZIP -OutFile `$z; " +
          "if (Test-Path `$t) { Remove-Item -Recurse -Force `$t }; Expand-Archive -Path `$z -DestinationPath `$t -Force; " +
          "`$r = Join-Path `$d 'repo'; if (Test-Path `$r) { Remove-Item -Recurse -Force `$r }; " +
          "Move-Item -Path (Get-ChildItem `$t | Select-Object -First 1).FullName -Destination `$r; Remove-Item -Force `$z; " +
          "Write-Host 'Copia actualizada.' -ForegroundColor Green } catch { Write-Host ('No se pudo actualizar: ' + `$_.Exception.Message) -ForegroundColor Red }"
    $cmd = @("@echo off", "title Actualizar la copia de $App", "setlocal",
      'set "PERI_DIR=%~dp0"',
      ('set "PERI_ZIP=' + ("https://github.com/$($script:repo)/archive/refs/heads/main.zip") + '"'),
      ('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "' + $ps + '"'),
      "echo.", "echo Pulsa una tecla para cerrar esta ventana.", "pause >nul")
    [IO.File]::WriteAllText((Join-Path $carpeta "Actualizar copia.cmd"), (($cmd -join "`r`n") + "`r`n"), (New-Object Text.ASCIIEncoding))
    Ok "Ficha, accesos directos y 'Actualizar copia.cmd' en $carpeta"

    # Acceso a la carpeta en el escritorio (solo Windows; si falla, no pasa nada).
    try {
      $esc = [Environment]::GetFolderPath("Desktop")
      if ($esc -and (Test-Path $esc) -and -not $Local) {
        $wsh = New-Object -ComObject WScript.Shell
        $lnk = $wsh.CreateShortcut((Join-Path $esc "Peripateticos - $App.lnk"))
        $lnk.TargetPath = $carpeta; $lnk.Save()
        Ok "Acceso a la carpeta en el escritorio"
      }
    } catch { }
  } catch { Aviso "No se pudo preparar la carpeta del PC: $($_.Exception.Message)" }

  $mins = [Math]::Round(((Get-Date) - $script:inicio).TotalMinutes, 1)
  Write-Host ""
  Write-Host ("================ {0} lista en {1} min ================" -f $App, $mins) -ForegroundColor Green
  foreach ($l in $lineas) { Dice $l }
  Dice ("Copia       " + $carpeta)
  if (-not $claude) { Write-Host ""; Aviso "Falta dar permiso a Claude en $($script:repo): $claudeUrl" }

  Write-Host ""
  Fuerte "Ya puedes apagar el PC. Vuelve al movil: el paso 7 se marca"
  Fuerte "solo en cuanto tu app responde."
  if ($script:Drive) { Fuerte "Despues, el paso 8: que Claude compruebe tu carpeta de Drive." }
  Abrir $web
}

# ================================================================ Arranque
$script:App = Slug $App
$script:Org = "$Org".Trim() -replace '^@', '' -replace '[^A-Za-z0-9-]', ''
# Ojo: a nivel de script, $script:Drive y el parametro $Drive son la misma variable.
$driveDado = "$Drive"
$script:Drive = IdDrive $driveDado
if ($driveDado -and -not $script:Drive) { Write-Host "   !!  El enlace de Drive no parece de una carpeta; sigo sin Drive." -ForegroundColor Yellow }
if (-not $Bin) {
  if ($env:LOCALAPPDATA) { $Bin = Join-Path $env:LOCALAPPDATA "Peripateticos\bin" }
  else { $Bin = Join-Path $HOME ".peripateticos/bin" }
}
try { $Host.UI.RawUI.WindowTitle = "Peripateticos - $($script:App)" } catch { }

try {
  if ($PSVersionTable.PSVersion.Major -lt 5) { Falla "Este Windows es demasiado antiguo (PowerShell $($PSVersionTable.PSVersion))." @("Hace falta Windows 10 u 11.") }
  if (-not $script:App) { $script:App = Slug (Read-Host "   Nombre de tu app") }
  if (-not $script:Org) { $script:Org = (Read-Host "   Nombre de tu organizacion de GitHub").Trim() }
  if (-not $script:App -or -not $script:Org) { Falla "Faltan el nombre de la app o el de la organizacion." @("Descarga el archivo otra vez desde la pagina del movil.") }
  Principal
} catch {
  Write-Host ""
  Write-Host "   XX  $($_.Exception.Message)" -ForegroundColor Red
  foreach ($l in $script:ayuda) { Write-Host "       $l" -ForegroundColor Yellow }
  if ($script:hecho.Count -gt 0) {
    Write-Host ""
    Dice "No se ha perdido nada: vuelve a abrir el mismo archivo y sigue donde lo dejo."
  }
}
