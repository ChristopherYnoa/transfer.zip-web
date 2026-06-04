import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import Transfer from "@/lib/server/mongoose/models/Transfer";
import { splitSentAndReceived } from "@/lib/server/serverUtils";

const oid = () => new mongoose.Types.ObjectId();

describe("splitSentAndReceived", () => {
  it("files an upload into the user's OWN request as received", () => {
    const myRequest = oid();
    const t = new Transfer({ transferRequest: myRequest, author: oid() });
    const { sent, received } = splitSentAndReceived([t], [myRequest]);
    expect(received).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it("files an authenticated upload into SOMEONE ELSE'S request as sent", () => {
    // The bug this fixes: author = me, transferRequest = a request I don't own.
    // The transfer carries a request ref, but I sent it — it must be Sent.
    const me = oid();
    const t = new Transfer({ transferRequest: oid(), author: me });
    const { sent, received } = splitSentAndReceived([t], []); // I own no requests
    expect(sent).toHaveLength(1);
    expect(received).toHaveLength(0);
  });

  it("files a plain transfer with no request as sent", () => {
    const t = new Transfer({ author: oid() });
    const { sent, received } = splitSentAndReceived([t], [oid()]);
    expect(sent).toHaveLength(1);
    expect(received).toHaveLength(0);
  });

  it("never puts the same transfer in both buckets", () => {
    const myRequest = oid();
    const transfers = [
      new Transfer({ transferRequest: myRequest, author: oid() }), // received (into my request)
      new Transfer({ author: oid() }),                             // sent (plain)
      new Transfer({ transferRequest: oid(), author: oid() }),     // sent (foreign request)
    ];
    const { sent, received } = splitSentAndReceived(transfers, [myRequest]);
    expect(received).toHaveLength(1);
    expect(sent).toHaveLength(2);
    expect(sent.length + received.length).toBe(transfers.length);
  });

  it("compares owned ids by value, not ObjectId instance identity", () => {
    // distinct("_id") and the transfer's ref are different ObjectId instances
    // with the same hex; matching by reference (e.g. Array.includes) would miss.
    const hex = oid().toString();
    const t = new Transfer({ transferRequest: new mongoose.Types.ObjectId(hex) });
    const { received } = splitSentAndReceived([t], [new mongoose.Types.ObjectId(hex)]);
    expect(received).toHaveLength(1);
  });
});
