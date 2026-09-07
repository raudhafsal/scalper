//+------------------------------------------------------------------+
//|                                       MT5_Scalp_Bridge.mq5        |
//|  MT5 Scalp Command Center - MT5 Bridge Expert Advisor            |
//|                                                                    |
//|  Role (spec section 10-11):                                       |
//|   - Identify this MT5 account to the backend                     |
//|   - Authenticate with a bridge token (NOT the broker password)    |
//|   - Send periodic heartbeats: balance/equity/margin/positions     |
//|   - Poll the backend for APPROVED trade commands and execute them |
//|   - Report execution results back to the backend                 |
//|   - Reconnect automatically and resync state after reconnect      |
//|                                                                    |
//|  This EA NEVER decides to open a trade on its own. It only        |
//|  executes commands that the backend's risk engine already         |
//|  approved. If it cannot reach the backend, it does nothing new -  |
//|  it does not fall back to any local logic (fail-safe, spec 45).   |
//|                                                                    |
//|  SETUP:                                                            |
//|   1. Tools > Options > Expert Advisors > Allow WebRequest for      |
//|      the following URLs: add your BackendBaseUrl (https only).    |
//|   2. Attach this EA to ONE chart per MT5 account you want to       |
//|      bridge. Set AccountId + BridgeToken from the "Add MT5         |
//|      Account" screen in the web app (bridge token is shown once).  |
//|   3. Enable AutoTrading in the toolbar.                            |
//|  See docs/EA_SETUP.md for full instructions.                       |
//+------------------------------------------------------------------+
#property copyright "MT5 Scalp Command Center"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>

//------------------------------------------------------------------ Inputs
input string   BackendBaseUrl      = "https://your-app.vercel.app"; // Web app base URL (no trailing slash)
input string   AccountId           = "";                            // mt5_accounts.id (UUID) from the web app
input string   BridgeToken         = "";                            // Bridge token shown once when the account was added
input int      HeartbeatSeconds    = 10;                            // How often to send a heartbeat
input int      PollSeconds         = 3;                             // How often to poll for commands
input int      HttpTimeoutMs       = 5000;                          // WebRequest timeout
input int      MagicNumber         = 990011;                        // Magic number for orders this EA places
input int      SlippagePoints      = 20;                            // Max slippage in points

//------------------------------------------------------------------ Globals
CTrade trade;
datetime g_lastHeartbeat = 0;
datetime g_lastPoll = 0;
string   g_lastError = "";
bool     g_connected = false;

// Simple ring buffer of recently executed command ids, so a duplicate
// command delivered twice (e.g. after a dropped response) is never executed
// twice locally, even before the backend's own (account_id, nonce)
// uniqueness constraint would catch it server-side.
#define EXECUTED_RING_SIZE 200
string g_executedCommandIds[EXECUTED_RING_SIZE];
int    g_executedRingPos = 0;

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(AccountId) == 0 || StringLen(BridgeToken) == 0)
   {
      Print("MT5_Scalp_Bridge: AccountId and BridgeToken inputs are required.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(SlippagePoints);

   ArrayInitialize(g_executedCommandIds, "");

   EventSetTimer(1); // 1s tick; heartbeat/poll cadence is controlled by the input params above

   ReportAccountStatus(true, "");
   SendHeartbeat(); // resync immediately on attach/reconnect

   Print("MT5_Scalp_Bridge initialized for account ", AccountId);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   ReportAccountStatus(false, "EA deinitialized (reason=" + IntegerToString(reason) + ")");
}

//+------------------------------------------------------------------+
//| Timer - drives heartbeat + command polling on their own cadences  |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeCurrent();

   if(now - g_lastHeartbeat >= HeartbeatSeconds)
   {
      SendHeartbeat();
      g_lastHeartbeat = now;
   }

   if(now - g_lastPoll >= PollSeconds)
   {
      PollAndExecuteCommands();
      g_lastPoll = now;
   }
}

void OnTick()
{
   // Intentionally empty: this EA is command-driven, not tick-driven. All
   // trading decisions come from the backend, not from local tick logic.
}

