import type { PluggyClient } from 'pluggy-sdk';
import type { Config } from '../../config/config.types';
import type { Database } from '../../app/database/database.types';
import type { FinanceRepository } from '../finance.repository';
import { createLogger } from '../../shared/logger/logger';
import { getPluggyClient } from './pluggy-auth';

const logger = createLogger({ namespace: 'finance:sync' });

export function createPluggySyncService({ config, db, financeRepository }: {
  config: Config;
  db: Database;
  financeRepository: FinanceRepository;
}) {
  const pluggyClient = getPluggyClient({
    clientId: config.finance.pluggy.clientId,
    clientSecret: config.finance.pluggy.clientSecret,
  });

  return {
    syncItem: (args: { itemId: string; organizationId: string }) =>
      syncItem({ ...args, pluggyClient, financeRepository }),
    syncAllItems: (args: { organizationId: string }) =>
      syncAllItems({ ...args, pluggyClient, financeRepository }),
  };
}

async function syncItem({
  itemId,
  organizationId,
  pluggyClient,
  financeRepository,
}: {
  itemId: string;
  organizationId: string;
  pluggyClient: PluggyClient;
  financeRepository: FinanceRepository;
}) {
  logger.info({ itemId, organizationId }, 'Starting sync for item');

  let totalTransactionsCount = 0;

  try {
    // 1. Fetch accounts from Pluggy
    const accountsResponse = await pluggyClient.fetchAccounts(itemId);
    const pluggyAccounts = accountsResponse.results;

    // 2. Upsert each account and sync its transactions/bills
    for (const pluggyAccount of pluggyAccounts) {
      const closingDay = pluggyAccount.creditData?.balanceCloseDate
        ? new Date(pluggyAccount.creditData.balanceCloseDate).getDate()
        : null;
      const dueDay = pluggyAccount.creditData?.balanceDueDate
        ? new Date(pluggyAccount.creditData.balanceDueDate).getDate()
        : null;

      const { account } = await financeRepository.upsertAccount({
        itemId,
        organizationId,
        account: {
          pluggyAccountId: pluggyAccount.id,
          type: pluggyAccount.type,
          subtype: pluggyAccount.subtype ?? null,
          name: pluggyAccount.name,
          balance: pluggyAccount.balance,
          currencyCode: pluggyAccount.currencyCode ?? null,
          creditLimit: pluggyAccount.creditData?.creditLimit ?? null,
          availableCreditLimit: pluggyAccount.creditData?.availableCreditLimit ?? null,
          closingDay,
          dueDay,
        },
      });

      // 3. Fetch all transactions for this account (returns Transaction[] directly)
      const transactions = await pluggyClient.fetchAllTransactions(pluggyAccount.id);
      totalTransactionsCount += transactions.length;

      // 4. Upsert each transaction
      for (const tx of transactions) {
        await financeRepository.upsertTransaction({
          accountId: account.id,
          organizationId,
          transaction: {
            pluggyTransactionId: tx.id,
            description: tx.description,
            amount: tx.amount,
            date: new Date(tx.date),
            type: tx.type,
            status: tx.status ?? 'POSTED',
            pluggyCategoryId: tx.categoryId ?? null,
            installmentNumber: tx.creditCardMetadata?.installmentNumber ?? null,
            totalInstallments: tx.creditCardMetadata?.totalInstallments ?? null,
            totalAmount: tx.creditCardMetadata?.totalAmount ?? null,
            purchaseDate: tx.creditCardMetadata?.purchaseDate
              ? new Date(tx.creditCardMetadata.purchaseDate)
              : null,
            billId: tx.creditCardMetadata?.billId ?? null,
            merchantName: tx.merchant?.name ?? null,
            merchantCnpj: tx.merchant?.cnpj ?? null,
            paymentMethod: tx.paymentData?.paymentMethod ?? null,
          },
        });
      }

      // 5. For CREDIT accounts, fetch bills
      if (pluggyAccount.type === 'CREDIT') {
        try {
          const billsResponse = await pluggyClient.fetchCreditCardBills(pluggyAccount.id);
          for (const bill of billsResponse.results) {
            await financeRepository.upsertBill({
              accountId: account.id,
              organizationId,
              bill: {
                pluggyBillId: bill.id,
                dueDate: new Date(bill.dueDate),
                totalAmount: bill.totalAmount,
                minimumPayment: bill.minimumPaymentAmount ?? null,
                status: 'OPEN',
              },
            });
          }
        }
        catch (error) {
          logger.warn({ error, accountId: pluggyAccount.id }, 'Failed to fetch credit card bills for account');
        }
      }
    }

    // 6. Fetch investments
    try {
      const investmentsResponse = await pluggyClient.fetchInvestments(itemId);
      for (const investment of investmentsResponse.results) {
        await financeRepository.upsertInvestment({
          itemId,
          organizationId,
          investment: {
            pluggyInvestmentId: investment.id,
            name: investment.name,
            type: investment.type ?? null,
            subtype: investment.subtype ?? null,
            code: investment.code ?? null,
            balance: investment.balance,
            amount: investment.amount ?? null,
            amountOriginal: investment.amountOriginal ?? null,
            amountProfit: investment.amountProfit ?? null,
            lastMonthRate: investment.lastMonthRate ?? null,
            lastTwelveMonthsRate: investment.lastTwelveMonthsRate ?? null,
            annualRate: investment.annualRate ?? null,
            currencyCode: investment.currencyCode ?? null,
            dueDate: investment.dueDate ? new Date(investment.dueDate) : null,
            quantity: investment.quantity ?? null,
            value: investment.value ?? null,
          },
        });
      }
    }
    catch (error) {
      logger.warn({ error, itemId }, 'Failed to fetch investments for item');
    }

    // 7. Fetch categories
    try {
      const categoriesResponse = await pluggyClient.fetchCategories();
      for (const category of categoriesResponse.results) {
        await financeRepository.upsertCategory({
          organizationId,
          pluggyCategoryId: category.id,
          name: category.description,
          parentId: null,
        });
      }
    }
    catch (error) {
      logger.warn({ error }, 'Failed to fetch categories');
    }

    // 8. Update item sync status to UPDATED and create SUCCESS log
    await financeRepository.updateItemSyncStatus({
      id: itemId,
      status: 'UPDATED',
      lastSyncAt: new Date(),
    });

    await financeRepository.createSyncLog({
      itemId,
      organizationId,
      status: 'SUCCESS',
      transactionsCount: totalTransactionsCount,
    });

    logger.info({ itemId, organizationId, totalTransactionsCount }, 'Sync completed successfully');
  }
  catch (error) {
    // 9. On error: set item status to ERROR, create FAILED log, throw
    logger.error({ error, itemId, organizationId }, 'Sync failed for item');

    await financeRepository.updateItemSyncStatus({
      id: itemId,
      status: 'ERROR',
    });

    await financeRepository.createSyncLog({
      itemId,
      organizationId,
      status: 'FAILED',
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

async function syncAllItems({
  organizationId,
  pluggyClient,
  financeRepository,
}: {
  organizationId: string;
  pluggyClient: PluggyClient;
  financeRepository: FinanceRepository;
}) {
  logger.info({ organizationId }, 'Starting sync for all items in org');

  const { items } = await financeRepository.listItems({ organizationId });

  for (const item of items) {
    try {
      await syncItem({
        itemId: item.id,
        organizationId,
        pluggyClient,
        financeRepository,
      });
    }
    catch (error) {
      // Continue with other items even if one fails
      logger.error({ error, itemId: item.id, organizationId }, 'Failed to sync item, continuing with others');
    }
  }

  logger.info({ organizationId, itemCount: items.length }, 'Finished syncing all items');
}
