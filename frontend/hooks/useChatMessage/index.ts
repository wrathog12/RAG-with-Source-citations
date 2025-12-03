import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/types/chat";
import { useChatService } from "@/services/useChatService";

type BackendInlineCitation = {
  source_file: string;
  page: number;
  paragraph: number;
  text_excerpt?: string;
};

function safeJsonParse<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseDollarWrappedJson(str: string): any | null {
  // Matches strings like: "$$\n{ ...json... }\n$$"
  const m = str.match(/^\s*\$\$(.*?)\$\$\s*$/s);
  if (!m) return null;
  const inner = m[1].trim();
  return safeJsonParse(inner);
}

function extractInlineCitations(answerText: string) {
  // Collect citations in order and remove them from text
  const citationRegex =
    /\[Source:\s*([^,\]]+),\s*Page:\s*(\d+),\s*Para:\s*(\d+)\]/gi;

  const citations: BackendInlineCitation[] = [];
  let cleaned = answerText.replace(citationRegex, (_match, file, page, para) => {
    citations.push({
      source_file: String(file).trim(),
      page: Number(page),
      paragraph: Number(para),
    });
    return ""; // remove the bracket from text
  });

  // Remove "Legal Chunk <num>" tokens
  cleaned = cleaned.replace(/\b[Ll]egal\s+[Cc]hunk\s+\d+\b/g, "");

  // Clean up extra punctuation/spaces caused by removals
  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .trim();

  return { cleanedText: cleaned, citations };
}

function splitIntoSentences(text: string): string[] {
  // Simple sentence splitter: keeps punctuation, avoids empty items
  const matches = text.match(/[^.!?]+[.!?]?/g);
  if (!matches) return [text.trim()];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function attachCitationsToSentences(
  sentences: string[],
  citations: BackendInlineCitation[]
) {
  const lines: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const c = citations[i];
    if (c) {
      lines.push(
        `${s}, Source: ${c.source_file}, Page: ${c.page}, Para: ${c.paragraph}`
      );
    } else {
      lines.push(s);
    }
  }
  return lines;
}

/**
 * Normalizes various backend shapes into a UI-friendly payload:
 * - Accepts top-level JSON with answer: "$$ {...} $$", or plain JSON, or plain text.
 * - Extracts inline bracket [Source: ...] citations and assigns to sentences in order.
 * - Returns displayText with inline sources and a structured sources list.
 */
function parseBackendResponse(
  rawResponse: string
): {
  displayText: string;
  sources?: BackendInlineCitation[];
  filename?: string;
  pageNumber?: number | string;
  paragraphNumber?: number | string;
} {
  // Try parsing top-level JSON
  const top = safeJsonParse<any>(rawResponse);

  // Case 1: Plain text fallback
  if (!top) {
    // Try to extract inline citations anyway (if present)
    const { cleanedText, citations } = extractInlineCitations(rawResponse);
    const lines = attachCitationsToSentences(
      splitIntoSentences(cleanedText),
      citations
    );
    return { displayText: lines.join("\n"), sources: citations };
  }

  // Case 2: If there's a content field (legacy shape)
  if (typeof top.content === "string") {
    const { cleanedText, citations } = extractInlineCitations(top.content);
    const lines = attachCitationsToSentences(
      splitIntoSentences(cleanedText),
      citations
    );
    return {
      displayText: lines.join("\n"),
      sources: citations.length ? citations : top.sources,
      filename: top.filename,
      pageNumber: top["page number"] ?? top.pageNumber,
      paragraphNumber:
        top["para  number"] ?? top["para number"] ?? top.paragraphNumber,
    };
  }

  // Case 3: Your backend shape: { answer: "$$ {...} $$", retrieved_sources_count: number }
  if (typeof top.answer === "string") {
    const inner = parseDollarWrappedJson(top.answer);
    if (inner && typeof inner.answer === "string") {
      const backendSources: BackendInlineCitation[] | undefined = inner.sources;

      // Extract inline citations from inner.answer
      const { cleanedText, citations } = extractInlineCitations(inner.answer);
      const lines = attachCitationsToSentences(
        splitIntoSentences(cleanedText),
        citations
      );

      // Prefer inline citations if present, else fall back to backend sources array
      const finalSources =
        citations.length > 0
          ? citations
          : Array.isArray(backendSources)
          ? backendSources
          : undefined;

      return {
        displayText: lines.join("\n"),
        sources: finalSources,
      };
    }

    // If inner failed to parse, treat the string as text
    const { cleanedText, citations } = extractInlineCitations(top.answer);
    const lines = attachCitationsToSentences(
      splitIntoSentences(cleanedText),
      citations
    );
    return { displayText: lines.join("\n"), sources: citations };
  }

  // Case 4: If answer is already object-like
  if (top.answer && typeof top.answer === "object" && typeof top.answer.answer === "string") {
    const backendSources: BackendInlineCitation[] | undefined = top.answer.sources;
    const { cleanedText, citations } = extractInlineCitations(top.answer.answer);
    const lines = attachCitationsToSentences(
      splitIntoSentences(cleanedText),
      citations
    );
    return {
      displayText: lines.join("\n"),
      sources: citations.length ? citations : backendSources,
    };
  }

  // Final fallback: stringify whatever it is
  const text = typeof top === "string" ? top : JSON.stringify(top);
  const { cleanedText, citations } = extractInlineCitations(text);
  const lines = attachCitationsToSentences(
    splitIntoSentences(cleanedText),
    citations
  );
  return { displayText: lines.join("\n"), sources: citations };
}

export function useChatMessage(initialMessages: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const { sendMessage } = useChatService();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = (msg: ChatMessage) =>
    setMessages((prev) => [...prev, msg]);

  const sendUserMessage = async (text: string, file: File | null) => {
    // 1. Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      isUser: true,
      timeStamp: Date.now(),
      ...(file ? { filename: file.name } : {}),
    };
    addMessage(userMsg);

    // 2. Add placeholder bot message
    const botMsgId = crypto.randomUUID();
    addMessage({
      id: botMsgId,
      text: "Thinking...",
      isUser: false,
      timeStamp: Date.now(),
    });

    try {
      const rawResponse = await sendMessage(text, file ?? undefined);

      // Try to parse using the specialized backend parser
      const parsed = parseBackendResponse(rawResponse);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? {
                ...m,
                text: parsed.displayText,
                ...(parsed.sources ? { sources: parsed.sources } : {}),
                ...(parsed.filename ? { filename: parsed.filename } : {}),
                ...(parsed.pageNumber ? { pageNumber: parsed.pageNumber } : {}),
                ...(parsed.paragraphNumber
                  ? { paragraphNumber: parsed.paragraphNumber }
                  : {}),
              }
            : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? {
                ...m,
                text: `Error: An error occurred while sending the message.`,
              }
            : m
        )
      );
    }
  };

  const regenerateMessage = (msg: ChatMessage) => {
    if (!msg.isUser) {
      const idx = messages.findIndex((m) => m.id === msg.id);
      if (idx > -1) {
        for (let i = idx - 1; i >= 0; i--) {
          const candidate = messages[i];
          if (candidate.isUser) {
            sendUserMessage(candidate.text, null); // file cannot be reused
            break;
          }
        }
      }
    }
  };

  return { messages, sendUserMessage, containerRef, regenerateMessage };
}