//+------------------------------------------------------------------+
//| HTTP helper                                                       |
//+------------------------------------------------------------------+
bool HttpPost(string path, string jsonBody, string &responseBody)
{
   string url = BackendBaseUrl + path;
   string headers = "Content-Type: application/json\r\n";
   char postData[];
   char result[];
   string resultHeaders;

   StringToCharArray(jsonBody, postData, 0, StringLen(jsonBody));
   ArrayResize(postData, StringLen(jsonBody)); // drop the trailing null terminator

   ResetLastError();
   int status = WebRequest("POST", url, headers, HttpTimeoutMs, postData, result, resultHeaders);

   if(status == -1)
   {
      g_lastError = "WebRequest failed, error " + IntegerToString(GetLastError()) + " - is the URL allow-listed under Tools > Options > Expert Advisors?";
      Print(g_lastError);
      g_connected = false;
      return(false);
   }

   responseBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);

   if(status < 200 || status >= 300)
   {
      g_lastError = "HTTP " + IntegerToString(status) + ": " + responseBody;
      Print(g_lastError);
      g_connected = false;
      return(false);
   }

   g_connected = true;
   return(true);
}

bool HttpGet(string path, string &responseBody)
{
   string url = BackendBaseUrl + path;
   char postData[];
   char result[];
   string resultHeaders;

   ResetLastError();
   int status = WebRequest("GET", url, "", HttpTimeoutMs, postData, result, resultHeaders);

   if(status == -1)
   {
      g_lastError = "WebRequest failed, error " + IntegerToString(GetLastError());
      Print(g_lastError);
      g_connected = false;
      return(false);
   }

   responseBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);

   if(status < 200 || status >= 300)
   {
      g_lastError = "HTTP " + IntegerToString(status) + ": " + responseBody;
      Print(g_lastError);
      g_connected = false;
      return(false);
   }

   g_connected = true;
   return(true);
}

//+------------------------------------------------------------------+
//| Minimal JSON helpers (deliberately hand-rolled: MQL5 has no       |
//| built-in JSON, and pulling in a third-party library complicates   |
//| distribution of a single-file EA). These cover exactly the fixed  |
//| shapes used by this bridge's API contract - see lib/validation/   |
//| schemas.ts on the web side for the authoritative schema.          |
//+------------------------------------------------------------------+
string JsonEscape(string s)
{
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\n", "\\n");
   StringReplace(out, "\r", "");
   return(out);
}

// Extracts a top-level string value for "key":"value" (assumes no nested
// quotes/escapes beyond what JsonEscape produces - sufficient for our
// controlled response shapes).
string JsonGetString(string json, string key)
{
   string needle = "\"" + key + "\":\"";
   int start = StringFind(json, needle);
   if(start < 0) return("");
   start += StringLen(needle);
   int end = StringFind(json, "\"", start);
   if(end < 0) return("");
   return(StringSubstr(json, start, end - start));
}

// Extracts a top-level numeric value for "key":123.45
double JsonGetNumber(string json, string key, double defaultValue = 0)
{
   string needle = "\"" + key + "\":";
   int start = StringFind(json, needle);
   if(start < 0) return(defaultValue);
   start += StringLen(needle);
   int end = start;
   int len = StringLen(json);
   while(end < len)
   {
      ushort ch = StringGetCharacter(json, end);
      if((ch >= '0' && ch <= '9') || ch == '-' || ch == '+' || ch == '.' || ch == 'e' || ch == 'E')
         end++;
      else
         break;
   }
   if(end == start) return(defaultValue);
   return(StringToDouble(StringSubstr(json, start, end - start)));
}

