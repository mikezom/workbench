import { describe, it, expect, beforeEach } from "vitest";
import { PUT, DELETE } from "./route";
import { POST } from "../route";
import { NextRequest } from "next/server";

let testItemId: string;

beforeEach(async () => {
  // Create a test item before each test
  const createRequest = new NextRequest("http://localhost:3000/api/clipboard", {
    method: "POST",
    body: JSON.stringify({ content: "test item" }),
  });
  const createResponse = await POST(createRequest);
  const created = await createResponse.json();
  testItemId = created.id;
});

describe("PUT /api/clipboard/[id]", () => {
  it("should update a clipboard item", async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/clipboard/${testItemId}`,
      {
        method: "PUT",
        body: JSON.stringify({ content: "updated" }),
      }
    );

    const response = await PUT(request, { params: { id: testItemId } });
    expect(response.status).toBe(200);

    const updated = await response.json();
    expect(updated.content).toBe("updated");
  });

  it("should return 404 for non-existent id", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/clipboard/non-existent",
      {
        method: "PUT",
        body: JSON.stringify({ content: "test" }),
      }
    );

    const response = await PUT(request, { params: { id: "non-existent" } });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/clipboard/[id]", () => {
  it("should delete a clipboard item", async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/clipboard/${testItemId}`,
      {
        method: "DELETE",
      }
    );

    const response = await DELETE(request, { params: { id: testItemId } });
    expect(response.status).toBe(204);
  });

  it("should return 404 for non-existent id", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/clipboard/non-existent",
      {
        method: "DELETE",
      }
    );

    const response = await DELETE(request, { params: { id: "non-existent" } });
    expect(response.status).toBe(404);
  });
});
