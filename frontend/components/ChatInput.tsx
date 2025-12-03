"use client";

import React, { useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { FiPlus, FiArrowUp, FiX, FiFileText } from "react-icons/fi";

type ChatInputProps = {
  sendUserMessage: (text: string, file: File | null) => void;
};

const ChatInput: React.FC<ChatInputProps> = ({ sendUserMessage }) => {
  const [value, setValue] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentRef = useRef<File | null>(null);

  const hasText = value.trim().length > 0;

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
  };

  const handleSubmit = () => {
    if (!value.trim() && !attachmentRef.current) return;
    sendUserMessage(value, attachmentRef.current);

    // Reset input & file
    setValue("");
    attachmentRef.current = null;
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleAddAttachment = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    attachmentRef.current = file;
    setFileName(file.name);
  };

  const handleRemoveFile = () => {
    attachmentRef.current = null;
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="bg-neutral-800 rounded-2xl border border-neutral-700 flex flex-col justify-between px-4 py-3 min-h-18">
        {fileName && (
          <div className="relative inline-flex items-center gap-2 text-sm text-neutral-200 mb-2 bg-neutral-700 px-2 py-2 rounded-full shadow max-w-48">
            <FiFileText size={16} className="text-neutral-300" />
            <span className="truncate flex-1 pr-6">{fileName}</span>
            <button
              onClick={handleRemoveFile}
              className="absolute right-2 text-neutral-400 hover:text-red-400 cursor-pointer"
              title="Remove attachment"
              aria-label="Remove attachment"
            >
              <FiX size={18} />
            </button>
          </div>
        )}

        <TextareaAutosize
          minRows={1}
          maxRows={6}
          placeholder="Type your message here..."
          className="w-full resize-none bg-transparent text-white placeholder-neutral-400 outline-none text-base leading-relaxed py-1"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <div>
            <button
              className="flex items-center justify-center h-8 w-8 rounded-full text-neutral-400 hover:text-neutral-300 hover:bg-neutral-700 transition-colors duration-200 cursor-pointer"
              title="Add attachment"
              type="button"
              onClick={handleAddAttachment}
              aria-label="Add attachment"
            >
              <FiPlus size={18} />
            </button>
            <input
              title="Upload file"
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>

          <div>
            <button
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 cursor-pointer ${
                hasText || attachmentRef.current
                  ? "bg-white text-black hover:bg-gray-200"
                  : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
              }`}
              title="Send message"
              onClick={handleSubmit}
              type="button"
              aria-label="Send message"
            >
              <FiArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;