//+------------------------------------------------------------------+
//| Heartbeat: report balance/equity/margin/positions/symbol specs    |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   string positionsJson = "[";
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue; // only report positions this EA/bridge manages

      string symbol = PositionGetString(POSITION_SYMBOL);
      long type = PositionGetInteger(POSITION_TYPE);
      string direction = (type == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      double volume = PositionGetDouble(POSITION_VOLUME);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      double currentPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
      double profit = PositionGetDouble(POSITION_PROFIT);
      double swap = PositionGetDouble(POSITION_SWAP);
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);

      if(positionsJson != "[") positionsJson += ",";
      positionsJson += "{";
      positionsJson += "\"ticket\":\"" + IntegerToString((long)ticket) + "\",";
      positionsJson += "\"symbol\":\"" + symbol + "\",";
      positionsJson += "\"direction\":\"" + direction + "\",";
      positionsJson += "\"volume\":" + DoubleToString(volume, 2) + ",";
      positionsJson += "\"entryPrice\":" + DoubleToString(openPrice, 6) + ",";
      positionsJson += "\"stopLoss\":" + DoubleToString(sl, 6) + ",";
      positionsJson += "\"takeProfit\":" + DoubleToString(tp, 6) + ",";
      positionsJson += "\"currentPrice\":" + DoubleToString(currentPrice, 6) + ",";
      positionsJson += "\"floatingPl\":" + DoubleToString(profit, 2) + ",";
      positionsJson += "\"swap\":" + DoubleToString(swap, 2) + ",";
      positionsJson += "\"commission\":0,";
      positionsJson += "\"openTime\":\"" + TimeToIsoString(openTime) + "\"";
      positionsJson += "}";
   }
   positionsJson += "]";

   string symbolSpecsJson = BuildSymbolSpecsJson();

   string body = "{";
   body += "\"accountId\":\"" + AccountId + "\",";
   body += "\"bridgeToken\":\"" + JsonEscape(BridgeToken) + "\",";
   body += "\"eaVersion\":\"1.00\",";
   body += "\"terminalBuild\":" + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + ",";
   body += "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   body += "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   body += "\"margin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2) + ",";
   body += "\"freeMargin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
   body += "\"floatingPl\":" + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2) + ",";
   body += "\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",";
   body += "\"leverage\":" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LEVERAGE)) + ",";
   body += "\"openPositions\":" + positionsJson + ",";
   body += "\"symbolSpecs\":" + symbolSpecsJson;
   body += "}";

   string response;
   if(!HttpPost("/api/ea/heartbeat", body, response))
   {
      // Fail-safe: a failed heartbeat means the backend will soon see this
      // account's connection as stale and refuse to route new commands to
      // it. We do not retry aggressively here - the next timer tick handles it.
      return;
   }
}

// Reports symbol specs for every symbol currently in Market Watch, so the
// backend's position sizing always uses this broker's real tick size,
// tick value, contract size, min/max/step lot, and stop level - never a
// hard-coded pip value (spec section 26).
string BuildSymbolSpecsJson()
{
   string json = "[";
   int total = SymbolsTotal(true); // only symbols currently in Market Watch
   int count = 0;

   for(int i = 0; i < total && count < 50; i++)
   {
      string symbol = SymbolName(i, true);
      if(StringLen(symbol) == 0) continue;

      double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
      double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
      double contractSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      double minLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      double maxLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
      double lotStep = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
      long stopLevel = SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL);
      long digits = SymbolInfoInteger(symbol, SYMBOL_DIGITS);

      if(tickSize <= 0 || point <= 0) continue; // symbol not fully loaded yet

      if(json != "[") json += ",";
      json += "{";
      json += "\"symbol\":\"" + symbol + "\",";
      json += "\"tickSize\":" + DoubleToString(tickSize, 8) + ",";
      json += "\"tickValue\":" + DoubleToString(tickValue, 8) + ",";
      json += "\"point\":" + DoubleToString(point, 8) + ",";
      json += "\"contractSize\":" + DoubleToString(contractSize, 2) + ",";
      json += "\"minLot\":" + DoubleToString(minLot, 2) + ",";
      json += "\"maxLot\":" + DoubleToString(maxLot, 2) + ",";
      json += "\"lotStep\":" + DoubleToString(lotStep, 2) + ",";
      json += "\"stopLevelPoints\":" + IntegerToString((int)stopLevel) + ",";
      json += "\"digits\":" + IntegerToString((int)digits);
      json += "}";
      count++;
   }
   json += "]";
   return(json);
}

