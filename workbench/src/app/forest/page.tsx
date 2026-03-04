"use client";

import { useRef, useEffect, useState } from "react";

export default function ForestPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentPath, setCurrentPath] = useState("/forest/index/index.xml");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const loc = iframe.contentWindow?.location;
        if (loc?.pathname) {
          setCurrentPath(loc.pathname);
        }
      } catch {
        // cross-origin or security restriction — ignore
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-neutral-900">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
        <span className="font-medium text-neutral-700 dark:text-neutral-100">Forest</span>
        <span className="text-neutral-300 dark:text-neutral-600">/</span>
        <span className="font-mono truncate">{currentPath}</span>
      </div>
      <iframe
        ref={iframeRef}
        src="/forest/index/index.xml"
        className="flex-1 w-full border-0"
        title="Forester"
      />
    </div>
  );
}
