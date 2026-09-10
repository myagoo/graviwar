import { inputSchema } from "../bonuses";
import { z } from "zod";

const roster = z.array(z.string().uuid()).min(1).max(16);
export const DataSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), room: z.string().uuid(), members: roster }),
  z.object({ type: z.literal("ready"), room: z.string().uuid(), members: roster }),
  z.object({ type: z.literal("prepared"), room: z.string().uuid(), members: roster }),
  z.object({ type: z.literal("checksum"), frame: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).multipleOf(60), hash: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.object({ type: z.literal("reject"), reason: z.string().max(200) }),
  z.object({ type: z.literal("input"), frame: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    input: inputSchema.optional(),
    receivedFrame: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    playerID: z.union([z.string(), z.number()]) }),
  z.object({ type: z.literal("visibility-state"), value: z.enum(["hidden", "visible"]), playerID: z.union([z.string(), z.number()]) }),
]);
export type Data = z.infer<typeof DataSchema>;
export type InputData = Extract<Data, { type: "input" }>;
