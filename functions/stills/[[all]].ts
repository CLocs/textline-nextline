import { stillKeyFromPathname } from "../../src/lib/content/stillKeys";

type StillsEnv = {
  STILLS: {
    get: (key: string) => Promise<{
      body: ReadableStream;
      httpMetadata?: { contentType?: string };
    } | null>;
  };
};

/** Same-origin `/stills/{titleId}/{n}.jpg` from the private R2 bucket. */
export async function onRequestGet(context: { request: Request; env: StillsEnv }) {
  const key = stillKeyFromPathname(new URL(context.request.url).pathname);
  if (!key) return new Response("Not found", { status: 404 });

  const file = await context.env.STILLS.get(key);
  if (!file) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(file.body, {
    headers: {
      "Content-Type": file.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
