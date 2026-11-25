# THE BACKROOMS — servidor local mínimo (só 127.0.0.1, não expõe nada à rede)
$ErrorActionPreference = 'Stop'
try {
  $root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
  $mime = @{
    '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
    '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'
    '.css'='text/css; charset=utf-8'; '.json'='application/json'
    '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.png'='image/png'; '.webp'='image/webp'; '.gif'='image/gif'; '.svg'='image/svg+xml'
    '.mp3'='audio/mpeg'; '.ogg'='audio/ogg'; '.wav'='audio/wav'; '.m4a'='audio/mp4'
    '.glb'='model/gltf-binary'; '.gltf'='model/gltf+json'; '.bin'='application/octet-stream'
    '.txt'='text/plain; charset=utf-8'; '.woff2'='font/woff2'
  }
  $listener = $null
  $port = 0
  foreach ($p in 8321..8330) {
    try {
      $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $p)
      $l.Start()
      $listener = $l; $port = $p; break
    } catch { }
  }
  if (-not $listener) { throw 'Todas as portas 8321-8330 estão ocupadas. Fecha outros servidores e tenta de novo.' }

  $url = "http://127.0.0.1:$port/backrooms.html"
  Write-Host ''
  Write-Host '  THE BACKROOMS - beta fechada' -ForegroundColor Yellow
  Write-Host "  A servir em:  $url"
  Write-Host '  (só localhost — nada fica exposto na rede)'
  Write-Host '  Fecha esta janela para parar o jogo.'
  Write-Host ''
  Start-Process $url

  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII)
      $requestLine = $reader.ReadLine()
      # ignora o resto dos headers
      while ($true) { $line = $reader.ReadLine(); if ($null -eq $line -or $line -eq '') { break } }
      $parts = $requestLine -split ' '
      $rawPath = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
      $path = $rawPath.Split('?')[0]
      $path = [Uri]::UnescapeDataString($path)
      if ($path -eq '/' -or $path -eq '') { $path = '/backrooms.html' }
      $rel = $path -replace '/', '\'
      if ($rel.StartsWith('\')) { $rel = $rel.Substring(1) }
      $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
      if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'caminho proibido'
      }
      if (Test-Path $full -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
        $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $bytes = [IO.File]::ReadAllBytes($full)
        $head = "HTTP/1.1 200 OK`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
        $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
        $stream.Write($headBytes, 0, $headBytes.Length)
        $stream.Write($bytes, 0, $bytes.Length)
      } else {
        $body = [Text.Encoding]::UTF8.GetBytes('404 — ficheiro nao encontrado')
        $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
        $stream.Write($headBytes, 0, $headBytes.Length)
        $stream.Write($body, 0, $body.Length)
      }
    } catch {
      try { $body = [Text.Encoding]::UTF8.GetBytes('500 — erro no servidor'); $head = "HTTP/1.1 500 Internal Server Error`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"; $b=[Text.Encoding]::ASCII.GetBytes($head); $stream.Write($b,0,$b.Length); $stream.Write($body,0,$body.Length) } catch { }
    } finally {
      $client.Close()
    }
  }
} catch {
  Write-Host ''
  Write-Host "  ERRO: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ''
  Read-Host 'Carrega Enter para sair'
  exit 1
}
