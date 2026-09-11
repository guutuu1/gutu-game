# Gutu Game — Production Starter

This is the first real server-side foundation: users, password hashing, JWT sessions, wallet ledger tables, game records, admin authentication, user controls and audit logs.

## Run
1. Install Node.js 18+.
2. Copy `.env.example` to `.env` and set strong secrets and ADMIN_PASSWORD.
3. `npm install`
4. `npm start`
5. Open `http://localhost:3000`.

## Important
The real-money game endpoint is deliberately disabled. Current 2026 public reporting says the Ethiopian Lottery Service has warned that no sports-betting operator currently has a legal Ethiopian licence, so deposits/wagers/withdrawals must not be activated until the applicable authorisation is confirmed. The Ministry of Justice still publishes the Sports Betting Lottery Licensing Directive 856/2014, and MOTRI publishes the commercial licensing framework.

Before production: add HTTPS, PostgreSQL, secret management, rate limits, KYC/age controls, responsible-gaming controls, payment-provider contracts, reconciliation, fraud monitoring, penetration testing, independent RNG/game certification where applicable, backups, and a compliance review.
