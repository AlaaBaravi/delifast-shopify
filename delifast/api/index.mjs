import { createRequestHandler } from "@vercel/remix";

export default createRequestHandler({
  build: () => import("../build/server/index.js"),
});
