import { redirect } from "next/navigation";

export default function HomePage({
  searchParams,
}: {
  searchParams: { invite?: string };
}) {
  const invite = searchParams?.invite;
  redirect(invite ? `/login?invite=${invite}` : "/login");
}