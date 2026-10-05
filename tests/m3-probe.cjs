const fs = require('node:fs');
(async () => {
  if (!process.env.MINIMAX_KEY) throw Error('MINIMAX_KEY missing');
  const start = Date.now();
  const res = await fetch('https://api.minimax.cn/v1/chat/completions', {
    method: 'POST', redirect: 'error',
    headers: { Authorization: 'Bearer ' + process.env.MINIMAX_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'MiniMax-M3', thinking: { type: 'disabled' }, max_tokens: 128, messages: [{ role: 'user', content: '只输出 {"ok":true}' }] }),
    signal: AbortSignal.timeout(60000)
  });
  const json = await res.json();
  const report = { status: res.status, model: json.model, content: json.choices?.[0]?.message?.content, error: json.error?.message || (json.base_resp?.status_code ? json.base_resp.status_msg : undefined), elapsedMs: Date.now() - start };
  fs.mkdirSync('artifacts/device-e2e', { recursive: true });
  fs.writeFileSync('artifacts/device-e2e/m3-probe.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!res.ok || report.error || !report.content?.includes('true')) process.exitCode = 1;
})().catch(e => { console.error(e.message); process.exitCode = 1; });
