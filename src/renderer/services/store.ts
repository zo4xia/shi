// 删除重复的类型声明，使用全局类型定义
export interface LocalStore {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class LocalStoreService implements LocalStore {
  private buildStoreUrl(key: string): string {
    return `/api/store/${encodeURIComponent(key)}`;
  }

  private async getViaHttp<T>(key: string): Promise<T | null> {
    const response = await fetch(this.buildStoreUrl(key), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Store GET failed: ${response.status}`);
    }
    const payload = await response.json() as { success?: boolean; value?: T };
    if (payload?.success === false) {
      return null;
    }
    return payload?.value ?? null;
  }

  private async setViaHttp<T>(key: string, value: T): Promise<void> {
    const response = await fetch(this.buildStoreUrl(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!response.ok) {
      throw new Error(`Store PUT failed: ${response.status}`);
    }
  }

  private async removeViaHttp(key: string): Promise<void> {
    const response = await fetch(this.buildStoreUrl(key), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Store DELETE failed: ${response.status}`);
    }
  }

  // {埋点} 💾 KV读取 (ID: kv-read-001) window.electron.store.get(key) → GET /api/store/:key → SQLite kv表
  async getItem<T>(key: string): Promise<T | null> {
    const storeApi = window.electron?.store;
    if (!storeApi) {
      return this.getViaHttp<T>(key);
    }

    try {
      const value = await storeApi.get(key);
      if (value && typeof value === 'object' && 'success' in value) {
        const storeResult = value as { success: boolean; value?: T };
        if (!storeResult.success) {
          return null;
        }
        return storeResult.value ?? null;
      }
      return (value as T | null) ?? null;
    } catch (error) {
      console.error('Failed to get item from store:', error);
      return this.getViaHttp<T>(key);
    }
  }

  // {埋点} 💾 KV写入 (ID: kv-write-001) window.electron.store.set(key,value) → PUT /api/store/:key → SQLite kv表
  async setItem<T>(key: string, value: T): Promise<void> {
    const storeApi = window.electron?.store;
    if (!storeApi) {
      await this.setViaHttp(key, value);
      return;
    }

    try {
      await storeApi.set(key, value);
    } catch (error) {
      console.error('Failed to set item in store:', error);
      await this.setViaHttp(key, value);
    }
  }

  async removeItem(key: string): Promise<void> {
    const storeApi = window.electron?.store;
    if (!storeApi) {
      await this.removeViaHttp(key);
      return;
    }

    try {
      await storeApi.remove(key);
    } catch (error) {
      console.error('Failed to remove item from store:', error);
      await this.removeViaHttp(key);
    }
  }
}

export const localStore = new LocalStoreService(); 
