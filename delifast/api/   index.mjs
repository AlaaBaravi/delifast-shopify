import { createRequestHandler } from "@react-router/node";
import * as build from "../build/server/index.js";

const handler = createRequestHandler(build, process.env.NODE_ENV);

export default async function (req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end("Server error");
  }
}
