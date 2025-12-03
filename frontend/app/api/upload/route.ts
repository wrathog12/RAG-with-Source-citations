import { NextRequest } from "next/server";

const UPLOAD_URL = process.env.NEXT_PUBLIC_UPLOAD_URL;

export async function POST(req: NextRequest) {
  if (!UPLOAD_URL) {
    return new Response("Upload URL not configured", { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return new Response("No file received", { status: 400 });
  }

  const forwardForm = new FormData();
  forwardForm.append("file", file);

  const backendRes = await fetch(UPLOAD_URL, {
    method: "POST",
    body: forwardForm,
  });

  if (!backendRes.ok) {
    const text = await backendRes.text();
    return new Response(`Upload failed: ${text}`, { status: backendRes.status });
  }

  const result = await backendRes.json();

  return Response.json(result, { status: 200 });
}
