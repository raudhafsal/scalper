# EA Setup — `MT5_Scalp_Bridge.mq5`

The bridge Expert Advisor is a thin client: it authenticates, reports
account/position state, polls for already-risk-approved commands, and
executes them. It never decides on its own to open a trade — see
`docs/ARCHITECTURE.md` for why.

Prerequisites: you've completed `docs/MT5_SETUP.md` steps 1–4 (MT5
installed, logged into an account, WebRequest allow-listed, and the
account already added in the web app so you have its `AccountId` and
bridge token).

## 1. Copy the file in

1. In MT5: **File → Open Data Folder**. This opens the terminal's data
   directory in Explorer/Finder.
2. Navigate to `MQL5/Experts/`.
3. Copy `mt5/MT5_Scalp_Bridge.mq5` from this repository into that folder.
4. Back in MT5, open **Navigator** (Ctrl+N), right-click **Expert
   Advisors**, choose **Refresh**. `MT5_Scalp_Bridge` should appear.

## 2. Compile

1. Open the file in **MetaEditor** (double-click it in the Navigator, or
   F4 from MT5).
2. Press **Compile** (F7). It should compile with 0 errors — the EA has no
   external library dependencies beyond the standard `<Trade\Trade.mqh>`
   that ships with every MT5 installation, and hand-rolls its own minimal
   JSON encode/decode so it doesn't need any third-party include.

## 3. Attach to a chart

1. Open a chart for **any one symbol** — the EA polls for commands across
   whatever symbols your strategy/account settings allow, it does not need
   a chart per symbol, just one chart to host the EA process for this
   account.
2. Drag `MT5_Scalp_Bridge` from the Navigator onto the chart.
3. In the **Inputs** tab, set:

   | Input | Value |
   |---|---|
   | `BackendBaseUrl` | Your web app's URL, e.g. `https://your-app.vercel.app` (no trailing slash) |
   | `AccountId` | The UUID shown in the web app when you added this account |
   | `BridgeToken` | The bridge token shown once when you added this account |
   | `HeartbeatSeconds` | How often to report balance/equity/positions (default 10) |
   | `PollSeconds` | How often to check for new approved commands (default 3) |
   | `HttpTimeoutMs` | WebRequest timeout (default 5000) |
   | `MagicNumber` | Order magic number for trades this EA places (default 990011 — change only if it collides with another EA on the same account) |
   | `SlippagePoints` | Max acceptable slippage in points (default 20) |

4. On the **Common** tab, make sure **Allow Algo Trading** is checked for
   this instance.
5. Click **OK**. You should see a smiley-face icon in the top-right of the
   chart once it's running with algo trading enabled globally (toolbar
   button) and for this EA.

## 4. What the EA actually does, in order

- `OnInit()` — validates inputs are non-empty, initializes `CTrade` with
  the configured magic number/slippage.
- `OnTimer()` — fires on a 1-second timer and, based on elapsed time,
  triggers `SendHeartbeat()` (every `HeartbeatSeconds`) and
  `PollAndExecuteCommands()` (every `PollSeconds`).
- `SendHeartbeat()` → `POST /api/ea/heartbeat` — reports balance, equity,
  margin, free margin, open positions, and (via
  `BuildSymbolSpecsJson()`) each traded symbol's tick size/value, contract
  size, min/max/step lot, and stop-level distance, which the risk engine
  uses for accurate position sizing.
- `PollAndExecuteCommands()` → `GET /api/ea/commands?accountId=...&bridgeToken=...`
  — fetches any commands the backend has approved and marked `SENT` for
  this account, then calls `ExecuteCommandFromJson()` for each.
- `ExecuteCommandFromJson()` — checks the command ID against a local
  in-memory ring buffer (`g_executedCommandIds`) before doing anything, so
  a duplicate delivery is never executed twice locally, even before the
  server-side `(account_id, nonce)` uniqueness constraint would catch it.
  Then dispatches to BUY/SELL (via `CTrade`), `CLOSE`
  (`ClosePositionsForSymbol()`), or `MODIFY_SL`/`MODIFY_TP`
  (`ModifyPositionsForSymbol()`).
- `ReportTradeResult()` → `POST /api/ea/trade-result` — reports the
  outcome (filled/rejected/error, broker ticket, fill price) back to the
  backend, which is itself idempotent server-side.
- `ReportAccountStatus()` → `POST /api/ea/account-status` — used on
  reconnect/resync to reconcile local MT5 state with what the backend
  believes is open.

The EA **never** places an order that didn't come from a polled, approved
command. If it can't reach the backend (network error, bad token, backend
down), it does nothing new — it does not fall back to any local decision
logic. This is intentional (spec section 45, fail-safe defaults).

## 5. Multiple accounts on one machine

Run multiple MT5 terminal instances (one install can be copied to multiple
folders, each logged into a different account) and attach the EA once per
terminal, each with its own `AccountId`/`BridgeToken`. Do not attach the
EA twice with the same `AccountId` on two different terminals — the
backend has no way to know which one is authoritative and both would
receive and race to execute the same commands.

## 6. Verifying it's working

- The **Experts** tab (Toolbox, Ctrl+T) in MT5 shows the EA's log output —
  confirm you see periodic "heartbeat sent" / "poll ok" style lines and no
  repeated WebRequest errors.
- In the web app's **Accounts** page, the account card should show
  `🟢 CONNECTED` and a recent "Last heartbeat" time within a few seconds of
  `HeartbeatSeconds`.
- Try a controlled test in **PAPER mode** first (`docs/PAPER_TRADING.md`)
  — paper mode never sends a real order to the EA at all, so it's safe to
  validate the whole pipeline before the EA ever executes anything real.

See `docs/TROUBLESHOOTING.md` for common EA connection issues (WebRequest
not allow-listed is by far the most common).
