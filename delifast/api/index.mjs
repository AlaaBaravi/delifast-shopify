import { createRequestHandler } from "@vercel/node";

// IMPORTANT: this path is to the built server bundle (generated during build)
import * as build from "../build/server/index.js";

export default createRequestHandler({
  build,
});
