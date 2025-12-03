"use client";

import ChatInput from "@/components/ChatInput";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [isPreparing, setIsPreparing] = useState(false);

  // Serialize a File (PDF) to base64 so we can reconstruct it on the chat page
  const serializeFile = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const CHUNK_SIZE = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode(
        ...bytes.subarray(i, i + CHUNK_SIZE)
      );
    }
    const base64 = btoa(binary);
    return {
      name: file.name,
      type: file.type,
      base64,
    };
  };

  const handleSend = async (text: string, file: File | null) => {
    if (!text.trim() && !file) return;
    setIsPreparing(true);

    const sessionId = crypto.randomUUID();

    let serializedFile: {
      name: string;
      type: string;
      base64: string;
    } | undefined = undefined;

    try {
      if (file) {
        if (file.type !== "application/pdf") {
          console.warn("Only PDF files are expected.");
        }
        serializedFile = await serializeFile(file);
      }
    } catch (err) {
      console.error("Failed to serialize file:", err);
      // We proceed without the file if serialization fails
    }

    // Store first message payload (no documentId needed now)
    window.sessionStorage.setItem(
      `first-message-${sessionId}`,
      JSON.stringify({
        text,
        file: serializedFile ?? null,
      })
    );

    router.push(`/chat/${sessionId}/`);
  };

  return (
    <div className="h-screen w-screen bg-dots text-white">
      <main className="ml-16 h-full">
        <div className="h-full flex flex-col items-center justify-center px-4">
          <h1 className="text-4xl font-bold text-blue-400 mb-10">
            How can I help you today?
          </h1>

            {/* Optional status indicator when doing base64 work */}
            {isPreparing && (
              <p className="text-sm text-neutral-400 mb-4">
                Preparing your session...
              </p>
            )}

          <ChatInput sendUserMessage={handleSend} />
        </div>
      </main>
    </div>
  );
}