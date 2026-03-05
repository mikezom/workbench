// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArxivPaper {
  id: string;
  published: string;
  title: string;
  summary: string;
  authors: string[];
  link: string;
}

// ---------------------------------------------------------------------------
// XML Parser
// ---------------------------------------------------------------------------

/**
 * Parse arXiv XML response using regex.
 * Extracts id, published, title, summary, authors, and link for each paper.
 */
export function parseArxivXml(xml: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // Split XML into individual entries
  const entryRegex = /<entry[^>]*>[\s\S]*?<\/entry>/g;
  const entries = xml.match(entryRegex) || [];

  for (const entry of entries) {
    const idMatch = entry.match(/<id>([^<]+)<\/id>/);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
    const titleMatch = entry.match(/<title>([^<]*)<\/title>/);
    const summaryMatch = entry.match(/<summary>([^<]*)<\/summary>/);
    const linkMatch = entry.match(/<link[^>]*href="([^"]+)"[^>]*\/>/);

    // Extract authors
    const authorRegex = /<name>([^<]+)<\/name>/g;
    const authors: string[] = [];
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(authorMatch[1]);
    }

    if (idMatch && titleMatch) {
      papers.push({
        id: idMatch[1].split("/").pop() || idMatch[1],
        published: publishedMatch?.[1] || "",
        title: titleMatch[1].trim(),
        summary: summaryMatch?.[1].trim() || "",
        authors,
        link: linkMatch?.[1] || "",
      });
    }
  }

  return papers;
}
