import { channelMessages, connections, destinations, type ConnectionStatus, type Platform } from "../db";
import { uid } from "../lib/crypto";

export async function setConnectionStatus(
  connectionId: string,
  status: ConnectionStatus,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await connections().updateOne(
    { _id: connectionId },
    { $set: { status, updatedAt: new Date(), ...patch } },
  );
}

export async function heartbeat(connectionId: string): Promise<void> {
  await connections().updateOne({ _id: connectionId }, { $set: { heartbeatAt: new Date() } });
}

export async function upsertDestination(args: {
  userId: string;
  connectionId: string;
  platform: Platform;
  externalId: string;
  name: string;
  kind?: string;
  selectedByDefault?: boolean;
}): Promise<void> {
  const now = new Date();
  await destinations().updateOne(
    { connectionId: args.connectionId, externalId: args.externalId },
    {
      $set: { name: args.name, kind: args.kind ?? "group", updatedAt: now },
      $setOnInsert: {
        _id: uid(),
        userId: args.userId,
        connectionId: args.connectionId,
        platform: args.platform,
        externalId: args.externalId,
        selected: args.selectedByDefault ?? true,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

export async function isDestinationSelected(connectionId: string, externalId: string): Promise<boolean> {
  const row = await destinations().findOne({ connectionId, externalId });
  // Default to retaining a group unless the user explicitly turned it off.
  return row ? row.selected !== false : true;
}

export async function recordMessage(m: {
  userId: string;
  connectionId: string;
  platform: Platform;
  destinationId: string;
  destinationName: string;
  externalId: string;
  senderName: string;
  direction: "inbound" | "outbound";
  text: string;
  occurredAt: Date;
}): Promise<void> {
  try {
    await channelMessages().updateOne(
      { connectionId: m.connectionId, externalId: m.externalId },
      { $setOnInsert: { _id: uid(), ...m, createdAt: new Date() } },
      { upsert: true },
    );
  } catch {
    // duplicate — ignore
  }
}
