import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const financeMigration = {
  name: 'finance',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_items" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "pluggy_item_id" text NOT NULL,
          "connector_name" text NOT NULL,
          "status" text NOT NULL DEFAULT 'UPDATED',
          "last_sync_at" integer
        )
      `),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "finance_items_org_pluggy_item_unique" ON "finance_items" ("organization_id","pluggy_item_id")`),

      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_accounts" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "item_id" text NOT NULL REFERENCES "finance_items"("id") ON DELETE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "pluggy_account_id" text NOT NULL,
          "type" text NOT NULL,
          "subtype" text,
          "name" text NOT NULL,
          "balance" real NOT NULL DEFAULT 0,
          "currency_code" text DEFAULT 'BRL',
          "credit_limit" real,
          "available_credit_limit" real,
          "closing_day" integer,
          "due_day" integer
        )
      `),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "finance_accounts_org_pluggy_acc_unique" ON "finance_accounts" ("organization_id","pluggy_account_id")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "finance_accounts_org_type_index" ON "finance_accounts" ("organization_id","type")`),

      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_categories" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "pluggy_category_id" text,
          "name" text NOT NULL,
          "parent_id" text,
          "is_custom" integer NOT NULL DEFAULT 0
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "finance_categories_org_index" ON "finance_categories" ("organization_id")`),

      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_transactions" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "account_id" text NOT NULL REFERENCES "finance_accounts"("id") ON DELETE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "pluggy_transaction_id" text NOT NULL,
          "description" text NOT NULL,
          "amount" real NOT NULL,
          "date" integer NOT NULL,
          "type" text NOT NULL,
          "status" text NOT NULL DEFAULT 'POSTED',
          "category_id" text REFERENCES "finance_categories"("id") ON DELETE SET NULL,
          "pluggy_category_id" text,
          "installment_number" integer,
          "total_installments" integer,
          "total_amount" real,
          "purchase_date" integer,
          "bill_id" text,
          "merchant_name" text,
          "merchant_cnpj" text,
          "payment_method" text
        )
      `),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "finance_txn_org_pluggy_txn_unique" ON "finance_transactions" ("organization_id","pluggy_transaction_id")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "finance_txn_org_date_index" ON "finance_transactions" ("organization_id","date")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "finance_txn_account_date_index" ON "finance_transactions" ("account_id","date")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "finance_txn_org_category_index" ON "finance_transactions" ("organization_id","category_id")`),

      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_bills" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "account_id" text NOT NULL REFERENCES "finance_accounts"("id") ON DELETE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "pluggy_bill_id" text NOT NULL,
          "due_date" integer NOT NULL,
          "total_amount" real NOT NULL,
          "minimum_payment" real,
          "status" text NOT NULL DEFAULT 'OPEN'
        )
      `),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "finance_bills_org_pluggy_bill_unique" ON "finance_bills" ("organization_id","pluggy_bill_id")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "finance_bills_account_due_index" ON "finance_bills" ("account_id","due_date")`),

      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_investments" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "item_id" text NOT NULL REFERENCES "finance_items"("id") ON DELETE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "pluggy_investment_id" text NOT NULL,
          "name" text NOT NULL,
          "type" text,
          "subtype" text,
          "code" text,
          "balance" real NOT NULL DEFAULT 0,
          "amount" real,
          "amount_original" real,
          "amount_profit" real,
          "last_month_rate" real,
          "last_twelve_months_rate" real,
          "annual_rate" real,
          "currency_code" text DEFAULT 'BRL',
          "due_date" integer,
          "quantity" real,
          "value" real
        )
      `),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "finance_inv_org_pluggy_inv_unique" ON "finance_investments" ("organization_id","pluggy_investment_id")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "finance_inv_org_type_index" ON "finance_investments" ("organization_id","type")`),

      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_category_rules" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "category_id" text NOT NULL REFERENCES "finance_categories"("id") ON DELETE CASCADE,
          "pattern" text NOT NULL,
          "field" text NOT NULL DEFAULT 'description',
          "priority" integer NOT NULL DEFAULT 0
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "finance_cat_rules_org_priority_index" ON "finance_category_rules" ("organization_id","priority")`),

      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_budgets" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "category_id" text REFERENCES "finance_categories"("id") ON DELETE CASCADE,
          "amount" real NOT NULL,
          "financial_month" text NOT NULL
        )
      `),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "finance_budgets_org_cat_month_unique" ON "finance_budgets" ("organization_id","category_id","financial_month")`),

      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_sync_log" (
          "id" text PRIMARY KEY NOT NULL,
          "item_id" text NOT NULL REFERENCES "finance_items"("id") ON DELETE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "synced_at" integer NOT NULL,
          "status" text NOT NULL,
          "transactions_count" integer DEFAULT 0,
          "error" text
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "finance_sync_log_item_synced_index" ON "finance_sync_log" ("item_id","synced_at")`),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TABLE IF EXISTS "finance_sync_log"`),
      db.run(sql`DROP TABLE IF EXISTS "finance_budgets"`),
      db.run(sql`DROP TABLE IF EXISTS "finance_category_rules"`),
      db.run(sql`DROP TABLE IF EXISTS "finance_investments"`),
      db.run(sql`DROP TABLE IF EXISTS "finance_bills"`),
      db.run(sql`DROP TABLE IF EXISTS "finance_transactions"`),
      db.run(sql`DROP TABLE IF EXISTS "finance_categories"`),
      db.run(sql`DROP TABLE IF EXISTS "finance_accounts"`),
      db.run(sql`DROP TABLE IF EXISTS "finance_items"`),
    ]);
  },
} satisfies Migration;
