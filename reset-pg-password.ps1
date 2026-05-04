# Script ini harus dijalankan sebagai Administrator
# Cara: klik kanan PowerShell -> "Run as Administrator" -> paste konten ini

# 1. Stop PostgreSQL service
Write-Host "Stopping PostgreSQL service..." -ForegroundColor Yellow
Stop-Service -Name "postgresql-x64-17" -Force

# 2. Temporarily add trust auth to pg_hba.conf
$pgHbaPath = "C:\PostgreSQL\17\data\pg_hba.conf"
$content = Get-Content $pgHbaPath
Copy-Item $pgHbaPath "$pgHbaPath.bak"

# Add trust line at the top (before other rules)
$trustLine = "host    all             postgres        127.0.0.1/32            trust"
$newContent = @($trustLine) + $content
$newContent | Set-Content $pgHbaPath

# 3. Start PostgreSQL
Write-Host "Starting PostgreSQL service..." -ForegroundColor Yellow
Start-Service -Name "postgresql-x64-17"
Start-Sleep -Seconds 3

# 4. Reset password
Write-Host "Resetting postgres password to 'emg2026'..." -ForegroundColor Yellow
$env:PGPASSWORD = ""
& "C:\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -c "ALTER USER postgres WITH PASSWORD 'emg2026';"

# 5. Create EMG database
& "C:\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -c "CREATE DATABASE emg_db;" 2>&1

# 6. Restore original pg_hba.conf
Write-Host "Restoring pg_hba.conf..." -ForegroundColor Yellow
Copy-Item "$pgHbaPath.bak" $pgHbaPath -Force

# 7. Restart PostgreSQL
Restart-Service -Name "postgresql-x64-17"
Start-Sleep -Seconds 3

# 8. Verify
$env:PGPASSWORD = "emg2026"
$result = & "C:\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -c "SELECT version();" 2>&1
Write-Host $result

Write-Host "`n✅ Done! New password: emg2026" -ForegroundColor Green
Write-Host "✅ Database emg_db created" -ForegroundColor Green
