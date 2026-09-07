import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    await getCurrentUser();
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    const symbol = searchParams.get('symbol');
    const direction = searchParams.get('direction');
    const result = searchParams.get('result');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(Number(searchParams.get('limit') ?? 100), 1000);

    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('closed_trades')
      .select('*')
      .order('close_time', { ascending: false })
      .limit(limit);

    if (accountId) query = query.eq('account_id', accountId);
    if (symbol) query = query.eq('symbol', symbol.toUpperCase());
    if (direction) query = query.eq('direction', direction);
    if (result) query = query.eq('result', result);
    if (from) query = query.gte('close_time', from);
    if (to) query = query.lte('close_time', to);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ trades: data });
  } catch (err) {
    return handleApiError(err);
  }
}
