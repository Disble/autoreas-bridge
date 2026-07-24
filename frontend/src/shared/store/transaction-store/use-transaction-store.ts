import { useStore } from 'zustand';
import { transactionStore } from './transaction-store.helpers';
import type { TransactionStoreState } from './transaction-store.types';

/** Reads and subscribes to the transaction store, optionally through a selector. */
export function useTransactionStore<T = TransactionStoreState>(
  selector: (state: TransactionStoreState) => T = ((state: TransactionStoreState) => state as T),
): T {
  return useStore(transactionStore, selector);
}
