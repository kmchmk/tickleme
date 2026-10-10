import { notFound } from "next/navigation";
import { getAvatar, getAvatars } from "@/lib/avatars";
import AvatarPlayer from "@/components/AvatarPlayer";

export const dynamicParams = false;
export const generateStaticParams = () => getAvatars().map((a) => ({ id: a.id }));

export default async function AvatarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ debug?: string }>;
}) {
  const { id } = await params;
  const { debug } = await searchParams;
  const avatar = getAvatar(id);
  if (!avatar) notFound();
  // TODO(paywall): gate avatar.premium here (auth/payment check) before rendering.
  return (
    <main>
      <h1>{avatar.name}</h1>
      <AvatarPlayer avatar={avatar} debug={debug === "1"} />
    </main>
  );
}
