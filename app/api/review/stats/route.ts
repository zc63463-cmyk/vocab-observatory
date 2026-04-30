import { NextResponse } from "next/server";
import { requireOwnerApiSession, jsonError } from "@/lib/request-auth";

interface DayStat {
  date: string;
  total: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

interface ReviewStatsResponse {
  streakDays: number;
  last7Days: DayStat[];
  totalReviewed: number;
  againRate: number;
}

export async function GET() {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const supabase = ownerSession.supabase!;
  const userId = ownerSession.user!.id;

  // Fetch last 30 days of review logs to compute 7-day trend + streak
  const { data: logs, error } = await supabase
    .from("review_logs")
    .select("rating, reviewed_at")
    .eq("user_id", userId)
    .gte("reviewed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order("reviewed_at", { ascending: false });

  if (error) {
    return jsonError("Failed to fetch review stats", 500);
  }

  const rows = logs ?? [];

  // Group by date (YYYY-MM-DD)
  const dayMap = new Map<string, DayStat>();
  for (const row of rows) {
    const date = row.reviewed_at.slice(0, 10);
    const stat = dayMap.get(date) ?? {
      date,
      total: 0,
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    };
    stat.total++;
    if (row.rating === "again") stat.again++;
    if (row.rating === "hard") stat.hard++;
    if (row.rating === "good") stat.good++;
    if (row.rating === "easy") stat.easy++;
    dayMap.set(date, stat);
  }

  // Build last 7 days array (ascending for chart)
  const last7Days: DayStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    last7Days.push(dayMap.get(date) ?? { date, total: 0, again: 0, hard: 0, good: 0, easy: 0 });
  }

  // Streak: consecutive days with >=1 review, ending today or yesterday
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const startOffset = dayMap.has(todayStr) ? 0 : 1;

  let streakDays = 0;
  for (let offset = startOffset; ; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const dStr = d.toISOString().slice(0, 10);
    if (dayMap.has(dStr)) {
      streakDays++;
    } else {
      break;
    }
  }

  // Total reviewed in last 7 days + again rate
  const total7 = last7Days.reduce((s, d) => s + d.total, 0);
  const again7 = last7Days.reduce((s, d) => s + d.again, 0);

  const payload: ReviewStatsResponse = {
    streakDays,
    last7Days,
    totalReviewed: total7,
    againRate: total7 > 0 ? again7 / total7 : 0,
  };

  return NextResponse.json(payload);
}
