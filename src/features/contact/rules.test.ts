import { describe, expect, it } from "vitest";
import { parseMobileNumber, whatsappLink, whatsappShareLink } from "./rules";

describe("parseMobileNumber", () => {
  it("takes 07… as a UK number and stores it as E.164", () => {
    expect(parseMobileNumber("07912 345678")).toEqual({ ok: true, number: "+447912345678" });
  });

  it("accepts a full international number", () => {
    expect(parseMobileNumber("+33 6 12 34 56 78")).toEqual({ ok: true, number: "+33612345678" });
    expect(parseMobileNumber("+44 (0)7912 345678")).toEqual({ ok: true, number: "+447912345678" });
  });

  it("clears the number when the input is empty", () => {
    expect(parseMobileNumber("   ")).toEqual({ ok: true, number: null });
  });

  it("explains a number that isn't valid", () => {
    expect(parseMobileNumber("12345")).toEqual({
      ok: false,
      error: "That doesn't look like a mobile number. Try 07… or start with + and the country code.",
    });
    expect(parseMobileNumber("hello")).toMatchObject({ ok: false });
  });
});

describe("whatsappLink", () => {
  it("opens a chat with the number and no message", () => {
    expect(whatsappLink("+447912345678")).toBe("https://wa.me/447912345678");
  });

  it("prefills an encoded message", () => {
    expect(whatsappLink("+447912345678", "Hi Sam, can you make it? https://x.org/e?a=1&b=2")).toBe(
      "https://wa.me/447912345678?text=Hi%20Sam%2C%20can%20you%20make%20it%3F%20https%3A%2F%2Fx.org%2Fe%3Fa%3D1%26b%3D2",
    );
  });

  it("ignores an empty message", () => {
    expect(whatsappLink("+447912345678", "")).toBe("https://wa.me/447912345678");
  });
});

describe("whatsappShareLink", () => {
  it("opens WhatsApp's chat picker with the message prefilled", () => {
    expect(whatsappShareLink("Hi & bye\nhttps://x.org/e?a=1")).toBe("https://wa.me/?text=Hi%20%26%20bye%0Ahttps%3A%2F%2Fx.org%2Fe%3Fa%3D1");
  });
});
