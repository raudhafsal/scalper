import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    await getCurrentUser();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const symbol = searchParams.get('symbol');
    const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500);

    const supabase = await createServerSupabaseClient();
    let query = supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(limit);

    if (status) query = query.eq('status', status);
    if (symbol) query = query.eq('symbol', symbol.toUpperCase());

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ signals: data });
  } catch (err) {
    return handleApiError(err);
  }
}
