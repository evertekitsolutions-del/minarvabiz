import http from "node:http";

const host = process.env.MINARVA_MOCK_SUPABASE_HOST || "127.0.0.1";
const port = Number(process.env.MINARVA_MOCK_SUPABASE_PORT || 54321);
const validToken = "valid-e2e-access-token";
const userId = "11111111-1111-1111-1111-111111111111";

function cors(req, res) {
  const origin = String(req.headers.origin || "");
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, prefer");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
}

function json(req, res, status, body) {
  cors(req, res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function bearer(req) {
  const value = String(req.headers.authorization || "");
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7) : "";
}

const server = http.createServer((req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${host}:${port}`);
  const token = bearer(req);

  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    if (token !== validToken) {
      json(req, res, 401, { msg: "invalid JWT" });
      return;
    }
    json(req, res, 200, { id: userId, email: "e2e@example.test" });
    return;
  }

  if (url.pathname === "/auth/v1/user" && req.method === "PUT") {
    if (token !== validToken) {
      json(req, res, 401, { msg: "invalid recovery token" });
      return;
    }
    json(req, res, 200, { id: userId, email: "e2e@example.test" });
    return;
  }

  if (url.pathname === "/auth/v1/recover" && req.method === "POST") {
    json(req, res, 200, {});
    return;
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    if (token !== validToken) {
      json(req, res, 401, { message: "row-level security / JWT rejection" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/rest/v1/profiles") {
      json(req, res, 200, [{ id: userId }]);
      return;
    }
    if (req.method === "GET") {
      json(req, res, 200, []);
      return;
    }
    json(req, res, req.method === "POST" ? 201 : 200, []);
    return;
  }

  json(req, res, 404, { message: "mock endpoint not found" });
});

server.listen(port, host, () => {
  console.log(`MOCK_SUPABASE_READY http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
