import { knowledgeBase, knowledgeDocs, destinations, responders, type Responder } from "../db";

const MAX_CONTEXT_CHARS = 14_000; // keep the prompt affordable; Phase 2 swaps this for vector search

export interface KnowledgeContext {
  guardrails: string;
  text: string;
  hasContent: boolean;
}

/** Everything ONE auto-reply grounds its answers in: its own documents and its own rules. */
export async function getResponderContext(responder: Pick<Responder, "_id" | "instructions">): Promise<KnowledgeContext> {
  const docs = await knowledgeDocs().find({ responderId: responder._id }).sort({ createdAt: 1 }).toArray();
  let text = "";
  for (const d of docs) {
    const block = `### ${d.title}\n${d.text}\n\n`;
    if (text.length + block.length > MAX_CONTEXT_CHARS) {
      text += block.slice(0, Math.max(0, MAX_CONTEXT_CHARS - text.length));
      break;
    }
    text += block;
  }
  return { guardrails: (responder.instructions || "").trim(), text: text.trim(), hasContent: text.trim().length > 0 };
}

/**
 * Accounts from before auto-replies had their own settings kept one shared knowledge base,
 * one set of guardrails and per-group switches. Fold that into a single auto-reply so nothing
 * the user set up stops working. Idempotent (fixed id + upsert), safe to call on every read.
 */
export async function ensureLegacyResponder(userId: string): Promise<void> {
  if (await responders().countDocuments({ userId }, { limit: 1 })) return;
  const kb = await knowledgeBase().findOne({ _id: userId });
  const looseDocs = await knowledgeDocs().countDocuments({ userId, responderId: null });
  const enabled = await destinations().find({ userId, autoReplyEnabled: true }).project({ _id: 1 }).toArray();
  if (!kb?.guardrails?.trim() && looseDocs === 0 && enabled.length === 0) return;

  const id = `legacy-${userId}`;
  const now = new Date();
  await responders().updateOne(
    { _id: id },
    {
      $setOnInsert: {
        _id: id,
        userId,
        name: "Customer replies",
        active: enabled.length > 0,
        instructions: (kb?.guardrails || "").slice(0, 5000),
        destinationIds: enabled.map((d) => d._id),
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  await knowledgeDocs().updateMany({ userId, responderId: null }, { $set: { responderId: id } });
  await syncResponderDestinations(userId);
}

/**
 * Make each group's auto-reply switch match the auto-replies that claim it. The ingest
 * hook and the safety-net poller read these flags, so this is the one place they change.
 */
export async function syncResponderDestinations(userId: string): Promise<void> {
  const rows = await responders().find({ userId }).toArray();
  const owner = new Map<string, Responder>();
  for (const r of rows) for (const d of r.destinationIds) if (!owner.has(d)) owner.set(d, r);

  const current = await destinations()
    .find({ userId, $or: [{ autoReplyEnabled: true }, { responderId: { $ne: null } }, { _id: { $in: [...owner.keys()] } }] })
    .toArray();
  const now = new Date();
  for (const d of current) {
    const r = owner.get(d._id);
    const enabled = Boolean(r?.active);
    const set: Record<string, unknown> = { responderId: r?._id ?? null, autoReplyEnabled: enabled, updatedAt: now };
    if (enabled && !d.autoReplyEnabled) {
      set.autoReplyLastSeenAt = now; // only answer messages from now on, never old history
      set.selected = true; // its messages must be read to be answered
    }
    if (!enabled) set.autoReplyLastSeenAt = null;
    if (d.responderId === set.responderId && Boolean(d.autoReplyEnabled) === enabled) continue;
    await destinations().updateOne({ _id: d._id }, { $set: set });
  }
}

/** The auto-reply that answers in this group, if any. */
export async function responderForDestination(userId: string, connectionId: string, externalId: string): Promise<Responder | null> {
  const dest = await destinations().findOne({ connectionId, externalId, userId });
  if (!dest) return null;
  if (dest.responderId) return responders().findOne({ _id: dest.responderId, userId });
  await ensureLegacyResponder(userId);
  return responders().findOne({ userId, destinationIds: dest._id });
}
