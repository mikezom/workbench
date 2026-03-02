/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      afterFiles: [
        // Forester root-level XSL stylesheets
        { source: '/default.xsl', destination: '/forest/default.xsl' },
        { source: '/core.xsl', destination: '/forest/core.xsl' },
        { source: '/tree.xsl', destination: '/forest/tree.xsl' },
        { source: '/links.xsl', destination: '/forest/links.xsl' },
        { source: '/metadata.xsl', destination: '/forest/metadata.xsl' },
        // Forester root-level CSS
        { source: '/style.css', destination: '/forest/style.css' },
        { source: '/katex.min.css', destination: '/forest/katex.min.css' },
        // Forester root-level JS
        { source: '/forester.js', destination: '/forest/forester.js' },
        { source: '/graph.js', destination: '/forest/graph.js' },
        { source: '/hover-card.js', destination: '/forest/hover-card.js' },
        // Forester root-level JSON data
        { source: '/graph.json', destination: '/forest/graph.json' },
        { source: '/forest.json', destination: '/forest/forest.json' },
        { source: '/weight.json', destination: '/forest/weight.json' },
        // Forester fonts (KaTeX + Inria Sans + CJK)
        { source: '/fonts/:path*', destination: '/forest/fonts/:path*' },
        // Forester root index.html (home redirect)
        { source: '/index.html', destination: '/forest/index.html' },
      ],
      fallback: [
        // Forester tree pages — catch unmatched paths as tree IDs
        { source: '/:tree/index.xml', destination: '/forest/:tree/index.xml' },
        { source: '/:tree/index.html', destination: '/forest/:tree/index.html' },
        { source: '/:tree', destination: '/forest/:tree/index.html' },
      ],
    };
  },
};

export default nextConfig;
