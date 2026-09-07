"""Supabase client for the trading engine. Always uses the service-role key
(this process runs on a trusted VPS, never in a browser) - see
engine/config.py and .env.example."""
from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from engine.config import settings


@lru_cache(maxsize=1)
def get_client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the trading engine.")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
