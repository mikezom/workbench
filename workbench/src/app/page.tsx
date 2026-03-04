"use client";

import { useState, useEffect } from "react";
import PageContainer from "@/components/page-container";

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

    if (editingPost) {
      await fetch(`/api/home/${editingPost.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: formData.content,
          image_url: formData.image_url || null,
        }),
      });
    } else {
      await fetch("/api/home", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: formData.content,
          image_url: formData.image_url || null,
        }),
      });
    }

    setFormData({ content: "", image_url: "" });
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
            className="masonry-item bg-white dark:bg-neutral-800 rounded-lg shadow p-4 break-inside-avoid"
          >
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
                  Image URL (optional)
                </label>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) =>
                    setFormData({ ...formData, image_url: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded dark:bg-neutral-700 dark:border-neutral-600"
                  placeholder="https://example.com/image.jpg"
                />
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
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editingPost ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
