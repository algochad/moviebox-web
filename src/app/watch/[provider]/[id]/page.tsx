import { WatchPlayer } from "@/components/watch-player";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const VALID: Record<string, true> = {
  moviebox: true,
  fourkhdhub: true,
  bdix_circleftp: true,
  bdix_dhakaflix: true,
  anime: true,
};

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string; id: string }>;
  searchParams: Promise<{ s?: string; e?: string }>;
}) {
  const { provider, id } = await params;
  const sp = await searchParams;
  if (!VALID[provider] || !id) notFound();
  const season = Number.parseInt(sp.s ?? "", 10);
  const episode = Number.parseInt(sp.e ?? "", 10);

  return (
    <WatchPlayer
      provider={provider as WatchPlayerProvider}
      id={id}
      season={Number.isFinite(season) ? season : 0}
      episode={Number.isFinite(episode) ? episode : 0}
    />
  );
}

export type WatchPlayerProvider =
  | "moviebox"
  | "fourkhdhub"
  | "bdix_circleftp"
  | "bdix_dhakaflix";
