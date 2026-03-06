"use client";

import { useEffect, useRef } from "react";
import { HomePost } from "@/types/home";

interface ImageModalProps {
  isOpen: boolean;
  post: HomePost | null;
  onClose: () => void;
}

export default function ImageModal({ isOpen, post, onClose }: ImageModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // ESC key handler, focus management, and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    // Focus close button when modal opens
    closeButtonRef.current?.focus();

    // Lock body scroll
    document.body.style.overflow = 'hidden';

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEsc);

    return () => {
      window.removeEventListener("keydown", handleEsc);
      // Restore body scroll
      document.body.style.overflow = '';
    };
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
      role="dialog"
      aria-modal="true"
      aria-label="Post detail modal"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-white dark:bg-neutral-800 rounded-lg shadow-2xl overflow-hidden w-[80vw] h-[80vh] max-md:w-[95vw] max-md:h-[90vh]">
        {/* Close button */}
        <button
          ref={closeButtonRef}
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
            <div className="w-full md:w-[70%] overflow-y-auto p-6 flex items-start justify-center scroll-smooth">
              <img
                src={post.image_url}
                alt={post.content.substring(0, 100)}
                className="max-w-full h-auto object-contain"
              />
            </div>

            {/* Text area - 30% on desktop */}
            <div className="w-full md:w-[30%] overflow-y-auto p-6 scroll-smooth">
              <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                {post.content}
              </p>
            </div>
          </div>
        ) : (
          // Centered text-only layout for posts without images
          <div className="flex items-center justify-center h-full p-6">
            <div className="max-w-[600px] overflow-y-auto scroll-smooth">
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
