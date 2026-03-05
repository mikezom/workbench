import { describe, it, expect } from "vitest";
import { parseArxivXml } from "./arxiv-parser";

describe("crawl-arxiv-parser", () => {
  describe("parseArxivXml", () => {
    it("should parse a single entry correctly (id, title, authors, summary)", () => {
      const xml = `
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2403.12345</id>
            <published>2024-03-15T00:00:00Z</published>
            <title>Test Paper Title</title>
            <summary>This is a test summary of the paper.</summary>
            <author><name>John Doe</name></author>
            <author><name>Jane Smith</name></author>
            <link href="https://arxiv.org/pdf/2403.12345.pdf" type="application/pdf"/>
          </entry>
        </feed>
      `;

      const result = parseArxivXml(xml);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2403.12345");
      expect(result[0].title).toBe("Test Paper Title");
      expect(result[0].summary).toBe("This is a test summary of the paper.");
      expect(result[0].authors).toEqual(["John Doe", "Jane Smith"]);
      expect(result[0].published).toBe("2024-03-15T00:00:00Z");
      expect(result[0].link).toBe("https://arxiv.org/pdf/2403.12345.pdf");
    });

    it("should handle multiple entries", () => {
      const xml = `
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2403.11111</id>
            <title>First Paper</title>
            <summary>First summary</summary>
            <author><name>Author One</name></author>
          </entry>
          <entry>
            <id>http://arxiv.org/abs/2403.22222</id>
            <title>Second Paper</title>
            <summary>Second summary</summary>
            <author><name>Author Two</name></author>
          </entry>
          <entry>
            <id>http://arxiv.org/abs/2403.33333</id>
            <title>Third Paper</title>
            <summary>Third summary</summary>
            <author><name>Author Three</name></author>
          </entry>
        </feed>
      `;

      const result = parseArxivXml(xml);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("2403.11111");
      expect(result[1].id).toBe("2403.22222");
      expect(result[2].id).toBe("2403.33333");
      expect(result[0].title).toBe("First Paper");
      expect(result[1].title).toBe("Second Paper");
      expect(result[2].title).toBe("Third Paper");
    });

    it("should handle missing fields gracefully", () => {
      const xml = `
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2403.12345</id>
            <title>Paper with Missing Fields</title>
          </entry>
        </feed>
      `;

      const result = parseArxivXml(xml);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2403.12345");
      expect(result[0].title).toBe("Paper with Missing Fields");
      expect(result[0].summary).toBe("");
      expect(result[0].authors).toEqual([]);
      expect(result[0].published).toBe("");
      expect(result[0].link).toBe("");
    });

    it("should normalize whitespace in title and summary", () => {
      const xml = `
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2403.12345</id>
            <title>
              Title   with    extra     whitespace
            </title>
            <summary>
              Summary with
              line breaks    and    extra spaces
            </summary>
            <author><name>Test Author</name></author>
          </entry>
        </feed>
      `;

      const result = parseArxivXml(xml);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Title   with    extra     whitespace");
      expect(result[0].summary).toBe("Summary with\n              line breaks    and    extra spaces");
    });

    it("should return empty array for no entries", () => {
      const xml = `
        <feed xmlns="http://www.w3.org/2005/Atom">
          <!-- No entries here -->
        </feed>
      `;

      const result = parseArxivXml(xml);

      expect(result).toEqual([]);
    });

    it("should return empty array for empty string", () => {
      const result = parseArxivXml("");
      expect(result).toEqual([]);
    });

    it("should handle entry with only id and title (minimum required)", () => {
      const xml = `
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2403.99999</id>
            <title>Minimal Entry</title>
          </entry>
        </feed>
      `;

      const result = parseArxivXml(xml);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2403.99999");
      expect(result[0].title).toBe("Minimal Entry");
    });

    it("should skip entry if id is missing", () => {
      const xml = `
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Paper Without ID</title>
            <summary>This paper has no ID</summary>
          </entry>
        </feed>
      `;

      const result = parseArxivXml(xml);

      expect(result).toHaveLength(0);
    });

    it("should skip entry if title is missing", () => {
      const xml = `
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2403.99999</id>
            <summary>This paper has no title</summary>
          </entry>
        </feed>
      `;

      const result = parseArxivXml(xml);

      expect(result).toHaveLength(0);
    });
  });
});
