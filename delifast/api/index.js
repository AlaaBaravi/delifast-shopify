import * as build from "../build/server/index.js";
import { createRequestHandler } from "@react-router/node";

// React Router request handler (server build)
const handleRequest = createRequestHandler(build);

export default async function handler(req, res) {
  const origin = `https://${req.headers.host}`;
  const url = new URL(req.url, origin);

  // Create a Web Request from Node req
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
  });

  const response = await handleRequest(request);

  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const body = await response.text();
  res.end(body);
}
