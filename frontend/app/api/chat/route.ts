import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  const form = await req.formData();

  const backendRes = await fetch(`${BACKEND_URL}/analyze`, {
    method: "POST",
    body: form, // pass multipart directly
  });

  if (backendRes.headers.get("content-type")?.includes("application/json")) {
    const json = await backendRes.json();
    return Response.json(json, { status: backendRes.status });
  }

  const text = await backendRes.text();
  return new Response(text, { status: backendRes.status });
}
