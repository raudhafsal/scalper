// Hand-written mirror of the Supabase schema in supabase/migrations/.
// If you change a migration, update this file to match (or regenerate with
// `npx supabase gen types typescript --project-id <id> > types/database.ts`
// once your hosted project is live, then re-apply the JSDoc comments).

export type UserRole = 'ADMIN' | 'TRADER' | 'VIEWER';
export type AccountType = 'DEMO' | 'LIVE';
export type RunMode = 'PAPER' | 'DEMO' | 'LIVE';
export type AccountConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'OFFLINE' | 'DISABLED' | 'RISK_LOCKED';
export type GlobalTradingStatus = 'STOPPED' | 'ACTIVE' | 'STOP_NEW_TRADES' | 'EMERGENCY_STOPPED';
export type SignalDirection = 'BUY' | 'SELL';
export type SignalStatus = 'WAITING' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'EXPIRED';
export type TradeCommandAction = 'BUY' | 'SELL' | 'CLOSE' | 'MODIFY_SL' | 'MODIFY_TP' | 'STOP_TRADING';
export type TradeCommandStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'EXECUTED' | 'REJECTED' | 'EXPIRED' | 'FAILED';
export type EventSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type SystemComponent = 'WEB_APP' | 'SUPABASE' | 'TRADING_ENGINE' | 'MARKET_DATA' | 'MT5_BRIDGE';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Mt5Account {
  id: string;
  user_id: string;
  nickname: string;
  login_id: string;
  broker: string;
  server: string;
  account_type: AccountType;
  connection_status: AccountConnectionStatus;
  trading_enabled: boolean;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  floating_pl: number;
  currency: string;
  leverage: number | null;
  created_at: string;
  updated_at: string;
}

export interface Mt5AccountSettings {
  id: string;
  account_id: string;
  use_global_settings: boolean;
  strategy_id: string | null;
  risk_settings_id: string | null;
  allowed_symbols: string[];
  max_trades_override: number | null;
  max_lot_override: number | null;
  sessions_enabled: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface EaConnection {
  id: string;
  account_id: string;
  bridge_token_hash: string;
  bridge_token_last_rotated_at: string;
  ea_version: string | null;
  terminal_build: number | null;
  connected: boolean;
  last_heartbeat_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  symbol_specs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Strategy {
  id: string;
  user_id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StrategySettings {
  id: string;
  strategy_id: string;
  primary_timeframe: string;
  confirmation_timeframe: string;
  optional_timeframe: string | null;
  min_signal_score: number;
  score_weights: Record<string, number>;
  structure_lookback: number;
  liquidity_lookback: number;
  ema_fast: number;
  ema_mid: number;
  ema_slow: number;
  ema_trend: number;
  rsi_period: number;
  atr_period: number;
  max_spread_points: Record<string, number>;
  volatility_filter_enabled: boolean;
  min_atr_percentile: number;
  max_atr_percentile: number;
  session_filters: Record<string, boolean>;
  sl_method: 'SWING' | 'ATR' | 'ORDER_BLOCK';
  atr_sl_multiplier: number;
  tp_mode: 'RR_1_1' | 'RR_1_1_5' | 'RR_1_2' | 'RR_1_3' | 'CUSTOM';
  custom_rr: number | null;
  breakeven_enabled: boolean;
  breakeven_at_r: number;
  partial_tp_enabled: boolean;
  partial_tp_at_r: number;
  partial_tp_pct: number;
  trailing_enabled: boolean;
  trailing_activation_r: number;
  created_at: string;
  updated_at: string;
}

export interface RiskSettings {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  risk_per_trade_pct: number;
  max_daily_loss_pct: number;
  max_drawdown_pct: number;
  max_simultaneous_trades: number;
  max_trades_per_symbol: number;
  max_trades_per_day: number;
  max_trades_per_hour: number;
  max_consecutive_losses: number;
  cooldown_after_loss_minutes: number;
  cooldown_after_trade_minutes: number;
  max_spread_points: number;
  max_lot: number;
  min_equity: number;
  daily_profit_lock_pct: number | null;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: string;
  user_id: string;
  strategy_id: string | null;
  symbol: string;
  direction: SignalDirection;
  primary_timeframe: string;
  run_mode: RunMode;
  score: number;
  score_breakdown: Record<string, number>;
  min_score_required: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward: number;
  status: SignalStatus;
  rejection_reason: string | null;
  context: Record<string, unknown>;
  created_at: string;
  expires_at: string;
}

export interface TradeCommand {
  id: string;
  signal_id: string | null;
  account_id: string;
  action: TradeCommandAction;
  symbol: string;
  volume: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  nonce: string;
  status: TradeCommandStatus;
  rejection_reason: string | null;
  run_mode: RunMode;
  created_at: string;
  expires_at: string;
  sent_at: string | null;
  acknowledged_at: string | null;
  executed_at: string | null;
}

export interface Position {
  id: string;
  account_id: string;
  broker_ticket: string;
  symbol: string;
  direction: SignalDirection;
  volume: number;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  current_price: number | null;
  floating_pl: number;
  swap: number;
  commission: number;
  signal_id: string | null;
  strategy_id: string | null;
  run_mode: RunMode;
  breakeven_applied: boolean;
  partial_tp_applied: boolean;
  status: 'OPEN' | 'CLOSING';
  open_time: string;
  updated_at: string;
}

export interface ClosedTrade {
  id: string;
  account_id: string;
  broker_ticket: string;
  symbol: string;
  direction: SignalDirection;
  volume: number;
  entry_price: number;
  exit_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  profit: number;
  commission: number;
  swap: number;
  strategy_id: string | null;
  signal_id: string | null;
  signal_score: number | null;
  run_mode: RunMode;
  open_time: string;
  close_time: string;
  duration_seconds: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  created_at: string;
}

export interface DailyStatistics {
  id: string;
  account_id: string;
  date: string;
  starting_balance: number;
  ending_balance: number;
  realized_pl: number;
  trades_count: number;
  wins: number;
  losses: number;
  max_drawdown_pct: number;
  updated_at: string;
}

export interface SystemEvent {
  id: string;
  component: SystemComponent;
  event_type: string;
  severity: EventSeverity;
  message: string;
  metadata: Record<string, unknown>;
  account_id: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface TradingState {
  user_id: string;
  status: GlobalTradingStatus;
  mode: RunMode;
  started_at: string | null;
  started_by: string | null;
  stopped_at: string | null;
  stopped_by: string | null;
  emergency_stop_reason: string | null;
  last_engine_heartbeat_at: string | null;
  updated_at: string;
}
