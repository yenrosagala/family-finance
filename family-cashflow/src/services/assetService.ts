import { api } from './api';
import { Asset } from '../models';
import { isLocalMode, localUnavailable } from '../core/dataSource';

export const ASSET_TYPES = ['property', 'vehicle', 'other'] as const;
export const ASSET_TYPE_LABELS: Record<string, string> = {
  property: 'Property',
  vehicle: 'Vehicle',
  other: 'Other',
};

export async function getAssets(): Promise<Asset[]> {
  if (await isLocalMode()) return [];
  const data = await api.get<{ assets: Asset[] }>('/api/assets');
  return data.assets;
}

export interface AssetInput {
  name: string;
  type: string;
  current_value?: number;
}

export async function createAsset(input: AssetInput): Promise<Asset> {
  if (await isLocalMode()) throw localUnavailable('Assets');
  const data = await api.post<{ asset: Asset }>('/api/assets', input);
  return data.asset;
}

export async function updateAsset(id: string, input: Partial<AssetInput>): Promise<Asset> {
  if (await isLocalMode()) throw localUnavailable('Assets');
  const data = await api.put<{ asset: Asset }>(`/api/assets/${id}`, input);
  return data.asset;
}

export async function deleteAsset(id: string): Promise<void> {
  if (await isLocalMode()) throw localUnavailable('Assets');
  await api.del(`/api/assets/${id}`);
}
