import { z } from "zod";
import { fetchJson } from "./http.ts";

// Pinterest's public widget API: no login, up to 50 most recent pins per board.
const pinSchema = z.object({
  id: z.string(),
  description: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  dominant_color: z.string().nullable().optional(),
  is_video: z.boolean().optional(),
  images: z.record(z.string(), z.object({ url: z.string(), width: z.number(), height: z.number() })),
  board: z.object({ url: z.string(), name: z.string() }).optional(),
});

const responseSchema = z.object({
  status: z.string(),
  data: z.object({ pins: z.array(pinSchema) }),
});

export type Pin = {
  id: string;
  boardSlug: string;
  boardName: string;
  imageUrl: string;
  width: number;
  height: number;
  link: string | null;
  description: string | null;
  dominantColor: string | null;
};

export async function fetchBoardPins(username: string, boardSlug: string): Promise<Pin[]> {
  const url = `https://widgets.pinterest.com/v3/pidgets/boards/${encodeURIComponent(username)}/${encodeURIComponent(boardSlug)}/pins/`;
  const res = await fetchJson(url, responseSchema);
  if (res.status !== "success") throw new Error(`Pinterest board ${boardSlug} returned status ${res.status}`);
  return res.data.pins.flatMap((p) => {
    const img = p.images["564x"] ?? p.images["474x"] ?? Object.values(p.images)[0];
    if (!img) return [];
    return [
      {
        id: p.id,
        boardSlug,
        boardName: p.board?.name ?? boardSlug,
        imageUrl: img.url,
        width: img.width,
        height: img.height,
        link: p.link ?? null,
        description: p.description?.trim() || null,
        dominantColor: p.dominant_color ?? null,
      },
    ];
  });
}
