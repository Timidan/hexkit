import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleEtherscanLookup } from "./etherscanShared.js";

export const config = {
  api: { bodyParser: true },
  maxDuration: 30,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(204).setHeader("cache-control", "no-store").end();
    return;
  }

  if (req.method !== "POST") {
    res
      .status(405)
      .setHeader("cache-control", "no-store")
      .json({ error: "method_not_allowed" });
    return;
  }

  const response = await handleEtherscanLookup(req.body, process.env);
  res.status(response.status);

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const body = Buffer.from(await response.arrayBuffer());
  res.send(body);
}
