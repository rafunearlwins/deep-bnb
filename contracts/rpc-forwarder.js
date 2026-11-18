// Minimal JSON-RPC forwarder: Ganache's fork client ignores proxy env vars and
// cannot reach the internet directly from this VM (egress requires the proxy).
// This server listens on plain HTTP locally and forwards each request to the
// real BSC RPC via fetch, which DOES honor NODE_USE_ENV_PROXY.
// Usage: node rpc-forwarder.js [port]  (default 8546)
const http = require("http");
const UPSTREAM = "https://bsc-dataseed.binance.org";
const PORT = parseInt(process.argv[2] || "8546", 10);

http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    try {
      const upstream = await fetch(UPSTREAM, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: Buffer.concat(chunks),
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: String(e).slice(0, 200) } }));
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`forwarder listening on 127.0.0.1:${PORT} -> ${UPSTREAM}`));
