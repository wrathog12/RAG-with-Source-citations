export type ChatMessage = {
  id: string;
  text: string;
  isUser: boolean;
  timeStamp: number;
  filename?: string;
  pageNumber?: number | string;
  paragraphNumber?: number | string;

  // NEW
  sources?: Array<{
    source_file: string;
    page: number;
    paragraph: number;
    text_excerpt?: string;
  }>;
};


export type ChatSummary = {
  id: string;
  userId: string;
  title: string;
  lastUpdated: number;
  createdAt: number;
};