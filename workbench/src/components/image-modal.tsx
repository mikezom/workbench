"use client";

import { useEffect } from "react";

interface HomePost {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

interface ImageModalProps {
  isOpen: boolean;
  post: HomePost | null;
  onClose: () => void;
}

export default function ImageModal({ isOpen, post, onClose }: ImageModalProps) {
  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !post) return null;

  // Background click handler
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-white dark:bg-neutral-800 rounded-lg shadow-2xl overflow-hidden w-[80vw] h-[80vh] max-md:w-[95vw] max-md:h-[90vh]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 text-3xl leading-none"
          aria-label="Close modal"
        >
          ×
        </button>

        {/* Content area - conditional layout */}
        {post.image_url ? (
          // Side-by-side layout for posts with images
          <div className="flex flex-col md:flex-row h-full">
            {/* Image area - 70% on desktop */}
            <div className="w-full md:w-[70%] overflow-y-auto p-6 flex items-start justify-center">
              <img
                src={post.image_url}
                alt=""
                className="max-w-full h-auto object-contain"
              />
            </div>

            {/* Text area - 30% on desktop */}
            <div className="w-full md:w-[30%] overflow-y-auto p-6 border-t md:border-t-0 md:border-l border-neutral-200 dark:border-neutral-700">
              <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                {post.content}
              </p>
            </div>
          </div>
        ) : (
          // Centered text-only layout for posts without images
          <div className="flex items-center justify-center h-full p-6">
            <div className="max-w-[600px] overflow-y-auto">
              <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                {post.content}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
