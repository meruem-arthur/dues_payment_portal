import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrevoEmailProvider } from "@/lib/email/brevo.provider";

const ORIGINAL_ENV = { ...process.env };

function mockFetchResponse(ok: boolean, status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  process.env.EMAIL_API_KEY = "test-api-key";
  process.env.EMAIL_FROM_ADDRESS = "dues@umat.edu.gh";
  process.env.EMAIL_FROM_NAME = "UMaT Departmental Dues";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("BrevoEmailProvider", () => {
  it("sends successfully and posts the expected payload", async () => {
    const fetchMock = mockFetchResponse(true, 201, { messageId: "msg_123" });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new BrevoEmailProvider();
    const result = await provider.send({
      to: "student@example.com",
      subject: "Ceramic Engineering dues receipt - REC-2026-000006",
      body: "Dear Kwame, your payment of GHS 100 was received.",
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options.headers["api-key"]).toBe("test-api-key");

    const payload = JSON.parse(options.body);
    expect(payload.sender).toEqual({ email: "dues@umat.edu.gh", name: "UMaT Departmental Dues" });
    expect(payload.to).toEqual([{ email: "student@example.com" }]);
    expect(payload.subject).toBe("Ceramic Engineering dues receipt - REC-2026-000006");
    expect(payload.textContent).toBe("Dear Kwame, your payment of GHS 100 was received.");
  });

  it("uses the department's fromAddress over the account-wide fallback", async () => {
    const fetchMock = mockFetchResponse(true, 201, { messageId: "msg_123" });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new BrevoEmailProvider();
    await provider.send({
      to: "student@example.com",
      subject: "Receipt",
      body: "Body",
      from: "geomatic-dues@umat.edu.gh",
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.sender.email).toBe("geomatic-dues@umat.edu.gh");
  });

  it("fails clearly when EMAIL_API_KEY is not set", async () => {
    delete process.env.EMAIL_API_KEY;
    const fetchMock = mockFetchResponse(true, 201, {});
    vi.stubGlobal("fetch", fetchMock);

    const provider = new BrevoEmailProvider();
    const result = await provider.send({ to: "student@example.com", subject: "x", body: "y" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/EMAIL_API_KEY is not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails clearly when there's no sender address at all", async () => {
    delete process.env.EMAIL_FROM_ADDRESS;
    const fetchMock = mockFetchResponse(true, 201, {});
    vi.stubGlobal("fetch", fetchMock);

    const provider = new BrevoEmailProvider();
    const result = await provider.send({ to: "student@example.com", subject: "x", body: "y" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no sender address/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a Brevo API error (e.g. daily quota exceeded) as a normal failed result", async () => {
    const fetchMock = mockFetchResponse(false, 402, {
      code: "not_enough_credits",
      message: "You have reached the maximum number of emails for today",
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new BrevoEmailProvider();
    const result = await provider.send({ to: "student@example.com", subject: "x", body: "y" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not_enough_credits/);
    expect(result.error).toMatch(/maximum number of emails/i);
  });

  it("does not throw on a network error - returns a failed result instead", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    const provider = new BrevoEmailProvider();
    const result = await provider.send({ to: "student@example.com", subject: "x", body: "y" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/network error/i);
  });
});
