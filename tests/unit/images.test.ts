import { describe, it, expect } from "vitest";
import {
  isWebpBuffer,
  listingImageObjectPath,
} from "@/lib/listings/images";

describe("isWebpBuffer", () => {
  it("accepts a RIFF/WEBP header", () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(isWebpBuffer(bytes)).toBe(true);
  });

  it("rejects a JPEG header", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(isWebpBuffer(bytes)).toBe(false);
  });

  it("rejects a short buffer", () => {
    expect(isWebpBuffer(new Uint8Array([0x52, 0x49]))).toBe(false);
  });
});

describe("listingImageObjectPath", () => {
  it("scopes the object to the seller, then the listing", () => {
    expect(
      listingImageObjectPath("seller-1", "listing-1", "img-1"),
    ).toBe("seller-1/listing-1/img-1.webp");
  });
});
