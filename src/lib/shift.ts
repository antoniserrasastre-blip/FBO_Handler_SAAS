// Shift helpers — CSV ↔ ShiftPost[] (de)serialization and Prisma row → DTO mapping.
import type { ShiftPost } from "@/types";
import { SHIFT_POSTS } from "@/types";

export function parsePosts(csv: string): ShiftPost[] {
  if (!csv) return [];
  const valid = new Set<string>(SHIFT_POSTS);
  return csv
    .split(",")
    .map((p) => p.trim())
    .filter((p) => valid.has(p)) as ShiftPost[];
}

export function serializePosts(posts: ShiftPost[]): string {
  const set = new Set(posts);
  return SHIFT_POSTS.filter((p) => set.has(p)).join(",");
}

export interface ShiftDTO {
  id: string;
  userId: string;
  userName: string;
  posts: ShiftPost[];
  startedAt: string;
}

export function toShiftDTO(
  shift: { id: string; userId: string; posts: string; startedAt: Date; user?: { name: string } | null },
  fallbackName?: string,
): ShiftDTO {
  return {
    id: shift.id,
    userId: shift.userId,
    userName: shift.user?.name ?? fallbackName ?? "",
    posts: parsePosts(shift.posts),
    startedAt: shift.startedAt.toISOString(),
  };
}
