"use client";

import { useState, useEffect } from "react";
import PageContainer from "@/components/page-container";
import ImageModal from "@/components/image-modal";

interface HomePost {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

export default function Home() {
  const [posts, setPosts] = useState<HomePost[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<HomePost | null>(null);
  const [formData, setFormData] = useState({ content: "", image_url: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedPost, setExpandedPost] = useState<HomePost | null>(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    const res = await fetch("/api/home");
    const data = await res.json();
    setPosts(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.content.trim()) return;

    let imageUrl = formData.image_url;

    if (selectedFile) {
      setUploading(true);
      const uploadFormData = new FormData();
      uploadFormData.append("image", selectedFile);

      try {
        const uploadRes = await fetch("/api/home/upload", {
          method: "POST",
          body: uploadFormData,
        });
        const uploadData = await uploadRes.json();
        imageUrl = uploadData.url;
      } catch {
        alert("Failed to upload image");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    if (editingPost) {
      await fetch(`/api/home/${editingPost.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: formData.content,
          image_url: imageUrl || null,
        }),
      });
    } else {
      await fetch("/api/home", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: formData.content,
          image_url: imageUrl || null,
        }),
      });
    }

    setFormData({ content: "", image_url: "" });
    setSelectedFile(null);
    setEditingPost(null);
    setIsModalOpen(false);
    fetchPosts();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this post?")) return;

    await fetch(`/api/home/${id}`, { method: "DELETE" });
    fetchPosts();
  }

  function openEditModal(post: HomePost) {
    setEditingPost(post);
    setFormData({ content: post.content, image_url: post.image_url || "" });
    setIsModalOpen(true);
  }

  function openCreateModal() {
    setEditingPost(null);
    setFormData({ content: "", image_url: "" });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingPost(null);
    setFormData({ content: "", image_url: "" });
    setSelectedFile(null);
  }

  return (
    <PageContainer title="Home">
      <button
        onClick={openCreateModal}
        className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        New Post
      </button>

      <div className="masonry-grid">
        {posts.map((post) => (
          <div
            key={post.id}
            className="masonry-item bg-white dark:bg-neutral-800 rounded-lg shadow p-4 break-inside-avoid relative group"
          >
            {/* Expand button - visible on hover */}
            <button
              onClick={() => setExpandedPost(post)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-2 z-10"
              aria-label="Expand post"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
            {post.image_url && (
              <img
                src={post.image_url}
                alt=""
                className="w-full rounded mb-3 object-cover"
              />
            )}
            <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap mb-3">
              {post.content}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => openEditModal(post)}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(post.id)}
                className="text-sm text-red-600 hover:text-red-800 dark:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">
              {editingPost ? "Edit Post" : "New Post"}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Content
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded dark:bg-neutral-700 dark:border-neutral-600"
                  rows={4}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Image (optional)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                      setFormData({ ...formData, image_url: "" });
                    }
                  }}
                  className="w-full px-3 py-2 border rounded dark:bg-neutral-700 dark:border-neutral-600"
                />
                {selectedFile && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                    Selected: {selectedFile.name}
                  </p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-neutral-600 hover:text-neutral-800 dark:text-neutral-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? "Uploading..." : editingPost ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ImageModal
        isOpen={expandedPost !== null}
        post={expandedPost}
        onClose={() => setExpandedPost(null)}
      />

      <style jsx>{`
        .masonry-grid {
          column-count: 1;
          column-gap: 1rem;
        }

        @media (min-width: 640px) {
          .masonry-grid {
            column-count: 2;
          }
        }

        @media (min-width: 1024px) {
          .masonry-grid {
            column-count: 3;
          }
        }

        .masonry-item {
          margin-bottom: 1rem;
          display: inline-block;
          width: 100%;
        }
      `}</style>
    </PageContainer>
  );
}
