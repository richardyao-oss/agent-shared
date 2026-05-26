param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$Args
)

$cli = Join-Path $env:USERPROFILE '.claude\feishu\cli.py'
py $cli @Args
exit $LASTEXITCODE
