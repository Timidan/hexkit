const DB_NAME = 'hexkit-workspace';
const DB_VERSION = 1;
const STORES = {
  contracts: 'deployed-contracts',
  artifacts: 'compilation-artifacts',
  transactions: 'transaction-history',
  snapshots: 'snapshots',
  watches: 'watches',
} as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put<T>(storeName: string, item: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export class WorkspaceStorageService {
  async saveDeployedContract(contract: unknown): Promise<void> {
    await put(STORES.contracts, contract);
  }

  async getDeployedContracts(): Promise<unknown[]> {
    return getAll(STORES.contracts);
  }

  async saveArtifact(artifact: unknown): Promise<void> {
    await put(STORES.artifacts, artifact);
  }

  async getArtifacts(): Promise<unknown[]> {
    return getAll(STORES.artifacts);
  }

  async saveTransaction(tx: unknown): Promise<void> {
    await put(STORES.transactions, tx);
  }

  async getTransactions(): Promise<unknown[]> {
    return getAll(STORES.transactions);
  }

  async clear(): Promise<void> {
    for (const storeName of Object.values(STORES)) {
      await clearStore(storeName);
    }
  }
}