//+------------------------------------------------------------------+
//| Poll for pending commands and execute them                        |
//+------------------------------------------------------------------+
void PollAndExecuteCommands()
{
   string path = "/api/ea/commands?accountId=" + AccountId + "&bridgeToken=" + BridgeToken;
   string response;
   if(!HttpGet(path, response)) return;

   int pos = StringFind(response, "\"commands\":[");
   if(pos < 0) return;

   int cursor = pos + StringLen("\"commands\":[");
   if(StringGetCharacter(response, cursor) == ']') return; // no commands

   // Walk each {...} object in the commands array. This simple bracket
   // scanner is sufficient because command objects here never nest braces.
   while(true)
   {
      int objStart = StringFind(response, "{", cursor);
      if(objStart < 0) break;
      int objEnd = StringFind(response, "}", objStart);
      if(objEnd < 0) break;

      string obj = StringSubstr(response, objStart, objEnd - objStart + 1);
      ExecuteCommandFromJson(obj);

      cursor = objEnd + 1;
      if(StringGetCharacter(response, cursor) == ']') break;
   }
}

void ExecuteCommandFromJson(string obj)
{
   string commandId = JsonGetString(obj, "commandId");
   string action = JsonGetString(obj, "action");
   string symbol = JsonGetString(obj, "symbol");
   string nonce = JsonGetString(obj, "nonce");
   double volume = JsonGetNumber(obj, "volume", 0);
   double stopLoss = JsonGetNumber(obj, "stopLoss", 0);
   double takeProfit = JsonGetNumber(obj, "takeProfit", 0);

   if(StringLen(commandId) == 0) return;

   if(WasAlreadyExecuted(commandId))
   {
      Print("Skipping already-executed command ", commandId, " (nonce ", nonce, ") - idempotency guard.");
      return;
   }
   RememberExecuted(commandId);

   bool success = false;
   ulong brokerTicket = 0;
   double executionPrice = 0;
   double executedVolume = 0;
   string errorCode = "";
   string errorMessage = "";

   if(action == "BUY" || action == "SELL")
   {
      bool isBuy = (action == "BUY");
      double price = isBuy ? SymbolInfoDouble(symbol, SYMBOL_ASK) : SymbolInfoDouble(symbol, SYMBOL_BID);

      bool ok = isBuy
         ? trade.Buy(volume, symbol, price, stopLoss, takeProfit, "MT5ScalpCC:" + commandId)
         : trade.Sell(volume, symbol, price, stopLoss, takeProfit, "MT5ScalpCC:" + commandId);

      success = ok;
      if(ok)
      {
         brokerTicket = trade.ResultOrder();
         executionPrice = trade.ResultPrice();
         executedVolume = trade.ResultVolume();
      }
      else
      {
         errorCode = IntegerToString(trade.ResultRetcode());
         errorMessage = trade.ResultRetcodeDescription();
      }
   }
   else if(action == "CLOSE")
   {
      success = ClosePositionsForSymbol(symbol, errorCode, errorMessage);
   }
   else if(action == "MODIFY_SL" || action == "MODIFY_TP")
   {
      success = ModifyPositionsForSymbol(symbol, action == "MODIFY_SL" ? stopLoss : -1, action == "MODIFY_TP" ? takeProfit : -1, errorCode, errorMessage);
   }
   else if(action == "STOP_TRADING")
   {
      // No local state change needed beyond acknowledging: the backend's
      // trading_state / command polling already stops issuing new entry
      // commands. This exists as an explicit signal for auditability and
      // for any future local safety behavior you choose to add.
      success = true;
   }
   else
   {
      errorMessage = "Unknown action: " + action;
   }

   ReportTradeResult(commandId, success, brokerTicket, executionPrice, executedVolume, errorCode, errorMessage);
}

