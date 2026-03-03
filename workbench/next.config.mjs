/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      fallback: [
        // Forester tree pages: /forest/{tree-id}/ → serve index.xml
        // Next.js doesn't auto-serve index.xml as directory index,
        // so we rewrite directory paths to the XML file explicitly.
        { source: '/forest/:tree/', destination: '/forest/:tree/index.xml' },
        { source: '/forest/:tree', destination: '/forest/:tree/index.xml' },
      ],
    };
  },
};

export default nextConfig;
