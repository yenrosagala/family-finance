import { api } from './api';
import { Asset } from '../models';

export const ASSET_TYPES = ['property', 'vehicle', 'other'] as const;
export const ASSET_TYPE_LABELS: Record<string, string> = {
  property: 'Property',
  vehicle: 'Vehicle',
  other: 'Other',
};

export async function getAssets(): Promise<Asset[]> {
  const data = await api.get<{ assets: Asset[] }>('/api/assets');
  return data.assets;
}

export interface AssetInput {
  name: string;
  type: string;
  current_value?: number;
}

export async function createAsset(input: AssetInput): Promise<Asset> {
  const data = await api.post<{ asset: Asset }>('/api/assets', input);
  return data.asset;
}

export async function updateAsset(id: string, input: Partial<AssetInput>): Promise<Asset> {
  const data = await api.put<{ asset: Asset }>(`/api/assets/${id}`, input);
  return data.asset;
}

export async function deleteAsset(id: string): Promise<void> {
  await api.del(`/api/assets/${id}`);
}