bool ClosePositionsForSymbol(string symbol, string &errorCode, string &errorMessage)
{
   bool anyClosed = false;
   bool anyFailed = false;
   int total = PositionsTotal();

   for(int i = total - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if(PositionGetString(POSITION_SYMBOL) != symbol) continue;

      if(trade.PositionClose(ticket))
      {
         anyClosed = true;
      }
      else
      {
         anyFailed = true;
         errorCode = IntegerToString(trade.ResultRetcode());
         errorMessage = trade.ResultRetcodeDescription();
      }
   }

   if(!anyClosed && !anyFailed)
   {
      errorMessage = "No open position found for " + symbol;
      return(false);
   }
   return(anyClosed && !anyFailed);
}

bool ModifyPositionsForSymbol(string symbol, double newSl, double newTp, string &errorCode, string &errorMessage)
{
   bool anyModified = false;
   int total = PositionsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if(PositionGetString(POSITION_SYMBOL) != symbol) continue;

      double sl = (newSl >= 0) ? newSl : PositionGetDouble(POSITION_SL);
      double tp = (newTp >= 0) ? newTp : PositionGetDouble(POSITION_TP);

      if(trade.PositionModify(ticket, sl, tp))
      {
         anyModified = true;
      }
      else
      {
         errorCode = IntegerToString(trade.ResultRetcode());
         errorMessage = trade.ResultRetcodeDescription();
      }
   }

   return(anyModified);
}

//+------------------------------------------------------------------+
//| Report execution result back to the backend                      |
//+------------------------------------------------------------------+
void ReportTradeResult(string commandId, bool success, ulong brokerTicket, double executionPrice, double executedVolume, string errorCode, string errorMessage)
{
   string body = "{";
   body += "\"accountId\":\"" + AccountId + "\",";
   body += "\"bridgeToken\":\"" + JsonEscape(BridgeToken) + "\",";
   body += "\"commandId\":\"" + commandId + "\",";
   body += "\"success\":" + (success ? "true" : "false") + ",";
   body += "\"brokerTicket\":" + (brokerTicket > 0 ? ("\"" + IntegerToString((long)brokerTicket) + "\"") : "null") + ",";
   body += "\"executionPrice\":" + (executionPrice > 0 ? DoubleToString(executionPrice, 6) : "null") + ",";
   body += "\"executedVolume\":" + (executedVolume > 0 ? DoubleToString(executedVolume, 2) : "null") + ",";
   body += "\"brokerErrorCode\":" + (StringLen(errorCode) > 0 ? ("\"" + JsonEscape(errorCode) + "\"") : "null") + ",";
   body += "\"brokerErrorMessage\":" + (StringLen(errorMessage) > 0 ? ("\"" + JsonEscape(errorMessage) + "\"") : "null");
   body += "}";

   string response;
   HttpPost("/api/ea/trade-result", body, response);
}

void ReportAccountStatus(bool connected, string lastError)
{
   string body = "{";
   body += "\"accountId\":\"" + AccountId + "\",";
   body += "\"bridgeToken\":\"" + JsonEscape(BridgeToken) + "\",";
   body += "\"connected\":" + (connected ? "true" : "false") + ",";
   body += "\"lastError\":" + (StringLen(lastError) > 0 ? ("\"" + JsonEscape(lastError) + "\"") : "null");
   body += "}";

   string response;
   HttpPost("/api/ea/account-status", body, response);
}

//+------------------------------------------------------------------+
//| Utilities                                                          |
//+------------------------------------------------------------------+
string TimeToIsoString(datetime t)
{
   return(TimeToString(t, TIME_DATE | TIME_SECONDS) == "" ? "" : StringFormat(
      "%04d-%02d-%02dT%02d:%02d:%02dZ",
      TimeYear(t), TimeMonth(t), TimeDay(t), TimeHour(t), TimeMinute(t), TimeSeconds(t)
   ));
}

bool WasAlreadyExecuted(string commandId)
{
   for(int i = 0; i < EXECUTED_RING_SIZE; i++)
      if(g_executedCommandIds[i] == commandId) return(true);
   return(false);
}

void RememberExecuted(string commandId)
{
   g_executedCommandIds[g_executedRingPos] = commandId;
   g_executedRingPos = (g_executedRingPos + 1) % EXECUTED_RING_SIZE;
}
//+------------------------------------------------------------------+
